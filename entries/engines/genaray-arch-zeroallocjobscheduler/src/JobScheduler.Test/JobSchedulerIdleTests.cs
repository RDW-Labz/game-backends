using System.Collections.Concurrent;
using System.Diagnostics;
using NUnit.Framework;
using Schedulers.Idle;
using Schedulers.Utils;

namespace Schedulers.Test;

/// <summary>
///     Tests that idle workers sleep instead of burning CPU, and that they wake up again when there is work.
/// </summary>
internal class JobSchedulerIdleTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    [Test]
    public void IdleScheduler_UsesAlmostNoCpu()
    {
        using var jobScheduler = new JobScheduler();

        // Give the workers time to stop looking for work and go to sleep.
        Thread.Sleep(300);

        // The test host and the JIT use the CPU at random moments, so only the quietest window counts.
        // Busy waiting workers would use half a second of CPU time per worker in every window.
        var quietestWindow = TimeSpan.MaxValue;
        for (var window = 0; window < 3; window++)
        {
            var cpuTimeBefore = Process.GetCurrentProcess().TotalProcessorTime;
            Thread.Sleep(500);
            var cpuTime = Process.GetCurrentProcess().TotalProcessorTime - cpuTimeBefore;
            quietestWindow = cpuTime < quietestWindow ? cpuTime : quietestWindow;
        }

        Assert.That(quietestWindow.TotalMilliseconds, Is.LessThan(100));
    }

    [Test]
    public void SleepingWorkers_ExecuteJobsFlushedFromOutside()
    {
        using var jobScheduler = new JobScheduler();

        for (var i = 0; i < 100; i++)
        {
            // Long enough for all workers to fall asleep again.
            Thread.Sleep(2);

            // Waiting for an event instead of the handle, as waiting for the handle would execute the job on this thread.
            using var executed = new ManualResetEventSlim();
            var handle = jobScheduler.Schedule(new TestJob(i, () => executed.Set()));
            jobScheduler.Flush(handle);

            Assert.That(executed.Wait(Timeout), Is.True, $"job {i} was not executed by a worker");
        }
    }

    [Test]
    public void SleepingWorkers_ShareJobsFlushedFromInsideAJob()
    {
        using var jobScheduler = new JobScheduler();
        Thread.Sleep(300);

        const int ChildCount = 64;
        var executedChildren = 0;
        var threadsUsed = new ConcurrentDictionary<int, bool>();
        using var allExecuted = new ManualResetEventSlim();

        var spawner = jobScheduler.Schedule(new TestJob(0, () =>
        {
            for (var i = 0; i < ChildCount; i++)
            {
                var child = jobScheduler.Schedule(new TestJob(i + 1, () =>
                {
                    threadsUsed[Environment.CurrentManagedThreadId] = true;
                    Thread.Sleep(5);
                    if (Interlocked.Increment(ref executedChildren) == ChildCount)
                    {
                        allExecuted.Set();
                    }
                }));
                jobScheduler.Flush(child);
            }
        }));
        jobScheduler.Flush(spawner);

        Assert.That(allExecuted.Wait(Timeout), Is.True);
        Assert.That(threadsUsed.Count, Is.GreaterThan(1), "the sleeping workers were not woken up to help");
    }

    /// <summary>
    ///     Producers hand over jobs at random moments, so that workers are in every phase between searching and sleeping.
    ///     A lost wake-up leaves a job unexecuted forever.
    /// </summary>
    [Test]
    public void SleepingWorkers_NeverMissJobsFlushedAtRandomMoments()
    {
        using var jobScheduler = new JobScheduler();

        const int Producers = 4;
        const int JobsPerProducer = 3_000;
        var missedJobs = 0;

        var producers = Enumerable.Range(0, Producers).Select(producer => Task.Run(() =>
        {
            var random = new Random(producer);
            for (var i = 0; i < JobsPerProducer; i++)
            {
                // Pauses between a few nanoseconds and a few milliseconds, around the time workers need to fall asleep.
                if (random.Next(4) == 0)
                {
                    Thread.Sleep(random.Next(2));
                }
                else
                {
                    Thread.SpinWait(random.Next(2_000));
                }

                using var executed = new ManualResetEventSlim();
                var handle = jobScheduler.Schedule(new TestJob(i, () => executed.Set()));
                jobScheduler.Flush(handle);

                if (!executed.Wait(Timeout))
                {
                    Interlocked.Increment(ref missedJobs);
                }
            }
        })).ToArray();

        Assert.That(Task.WaitAll(producers, TimeSpan.FromMinutes(2)), Is.True);
        Assert.That(missedJobs, Is.Zero, "jobs were not executed, so a worker did not wake up");
    }

    private sealed class CountingPolicy : IIdleSpinPolicy
    {
        private int _wakeUps;

        public int WakeUps => Volatile.Read(ref _wakeUps);

        public long SpinTicks => 0;

        public void OnWakeUp(long latencyTicks)
        {
            Interlocked.Increment(ref _wakeUps);
        }
    }

    [Test]
    public void CustomSpinPolicy_IsUsedByTheScheduler()
    {
        var policy = new CountingPolicy();
        using var jobScheduler = new JobScheduler(4, policy);

        // Without spinning, the workers fall asleep immediately, so every job has to wake one up.
        for (var i = 0; i < 20; i++)
        {
            Thread.Sleep(5);
            using var executed = new ManualResetEventSlim();
            jobScheduler.Flush(jobScheduler.Schedule(new TestJob(i, () => executed.Set())));
            Assert.That(executed.Wait(Timeout), Is.True);
        }

        Assert.That(policy.WakeUps, Is.GreaterThan(0));
    }

    [Test]
    public void SchedulerWithoutSpinning_ExecutesJobsAtRandomMoments()
    {
        using var jobScheduler = new JobScheduler(0, new FixedIdleSpinPolicy(TimeSpan.Zero));

        var executions = 0;
        const int Jobs = 2_000;
        var handles = new JobHandle[Jobs];
        for (var round = 0; round < 20; round++)
        {
            Thread.Sleep(1);
            for (var i = 0; i < Jobs / 20; i++)
            {
                handles[i] = jobScheduler.Schedule(new TestJob(i, () => Interlocked.Increment(ref executions)));
            }

            jobScheduler.Flush(handles.AsSpan(0, Jobs / 20));
            jobScheduler.Wait(handles.AsSpan(0, Jobs / 20));
        }

        Assert.That(executions, Is.EqualTo(Jobs));
    }

    [Test]
    public void Dispose_StopsSleepingWorkers()
    {
        const int WorkerCount = 8;
        var jobScheduler = new JobScheduler(WorkerCount);
        Thread.Sleep(300);
        var threadCount = Process.GetCurrentProcess().Threads.Count;

        jobScheduler.Dispose();

        var stopwatch = Stopwatch.StartNew();
        while (Process.GetCurrentProcess().Threads.Count > threadCount - (WorkerCount - 2) && stopwatch.Elapsed < Timeout)
        {
            Thread.Sleep(10);
        }

        Assert.That(Process.GetCurrentProcess().Threads.Count, Is.LessThanOrEqualTo(threadCount - (WorkerCount - 2)));
    }
}
