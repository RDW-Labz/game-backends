using NUnit.Framework;
using Schedulers.Utils;
using static NUnit.Framework.Assert;

namespace Schedulers.Test;

public class TestJob : IJob
{
    private readonly int _id;
    private readonly Action _action;

    public TestJob(int id, Action action = null)
    {
        _id = id;
        _action = action;
    }

    public void Execute()
    {
        _action?.Invoke();
    }
}

internal class JobSchedulerTests
{
    /// <summary>
    ///     Tests the creation and disposal of a <see cref="JobScheduler"/>.
    /// </summary>
    [Test]
    public void CreateAndDispose()
    {
        using var jobScheduler = new JobScheduler();
    }

    /// <summary>
    ///     Checks whether two jobs with a parent relationship are running at the same time and are terminated appropriately.
    /// </summary>
    [Test]
    public void Flush_ParentWithChild()
    {
        using var jobScheduler = new JobScheduler();

        var job1Completed = new ManualResetEvent(false);
        var job2Completed = new ManualResetEvent(false);

        var job1 = new TestJob(1, () => { job1Completed.Set(); });
        var job2 = new TestJob(2, () => { job2Completed.Set(); });

        // Job2 should finish after Job1 since its his child.
        var handle1 = jobScheduler.Schedule(job1);
        var handle2 = jobScheduler.Schedule(job2, handle1);

        jobScheduler.Flush(handle1);
        jobScheduler.Flush(handle2);

        var job1CompletedFlag = job1Completed.WaitOne(TimeSpan.FromSeconds(5));
        var job2CompletedFlag = job2Completed.WaitOne(TimeSpan.FromSeconds(5));

        IsTrue(job1CompletedFlag, "Job1 did not complete in time.");
        IsTrue(job2CompletedFlag, "Job2 did not complete in time.");
    }

    /// <summary>
    ///     Checks whether a child with a parent relationship runs alone without the parent being executed.
    /// </summary>
    [Test]
    public void Flush_Child()
    {
        using var jobScheduler = new JobScheduler();

        var job1Completed = new ManualResetEvent(false);
        var job2Completed = new ManualResetEvent(false);

        var job1 = new TestJob(1, () => { job1Completed.Set(); });
        var job2 = new TestJob(2, () => { job2Completed.Set(); });

        // Job2 should finish after Job1 since its his child.
        var handle1 = jobScheduler.Schedule(job1);
        var handle2 = jobScheduler.Schedule(job2, handle1);

        jobScheduler.Flush(handle2);

        var job1CompletedFlag = job1Completed.WaitOne(TimeSpan.FromSeconds(5));
        var job2CompletedFlag = job2Completed.WaitOne(TimeSpan.FromSeconds(5));

        IsFalse(job1CompletedFlag, "Job1 did not complete in time.");
        IsTrue(job2CompletedFlag, "Job2 did not complete in time.");
    }

    /// <summary>
    ///     Checks whether both jobs have run when waiting for the parent.
    /// </summary>
    [Test]
    public void Wait_ParentWithChild()
    {
        using var jobScheduler = new JobScheduler();

        var job1Completed = new ManualResetEvent(false);
        var job2Completed = new ManualResetEvent(false);

        var job1 = new TestJob(1, () => { job1Completed.Set(); });
        var job2 = new TestJob(2, () => { job2Completed.Set(); });

        // Both run at the same time, but handle2 is a child of handle1.
        var handle1 = jobScheduler.Schedule(job1);
        var handle2 = jobScheduler.Schedule(job2, handle1);

        jobScheduler.Flush(handle1);
        jobScheduler.Flush(handle2);

        // Waits on handle1 to ensure both handles ran
        jobScheduler.Wait(handle1);

        var job1CompletedFlag = job1Completed.WaitOne(TimeSpan.FromSeconds(5));
        var job2CompletedFlag = job2Completed.WaitOne(TimeSpan.FromSeconds(5));

        IsTrue(job1CompletedFlag, "Job1 did not complete in time.");
        IsTrue(job2CompletedFlag, "Job2 did not complete in time.");
    }

