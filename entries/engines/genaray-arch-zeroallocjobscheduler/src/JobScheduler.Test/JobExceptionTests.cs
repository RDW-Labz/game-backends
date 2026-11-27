using System.Collections.Concurrent;
using NUnit.Framework;
using Schedulers.Utils;

namespace Schedulers.Test;

/// <summary>
///     A job that throws must neither kill its worker nor leave anything waiting for it forever.
/// </summary>
internal class JobExceptionTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    private static TestJob FailingJob(string message = "boom")
    {
        return new TestJob(0, () => throw new InvalidOperationException(message));
    }

    private struct FailingParallelFor : IJobParallelFor
    {
        public int FailingIndex;

        public void Execute(int index)
        {
            if (index == FailingIndex)
            {
                throw new InvalidOperationException("boom");
            }
        }
    }

#pragma warning disable CS0618 // The legacy producer is tested on purpose.
    private struct SingleOnlyProducer : IParallelJobProducer
    {
        public void RunSingle(int index)
        {
        }
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
    public void Wait_ThrowsTheExceptionOfAFailedJob()
    {
        using var jobScheduler = new JobScheduler();

        var handle = jobScheduler.Schedule(FailingJob("something went wrong"));
        jobScheduler.Flush(handle);

        var exception = Assert.Throws<AggregateException>(() => jobScheduler.Wait(handle));
        Assert.That(exception!.InnerExceptions, Has.Count.EqualTo(1));
        Assert.That(exception.InnerException, Is.TypeOf<InvalidOperationException>());
        Assert.That(exception.InnerException!.Message, Is.EqualTo("something went wrong"));
    }

    [Test]
    public void Wait_ThrowsTheExceptionOnlyOnce()
    {
        using var jobScheduler = new JobScheduler();

        var handle = jobScheduler.Schedule(FailingJob());
        jobScheduler.Flush(handle);
        Assert.Throws<AggregateException>(() => jobScheduler.Wait(handle));

        var next = jobScheduler.Schedule(new TestJob(1));
        jobScheduler.Flush(next);

        Assert.DoesNotThrow(() => jobScheduler.Wait(next));
    }

    [Test]
    public void FailingJobsOnWorkers_DoNotKillTheWorkers()
    {
        using var jobScheduler = new JobScheduler();

        const int FailingJobs = 22;
        for (var i = 0; i < FailingJobs; i++)
        {
            jobScheduler.Flush(jobScheduler.Schedule(FailingJob()));
        }

        // Gives the workers, not this thread, the chance to run the jobs.
        Thread.Sleep(300);

        var marker = jobScheduler.Schedule(new TestJob(0));
        jobScheduler.Flush(marker);
        var exception = Assert.Throws<AggregateException>(() => jobScheduler.Wait(marker));
        Assert.That(exception!.InnerExceptions, Has.Count.EqualTo(FailingJobs));

        var executed = 0;
        var handles = new JobHandle[1_000];
        for (var i = 0; i < handles.Length; i++)
        {
            handles[i] = jobScheduler.Schedule(new TestJob(i, () => Interlocked.Increment(ref executed)));
        }

        jobScheduler.Flush(handles.AsSpan());
        jobScheduler.Wait(handles.AsSpan());
        Assert.That(executed, Is.EqualTo(handles.Length));
    }

    [Test]
    public void Wait_ReturnsWhenAChildOfTheParentFails()
    {
        using var jobScheduler = new JobScheduler();

        var parent = jobScheduler.Schedule(new TestJob(0));
        var failingChild = jobScheduler.Schedule(FailingJob(), parent);
        var child = jobScheduler.Schedule(new TestJob(1), parent);
        jobScheduler.Flush(parent);
        jobScheduler.Flush(failingChild);
        jobScheduler.Flush(child);

        AssertReturnsInTime(() => Assert.Throws<AggregateException>(() => jobScheduler.Wait(parent)));
    }

    [Test]
    public void Jobs_DependingOnAFailedJob_StillRun()
    {
        using var jobScheduler = new JobScheduler();

        var dependentRan = false;
        var failing = jobScheduler.Schedule(FailingJob());
        var dependent = jobScheduler.Schedule(new TestJob(1, () => dependentRan = true));
        jobScheduler.AddDependency(dependent, failing);
        jobScheduler.Flush(failing);

        AssertReturnsInTime(() => Assert.Throws<AggregateException>(() => jobScheduler.Wait(dependent)));
        Assert.That(dependentRan, Is.True);
    }

    [Test]
    public void ParallelFor_WithAFailingIndex_ReportsItAndKeepsWorking()
    {
        using var jobScheduler = new JobScheduler();

        var handle = jobScheduler.ScheduleParallelFor(new FailingParallelFor { FailingIndex = 500 }, 10_000);
        jobScheduler.Flush(handle);
        AssertReturnsInTime(() => Assert.Throws<AggregateException>(() => jobScheduler.Wait(handle)));

        var hits = new int[10_000];
        var next = jobScheduler.ScheduleParallelFor(new ParallelForTestsJob { Hits = hits }, hits.Length);
        jobScheduler.Flush(next);
        jobScheduler.Wait(next);

        Assert.That(hits, Has.All.EqualTo(1));
    }

    [Test]
    public void ParallelProducer_WithoutRunVectorized_ExplainsWhatIsMissing()
    {
        using var jobScheduler = new JobScheduler();

        var producer = new ParallelJobProducer<SingleOnlyProducer>(10_000, new SingleOnlyProducer(), jobScheduler);

        var exception = Assert.Throws<AggregateException>(() => jobScheduler.Wait(producer.GetHandle()));
        Assert.That(exception!.InnerException, Is.TypeOf<NotImplementedException>());
        Assert.That(exception.InnerException!.Message, Does.Contain("onlySingle"));
    }

    [Test]
    public void Handler_ReceivesTheExceptions_AndWaitDoesNotThrow()
    {
        using var jobScheduler = new JobScheduler();
        var received = new ConcurrentBag<Exception>();
        jobScheduler.JobExceptionHandler = received.Add;

        var handle = jobScheduler.Schedule(FailingJob("handled"));
        jobScheduler.Flush(handle);

        Assert.DoesNotThrow(() => jobScheduler.Wait(handle));
        Assert.That(received, Has.Count.EqualTo(1));
        Assert.That(received.Single().Message, Is.EqualTo("handled"));
    }

    [Test]
    public void Handler_ThatThrows_HasItsExceptionThrownByWait()
    {
        using var jobScheduler = new JobScheduler();
        jobScheduler.JobExceptionHandler = _ => throw new ArgumentException("the handler failed");

        var handle = jobScheduler.Schedule(FailingJob());
        jobScheduler.Flush(handle);

        var exception = Assert.Throws<AggregateException>(() => jobScheduler.Wait(handle));
        Assert.That(exception!.InnerException, Is.TypeOf<ArgumentException>());
    }

    [Test]
    public void Wait_OnlyKeepsTheFirstExceptionsOfManyFailures()
    {
        using var jobScheduler = new JobScheduler();

        const int FailingJobs = 100;
        var handles = new JobHandle[FailingJobs];
        for (var i = 0; i < FailingJobs; i++)
        {
            handles[i] = jobScheduler.Schedule(FailingJob());
        }

        jobScheduler.Flush(handles.AsSpan());

        var exception = Assert.Throws<AggregateException>(() => jobScheduler.Wait(handles.AsSpan()));
        Assert.That(exception!.InnerExceptions, Has.Count.EqualTo(32));
        Assert.That(exception.Message, Does.Contain("100"));
    }

    [Test]
    public void TryToExecuteRemainingJobs_ThrowsTheExceptionsOfTheJobsItRan()
    {
        using var jobScheduler = new JobScheduler(1);
        jobScheduler.Flush(jobScheduler.Schedule(FailingJob()));

        // The worker may have run the job already, in that case the exception is still waiting to be picked up.
        Thread.Sleep(100);

        Assert.Throws<AggregateException>(() => jobScheduler.TryToExecuteRemainingJobs());
    }

    /// <summary>
    ///     Handles are only recycled after all of them were used, so failing jobs that leak theirs run out of handles.
    /// </summary>
    [Test]
    public void FailingJobs_ReleaseTheirHandles()
    {
        using var jobScheduler = new JobScheduler();

        for (var i = 0; i < ushort.MaxValue + 1_000; i++)
        {
            var handle = jobScheduler.Schedule(FailingJob());
            jobScheduler.Flush(handle);

            Assert.Throws<AggregateException>(() => jobScheduler.Wait(handle));
        }
    }

#pragma warning restore CS0618

    private struct ParallelForTestsJob : IJobParallelFor
    {
        public int[] Hits;

        public void Execute(int index)
        {
            Interlocked.Increment(ref Hits[index]);
        }
    }
}
