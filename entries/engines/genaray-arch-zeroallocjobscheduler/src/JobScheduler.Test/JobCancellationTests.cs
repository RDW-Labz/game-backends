using NUnit.Framework;
using Schedulers.Utils;

namespace Schedulers.Test;

internal class JobCancellationTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    private struct CountingStructJob : IJob
    {
        public int[] Executions;

        public void Execute()
        {
            Interlocked.Increment(ref Executions[0]);
        }
    }

    private struct SlowParallelFor : IJobParallelFor
    {
        public int[] Executions;

        public void Execute(int index)
        {
            Interlocked.Increment(ref Executions[0]);
            Thread.Sleep(1);
        }
    }

    /// <summary>
    ///     Waiting returns as soon as the last job is finished, while the worker may still be recycling its handle, which is when
    ///     its cancellation request is forgotten. So give it a moment.
    /// </summary>
    private static void AssertNoCancellationRequestsLeft()
    {
        var deadline = DateTime.UtcNow + Timeout;
        while (JobHandle.Pool.CancelledCount != 0 && DateTime.UtcNow < deadline)
        {
            Thread.Sleep(1);
        }

        Assert.That(JobHandle.Pool.CancelledCount, Is.Zero);
    }

    /// <summary>
    ///     Runs the action on another thread, so that a hang fails the test instead of blocking the test run.
    /// </summary>
    private static void AssertReturnsInTime(Action action)
    {
        var task = Task.Run(action);
        Assert.That(task.Wait(Timeout), Is.True, "waiting for the jobs never returned");
    }

    [Test]
    public void CancelledJob_IsNotExecuted_ButWaitingForItReturns()
    {
        using var jobScheduler = new JobScheduler();
        var executed = false;

        var handle = jobScheduler.Schedule(new TestJob(0, () => executed = true));
        Assert.That(jobScheduler.Cancel(handle), Is.True);
        Assert.That(jobScheduler.IsCancelled(handle), Is.True);
        jobScheduler.Flush(handle);

        AssertReturnsInTime(() => jobScheduler.Wait(handle));
        Assert.That(executed, Is.False);
        Assert.That(handle.IsFinished, Is.True);
    }

    [Test]
    public void Cancel_OfAFinishedJob_DoesNothing()
    {
        using var jobScheduler = new JobScheduler();

        var handle = jobScheduler.Schedule(new TestJob(0));
        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);

        Assert.That(jobScheduler.Cancel(handle), Is.False);
        Assert.That(jobScheduler.IsCancelled(handle), Is.False);
    }

    [Test]
    public void Cancel_TwiceIsHarmless()
    {
        using var jobScheduler = new JobScheduler();

        var handle = jobScheduler.Schedule(new TestJob(0));

        Assert.That(jobScheduler.Cancel(handle), Is.True);
        Assert.That(jobScheduler.Cancel(handle), Is.True);
        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);
        AssertNoCancellationRequestsLeft();
    }

    [Test]
    public void RunningJob_CanSeeItsCancellationAndStopEarly()
    {
        using var jobScheduler = new JobScheduler();
        using var started = new ManualResetEventSlim();
        var iterations = 0;
        JobHandle handle = default;

        handle = jobScheduler.Schedule(new TestJob(0, () =>
        {
            started.Set();
            while (!jobScheduler.IsCancelled(handle))
            {
                Interlocked.Increment(ref iterations);
                Thread.Sleep(1);
            }
        }));
        jobScheduler.Flush(handle);
        Assert.That(started.Wait(Timeout), Is.True);

        jobScheduler.Cancel(handle);

        AssertReturnsInTime(() => jobScheduler.Wait(handle));
    }

    [Test]
    public void CancellingTheParent_SkipsItsChildrenThatHaveNotStarted()
    {
        using var jobScheduler = new JobScheduler();
        var executions = new int[1];

        var parent = jobScheduler.Schedule(new TestJob(0));
        var children = new JobHandle[100];
        for (var i = 0; i < children.Length; i++)
        {
            children[i] = jobScheduler.Schedule(new CountingStructJob { Executions = executions }, parent);
        }

        jobScheduler.Cancel(parent);
        jobScheduler.Flush(parent);
        jobScheduler.Flush(children.AsSpan());

        AssertReturnsInTime(() => jobScheduler.Wait(parent));
        Assert.That(executions[0], Is.Zero);
    }

    [Test]
    public void CancellingAJob_CancelsEverythingThatDependsOnIt()
    {
        using var jobScheduler = new JobScheduler();
        var executions = new int[1];

        var first = jobScheduler.Schedule(new CountingStructJob { Executions = executions });
        var second = jobScheduler.Schedule(new CountingStructJob { Executions = executions });
        var third = jobScheduler.Schedule(new CountingStructJob { Executions = executions });
        jobScheduler.AddDependency(second, first);
        jobScheduler.AddDependency(third, second);

        jobScheduler.Cancel(first);
        jobScheduler.Flush(first);

        AssertReturnsInTime(() => jobScheduler.Wait(third));
        Assert.That(executions[0], Is.Zero);
    }

    [Test]
    public void AJobThatDependsOnACancelledAndAnotherJob_IsCancelled()
    {
        using var jobScheduler = new JobScheduler();
        var executions = new int[1];

        var cancelled = jobScheduler.Schedule(new TestJob(0));
        var other = jobScheduler.Schedule(new CountingStructJob { Executions = executions });
        var dependent = jobScheduler.Schedule(new CountingStructJob { Executions = executions });
        jobScheduler.AddDependency(dependent, cancelled);
        jobScheduler.AddDependency(dependent, other);

        jobScheduler.Cancel(cancelled);
        jobScheduler.Flush(cancelled);
        jobScheduler.Flush(other);

        AssertReturnsInTime(() => jobScheduler.Wait(dependent));
        Assert.That(executions[0], Is.EqualTo(1), "only the other job runs");
    }

    [Test]
    public void CancelledJobs_AreNotReportedAsFailures()
    {
        using var jobScheduler = new JobScheduler();

        var handle = jobScheduler.Schedule(new TestJob(0, () => throw new InvalidOperationException("never executed")));
        jobScheduler.Cancel(handle);
        jobScheduler.Flush(handle);

        Assert.DoesNotThrow(() => jobScheduler.Wait(handle));
    }

    [Test]
    public void CancelledParallelFor_StopsBeforeItProcessedEverything()
    {
        using var jobScheduler = new JobScheduler();
        var executions = new int[1];
        const int Count = 100_000;

        var handle = jobScheduler.ScheduleParallelFor(new SlowParallelFor { Executions = executions }, Count, batchSize: 4);
        jobScheduler.Flush(handle);
        Thread.Sleep(50);

        jobScheduler.Cancel(handle);

        AssertReturnsInTime(() => jobScheduler.Wait(handle));
        Assert.That(executions[0], Is.GreaterThan(0));
        Assert.That(executions[0], Is.LessThan(Count));
    }

    [Test]
    public void CancelledParallelFor_BeforeItStarted_ExecutesNothing()
    {
        using var jobScheduler = new JobScheduler();
        var executions = new int[1];

        var handle = jobScheduler.ScheduleParallelFor(new SlowParallelFor { Executions = executions }, 10_000);
        jobScheduler.Cancel(handle);
        jobScheduler.Flush(handle);

        AssertReturnsInTime(() => jobScheduler.Wait(handle));
        Assert.That(executions[0], Is.Zero);
    }

    [Test]
    public void CancellationRequests_AreForgottenOnceTheJobsFinished()
    {
        using var jobScheduler = new JobScheduler();

        for (var round = 0; round < 100; round++)
        {
            var parent = jobScheduler.Schedule(new TestJob(0));
            var child = jobScheduler.Schedule(new TestJob(1), parent);
            var dependent = jobScheduler.Schedule(new TestJob(2));
            jobScheduler.AddDependency(dependent, parent);

            jobScheduler.Cancel(parent);
            jobScheduler.Cancel(child);
            jobScheduler.Flush(parent);
            jobScheduler.Flush(child);
            jobScheduler.Wait(dependent);
        }

        AssertNoCancellationRequestsLeft();
    }

    [Test]
    public void CancelledJobsAreNotExecutedLater_WhenTheirSlotIsReused()
    {
        using var jobScheduler = new JobScheduler();
        var executions = new int[1];

        var cancelled = jobScheduler.Schedule(new TestJob(0));
        jobScheduler.Cancel(cancelled);
        jobScheduler.Flush(cancelled);
        jobScheduler.Wait(cancelled);

        for (var i = 0; i < 1_000; i++)
        {
            var handle = jobScheduler.Schedule(new CountingStructJob { Executions = executions });
            jobScheduler.Flush(handle);
            jobScheduler.Wait(handle);
        }

        Assert.That(executions[0], Is.EqualTo(1_000), "the slot of the cancelled job must not inherit its cancellation");
    }

    [Test]
    public void CancellingWhileJobsRun_NeverHangsOrLosesJobs()
    {
        using var jobScheduler = new JobScheduler();

        const int Jobs = 5_000;
        var executed = 0;
        var handles = new JobHandle[Jobs];
        for (var i = 0; i < Jobs; i++)
        {
            handles[i] = jobScheduler.Schedule(new TestJob(i, () => Interlocked.Increment(ref executed)));
        }

        var canceller = Task.Run(() =>
        {
            var random = new Random(1);
            for (var i = 0; i < Jobs; i++)
            {
                if (random.Next(2) == 0)
                {
                    jobScheduler.Cancel(handles[i]);
                }
            }
        });

        jobScheduler.Flush(handles.AsSpan());

        AssertReturnsInTime(() => jobScheduler.Wait(handles.AsSpan()));
        Assert.That(canceller.Wait(Timeout), Is.True);
        Assert.That(executed, Is.InRange(1, Jobs));
        AssertNoCancellationRequestsLeft();
    }
}
