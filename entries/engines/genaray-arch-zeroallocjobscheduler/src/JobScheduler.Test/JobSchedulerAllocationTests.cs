using NUnit.Framework;
using Schedulers.Utils;

namespace Schedulers.Test;

/// <summary>
///     Guards the zero-allocation promise: once warmed up, scheduling work must not allocate.
///     Allocations are counted across all threads, so worker threads are included.
/// </summary>
internal class JobSchedulerAllocationTests
{
    // Tolerance for allocations of unrelated threads (test runner, finalizer). Regressions allocate orders of magnitude more.
    private const int BackgroundNoiseBytes = 64 * 1024;

    // For calls which must not allocate at all. Over all iterations, this is less than what a single allocation per call would add up to.
    private const int NoAllocationBytes = 4 * 1024;
    private const int WarmupIterations = 500;
    private const int MeasuredIterations = 500;

    // The test host reports results from other threads and allocates a lot while doing so, at random times.
    // A scheduler that allocates does so in every attempt, so only the quietest attempt counts.
    private const int Attempts = 5;

    private sealed class NoOpJob : IJob
    {
        public void Execute()
        {
        }
    }

#pragma warning disable CS0618 // The legacy producer is tested on purpose.
    private struct NoOpProducer : IParallelJobProducer
    {
        public void RunSingle(int index)
        {
        }
    }
#pragma warning restore CS0618

    private struct NoOpBatchJob : IJobParallelForBatch
    {
        public void Execute(int start, int count)
        {
        }
    }

    private struct NoOpStructJob : IJob
    {
        public void Execute()
        {
        }
    }

    [Test]
    public void ScheduleFlushWait_ManyJobs_DoesNotAllocate()
    {
        using var scheduler = new JobScheduler();
        var job = new NoOpJob();
        var handles = new JobHandle[256];

        var allocated = MeasureAllocatedBytes(() =>
        {
            for (var i = 0; i < handles.Length; i++)
            {
                handles[i] = scheduler.Schedule(job);
            }

            scheduler.Flush(handles.AsSpan());
            scheduler.Wait(handles.AsSpan());
        });

        Assert.That(allocated, Is.LessThan(BackgroundNoiseBytes));
    }

    [Test]
    public void DependencyChain_DoesNotAllocate()
    {
        using var scheduler = new JobScheduler();
        var job = new NoOpJob();

        var allocated = MeasureAllocatedBytes(() =>
        {
            var first = scheduler.Schedule(job);
            var last = first;
            for (var i = 1; i < 64; i++)
            {
                var next = scheduler.Schedule(job);
                scheduler.AddDependency(next, last);
                last = next;
            }

            scheduler.Flush(first);
            scheduler.Wait(last);
        });

        Assert.That(allocated, Is.LessThan(BackgroundNoiseBytes));
    }

    private struct NoOpParallelFor : IJobParallelFor
    {
        public void Execute(int index)
        {
        }
    }

    [Test]
    public void ScheduleParallelFor_DoesNotAllocate()
    {
        using var scheduler = new JobScheduler();

        var allocated = MeasureAllocatedBytes(() =>
        {
            var handle = scheduler.ScheduleParallelFor(new NoOpParallelFor(), 10_000);
            scheduler.Flush(handle);
            scheduler.Wait(handle);
        });

        Assert.That(allocated, Is.LessThan(NoAllocationBytes));
    }

    [Test]
    public void ScheduleParallelForBatch_DoesNotAllocate()
    {
        using var scheduler = new JobScheduler();

        var allocated = MeasureAllocatedBytes(() =>
        {
            var handle = scheduler.ScheduleParallelForBatch(new NoOpBatchJob(), 10_000);
            scheduler.Flush(handle);
            scheduler.Wait(handle);
        });

        Assert.That(allocated, Is.LessThan(NoAllocationBytes));
    }

    [Test]
    public void ScheduleStructJob_DoesNotAllocate()
    {
        using var scheduler = new JobScheduler();
        var handles = new JobHandle[256];

        var allocated = MeasureAllocatedBytes(() =>
        {
            for (var i = 0; i < handles.Length; i++)
            {
                handles[i] = scheduler.Schedule(new NoOpStructJob());
            }

            scheduler.Flush(handles.AsSpan());
            scheduler.Wait(handles.AsSpan());
        });

        Assert.That(allocated, Is.LessThan(NoAllocationBytes));
    }

    [Test]
    public void ManyMoreStructJobsThanOnePoolSegmentHolds_DoNotAllocate()
    {
        using var scheduler = new JobScheduler();
        var handles = new JobHandle[20_000];

        var allocated = MeasureAllocatedBytes(() =>
        {
            for (var i = 0; i < handles.Length; i++)
            {
                handles[i] = scheduler.Schedule(new NoOpStructJob());
            }

            scheduler.Flush(handles.AsSpan());
            scheduler.Wait(handles.AsSpan());
        }, warmupIterations: 20, measuredIterations: 20);

        Assert.That(allocated, Is.LessThan(NoAllocationBytes));
    }

    [Test]
    public void CancelledJobs_DoNotAllocate()
    {
        using var scheduler = new JobScheduler();

        var allocated = MeasureAllocatedBytes(() =>
        {
            var structJob = scheduler.Schedule(new NoOpStructJob());
            var parallelFor = scheduler.ScheduleParallelFor(new NoOpParallelFor(), 1_000);
            scheduler.Cancel(structJob);
            scheduler.Cancel(parallelFor);
            scheduler.Flush(structJob);
            scheduler.Flush(parallelFor);
            scheduler.Wait(structJob, parallelFor);
        });

        Assert.That(allocated, Is.LessThan(NoAllocationBytes));
    }

#pragma warning disable CS0618 // The legacy producer is tested on purpose.
    [Test]
    public void ParallelJobProducer_OnlyAllocatesTheProducer()
    {
        using var scheduler = new JobScheduler();

        // One producer instance per call is expected (about 100 bytes); its children must come from the pool.
        var allocated = MeasureAllocatedBytes(() =>
        {
            var producer = new ParallelJobProducer<NoOpProducer>(10_000, new NoOpProducer(), scheduler, onlySingle: true);
            scheduler.Wait(producer.GetHandle());
        });

        Assert.That(allocated, Is.LessThan(BackgroundNoiseBytes));
    }
#pragma warning restore CS0618

    private static long MeasureAllocatedBytes(Action iteration, int warmupIterations = WarmupIterations, int measuredIterations = MeasuredIterations)
    {
        for (var i = 0; i < warmupIterations; i++)
        {
            iteration();
        }

        var quietestAttempt = long.MaxValue;
        for (var attempt = 0; attempt < Attempts; attempt++)
        {
            var before = GC.GetTotalAllocatedBytes(precise: true);
            for (var i = 0; i < measuredIterations; i++)
            {
                iteration();
            }

            quietestAttempt = Math.Min(quietestAttempt, GC.GetTotalAllocatedBytes(precise: true) - before);
        }

        return quietestAttempt;
    }
}