    /// <summary>
    ///     Checks whether all jobs have run when waiting for all of them.
    /// </summary>
    [Test]
    public void Wait_All_ParentWithChild()
    {
        using var jobScheduler = new JobScheduler();

        var job1Completed = new ManualResetEvent(false);
        var job2Completed = new ManualResetEvent(false);

        var job1 = new TestJob(1, () => { job1Completed.Set(); });
        var job2 = new TestJob(2, () => { job2Completed.Set(); });

        // Both run at the same time, but handle2 is a child of handle1.
        var handle1 = jobScheduler.Schedule(job1);
        var handle2 = jobScheduler.Schedule(job2, handle1);

        jobScheduler.Flush(handle1);
        jobScheduler.Flush(handle2);

        // Waits on handle1 to ensure both handles ran
        jobScheduler.Wait(handle1, handle2);

        var job1CompletedFlag = job1Completed.WaitOne(TimeSpan.FromSeconds(5));
        var job2CompletedFlag = job2Completed.WaitOne(TimeSpan.FromSeconds(5));

        IsTrue(job1CompletedFlag, "Job1 did not complete in time.");
        IsTrue(job2CompletedFlag, "Job2 did not complete in time.");
    }

    [Test]
    public void Flush_Dependencies()
    {
        using var jobScheduler = new JobScheduler();

        // AutoResetEvent is better here because it automatically resets to false after a WaitOne call, ensuring the signal is not missed if the job completes quickly.
        var job1Completed = new AutoResetEvent(false);
        var job2Completed = new AutoResetEvent(false);

        var job1 = new TestJob(1, () => { job1Completed.Set(); });
        var job2 = new TestJob(2, () => { job2Completed.Set(); });

        // Job2 should finish after Job1 since its his child.
        var handle1 = jobScheduler.Schedule(job1);
        var handle2 = jobScheduler.Schedule(job2);
        jobScheduler.AddDependency(handle2, handle1);

        jobScheduler.Flush(handle1);

        var job1CompletedFlag = job1Completed.WaitOne(TimeSpan.FromSeconds(5));
        var job2CompletedFlag = job2Completed.WaitOne(TimeSpan.FromSeconds(10));

        IsTrue(job1CompletedFlag, "Job1 did not complete in time.");
        IsTrue(job2CompletedFlag, "Job2 did not complete in time.");
    }

    /// <summary>
    ///     Checks that dependencies run in order, also when a job has many of them.
    /// </summary>
    [Test]
    public void Wait_DependencyChain_RunsInOrder()
    {
        using var jobScheduler = new JobScheduler();

        var order = new List<int>();
        var handles = new JobHandle[50];
        for (var i = 0; i < handles.Length; i++)
        {
            var id = i;
            handles[i] = jobScheduler.Schedule(new TestJob(id, () => order.Add(id)));
            if (i > 0)
            {
                jobScheduler.AddDependency(handles[i], handles[i - 1]);
            }
        }

        jobScheduler.Flush(handles[0]);
        jobScheduler.Wait(handles[^1]);

        Assert.That(order, Is.EqualTo(Enumerable.Range(0, handles.Length)));
    }

    [Test]
    public void Flush_ManyDependenciesOfOneJob_RunsEachExactlyOnce()
    {
        using var jobScheduler = new JobScheduler();

        const int DependencyCount = 100;
        var executions = 0;
        var root = jobScheduler.Schedule(new TestJob(0));
        var dependencies = new JobHandle[DependencyCount];
        for (var i = 0; i < DependencyCount; i++)
        {
            dependencies[i] = jobScheduler.Schedule(new TestJob(i + 1, () => Interlocked.Increment(ref executions)));
            jobScheduler.AddDependency(dependencies[i], root);
        }

        jobScheduler.Flush(root);
        jobScheduler.Wait(dependencies);

        Assert.That(executions, Is.EqualTo(DependencyCount));
    }

    /// <summary>
    ///     Jobs scheduling further jobs from a worker thread must have those executed as well.
    /// </summary>
    [Test]
    public void Flush_FromInsideAJob_ExecutesTheNestedJobs()
    {
        using var jobScheduler = new JobScheduler();

        const int ChildCount = 500;
        var executions = 0;
        var root = jobScheduler.Schedule(new TestJob(0));
        var spawner = new TestJob(1, () =>
        {
            for (var i = 0; i < ChildCount; i++)
            {
                var child = jobScheduler.Schedule(new TestJob(i + 2, () => Interlocked.Increment(ref executions)), root);
                jobScheduler.Flush(child);
            }
        });

        var spawnerHandle = jobScheduler.Schedule(spawner, root);
        jobScheduler.Flush(spawnerHandle);
        jobScheduler.Flush(root);
        jobScheduler.Wait(root);

        Assert.That(executions, Is.EqualTo(ChildCount));
    }

    [Test]
    public void Wait_TwoAndThreeHandles_WaitsForAll()
    {
        using var jobScheduler = new JobScheduler();

        var executions = 0;
        var a = jobScheduler.Schedule(new TestJob(1, () => Interlocked.Increment(ref executions)));
        var b = jobScheduler.Schedule(new TestJob(2, () => Interlocked.Increment(ref executions)));
        var c = jobScheduler.Schedule(new TestJob(3, () => Interlocked.Increment(ref executions)));
        jobScheduler.Flush(a);
        jobScheduler.Flush(b);
        jobScheduler.Flush(c);

        jobScheduler.Wait(a, b, c);

        Assert.That(executions, Is.EqualTo(3));
    }

    /// <summary>
    ///     A job which waits for two others must not run before both have finished, and must run only once.
    /// </summary>
    [Test]
    public void Flush_Diamond_RunsTheJoinOnceAfterBothBranches()
    {
        using var jobScheduler = new JobScheduler();

        var branchesFinished = 0;
        var branchesSeenByJoin = -1;
        var joinRuns = 0;

        var start = jobScheduler.Schedule(new TestJob(0));
        var left = jobScheduler.Schedule(new TestJob(1, () => { Thread.Sleep(5); Interlocked.Increment(ref branchesFinished); }));
        var right = jobScheduler.Schedule(new TestJob(2, () => { Thread.Sleep(10); Interlocked.Increment(ref branchesFinished); }));
        var join = jobScheduler.Schedule(new TestJob(3, () =>
        {
            branchesSeenByJoin = Volatile.Read(ref branchesFinished);
            Interlocked.Increment(ref joinRuns);
        }));

        jobScheduler.AddDependency(left, start);
        jobScheduler.AddDependency(right, start);
        jobScheduler.AddDependency(join, left);
        jobScheduler.AddDependency(join, right);

        jobScheduler.Flush(start);
        jobScheduler.Wait(join);

        Assert.That(branchesSeenByJoin, Is.EqualTo(2));
        Assert.That(joinRuns, Is.EqualTo(1));
    }

    [Test]
    public void Flush_JobWaitingForManyJobs_RunsAfterAllOfThem()
    {
        using var jobScheduler = new JobScheduler();

        const int Prerequisites = 200;
        var finished = 0;
        var finishedSeenByFinalJob = -1;

        var final = jobScheduler.Schedule(new TestJob(0, () => finishedSeenByFinalJob = Volatile.Read(ref finished)));
        var prerequisites = new JobHandle[Prerequisites];
        for (var i = 0; i < Prerequisites; i++)
        {
            prerequisites[i] = jobScheduler.Schedule(new TestJob(i + 1, () => Interlocked.Increment(ref finished)));
            jobScheduler.AddDependency(final, prerequisites[i]);
        }

        jobScheduler.Flush(prerequisites.AsSpan());
        jobScheduler.Wait(final);

        Assert.That(finishedSeenByFinalJob, Is.EqualTo(Prerequisites));
    }

    [Test]
    public void Flush_JobWaitingForAFastAndASlowJob_WaitsForTheSlowOne()
    {
        using var jobScheduler = new JobScheduler();

        var slowFinished = false;
        var slowFinishedSeenByDependent = false;

        var fast = jobScheduler.Schedule(new TestJob(0));
        var slow = jobScheduler.Schedule(new TestJob(1, () =>
        {
            Thread.Sleep(50);
            slowFinished = true;
        }));
        var dependent = jobScheduler.Schedule(new TestJob(2, () => slowFinishedSeenByDependent = Volatile.Read(ref slowFinished)));

        jobScheduler.AddDependency(dependent, fast);
        jobScheduler.AddDependency(dependent, slow);

        jobScheduler.Flush(fast);
        jobScheduler.Flush(slow);
        jobScheduler.Wait(dependent);

        Assert.That(slowFinishedSeenByDependent, Is.True);
    }

    /// <summary>
    ///     More dependencies than the pool has nodes are created over time, which only works if nodes are recycled.
    /// </summary>
    [Test]
    public void AddDependency_RecyclesItsNodes()
    {
        using var jobScheduler = new JobScheduler();

        const int Iterations = 30_000;
        for (var i = 0; i < Iterations; i++)
        {
            var start = jobScheduler.Schedule(new TestJob(0));
            var left = jobScheduler.Schedule(new TestJob(1));
            var right = jobScheduler.Schedule(new TestJob(2));
            var join = jobScheduler.Schedule(new TestJob(3));

            jobScheduler.AddDependency(left, start);
            jobScheduler.AddDependency(right, start);
            jobScheduler.AddDependency(join, left);
            jobScheduler.AddDependency(join, right);

            jobScheduler.Flush(start);
            jobScheduler.Wait(join);
        }
    }

    private struct IncrementJob : IJob
    {
        public int[] Counter;
        public int Amount;

        public void Execute()
        {
            Interlocked.Add(ref Counter[0], Amount);
        }
    }

    [Test]
    public void Schedule_StructJob_ExecutesACopyOfIt()
    {
        using var jobScheduler = new JobScheduler();
        var counter = new int[1];
        var job = new IncrementJob { Counter = counter, Amount = 5 };

        var handle = jobScheduler.Schedule(job);
        job.Amount = 1_000;
        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);

        Assert.That(counter[0], Is.EqualTo(5));
    }

    [Test]
    public void Schedule_StructJobs_CanBeReusedFromThePoolManyTimes()
    {
        using var jobScheduler = new JobScheduler();
        var counter = new int[1];

        for (var round = 0; round < 200; round++)
        {
            var handles = new JobHandle[100];
            for (var i = 0; i < handles.Length; i++)
            {
                handles[i] = jobScheduler.Schedule(new IncrementJob { Counter = counter, Amount = 1 });
            }

            jobScheduler.Flush(handles.AsSpan());
            jobScheduler.Wait(handles.AsSpan());
        }

        Assert.That(counter[0], Is.EqualTo(20_000));
    }

    [Test]
    public void Schedule_StructJobWithParent_IsWaitedForByTheParent()
    {
        using var jobScheduler = new JobScheduler();
        var counter = new int[1];

        var parent = jobScheduler.Schedule(new TestJob(0));
        var child = jobScheduler.Schedule(new IncrementJob { Counter = counter, Amount = 1 }, parent);
        jobScheduler.Flush(parent);
        jobScheduler.Flush(child);
        jobScheduler.Wait(parent);

        Assert.That(counter[0], Is.EqualTo(1));
    }
}
