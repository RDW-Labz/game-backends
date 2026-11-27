using System.Collections.Concurrent;
using NUnit.Framework;
using Schedulers.Utils;

namespace Schedulers.Test;

internal class ParallelForTests
{
    private struct CountingJob : IJobParallelFor
    {
        public int[] Hits;

        public void Execute(int index)
        {
            Interlocked.Increment(ref Hits[index]);
        }
    }

    private sealed class CountingClassJob : IJobParallelFor
    {
        public readonly int[] Hits;

        public CountingClassJob(int size)
        {
            Hits = new int[size];
        }

        public void Execute(int index)
        {
            Interlocked.Increment(ref Hits[index]);
        }
    }

    private struct CountingBatchJob : IJobParallelForBatch
    {
        public int[] Hits;
        public ConcurrentBag<(int Start, int Count)>? Batches;

        public void Execute(int start, int count)
        {
            Batches?.Add((start, count));
            for (var i = start; i < start + count; i++)
            {
                Interlocked.Increment(ref Hits[i]);
            }
        }
    }

    private static readonly int[] Sizes = { 0, 1, 2, 15, 16, 17, 1_000, 100_003 };

    [TestCaseSource(nameof(Sizes))]
    public void StructJob_ExecutesEveryIndexExactlyOnce(int size)
    {
        using var jobScheduler = new JobScheduler();
        var hits = new int[size];

        var handle = jobScheduler.ScheduleParallelFor(new CountingJob { Hits = hits }, size);
        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);

        Assert.That(hits, Has.All.EqualTo(1));
    }

    [TestCaseSource(nameof(Sizes))]
    public void ClassJob_ExecutesEveryIndexExactlyOnce(int size)
    {
        using var jobScheduler = new JobScheduler();
        var job = new CountingClassJob(size);

        var handle = jobScheduler.ScheduleParallelFor(job, size);
        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);

        Assert.That(job.Hits, Has.All.EqualTo(1));
    }

    [Test]
    public void Batch_ProcessesEveryIndexExactlyOnce([Values(1, 17, 1_000, 100_003)] int size, [Values(1, 7, 64, 1_000)] int batchSize)
    {
        using var jobScheduler = new JobScheduler();
        var hits = new int[size];

        var handle = jobScheduler.ScheduleParallelForBatch(new CountingBatchJob { Hits = hits }, size, batchSize);
        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);

        Assert.That(hits, Has.All.EqualTo(1));
    }

    [Test]
    public void Batch_AllBatchesHaveTheBatchSizeExceptTheLast([Values(1, 7, 64)] int batchSize)
    {
        using var jobScheduler = new JobScheduler();
        const int Size = 10_000;
        var batches = new ConcurrentBag<(int Start, int Count)>();

        var handle = jobScheduler.ScheduleParallelForBatch(new CountingBatchJob { Hits = new int[Size], Batches = batches }, Size, batchSize);
        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);

        Assert.That(batches.Sum(batch => batch.Count), Is.EqualTo(Size));
        Assert.That(batches, Has.All.Matches<(int Start, int Count)>(batch => batch.Start % batchSize == 0), "batches start at multiples of the batch size");
        Assert.That(batches.Count(batch => batch.Count != batchSize), Is.LessThanOrEqualTo(1), "only the last batch may be smaller");
    }

    [Test]
    public void ZeroCount_FinishesWithoutExecutingAnything()
    {
        using var jobScheduler = new JobScheduler();

        var handle = jobScheduler.ScheduleParallelFor(new CountingJob { Hits = Array.Empty<int>() }, 0);
        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);

        var batch = jobScheduler.ScheduleParallelForBatch(new CountingBatchJob { Hits = Array.Empty<int>() }, 0);
        jobScheduler.Flush(batch);
        jobScheduler.Wait(batch);
    }

    [Test]
    public void NegativeCount_IsRejectedWhereItIsPassed()
    {
        using var jobScheduler = new JobScheduler();
        var job = new CountingJob { Hits = Array.Empty<int>() };

        Assert.Throws<ArgumentOutOfRangeException>(() => jobScheduler.ScheduleParallelFor(job, -1));
        Assert.Throws<ArgumentOutOfRangeException>(() => jobScheduler.ScheduleParallelForBatch(new CountingBatchJob(), -1));
        Assert.Throws<ArgumentOutOfRangeException>(() => jobScheduler.ScheduleParallelForBatch(new CountingBatchJob(), 10, batchSize: 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => jobScheduler.ScheduleParallelFor(job, 10, batchSize: 0));
    }

    [Test]
    public void Job_DoesNotRunBeforeItIsFlushed()
    {
        using var jobScheduler = new JobScheduler();
        var hits = new int[1_000];

        var handle = jobScheduler.ScheduleParallelFor(new CountingJob { Hits = hits }, hits.Length);
        Thread.Sleep(100);

        Assert.That(hits, Has.All.EqualTo(0));

        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);

        Assert.That(hits, Has.All.EqualTo(1));
    }

    [Test]
    public void Job_CanDependOnAnotherJob()
    {
        using var jobScheduler = new JobScheduler();

        var prepared = false;
        var indicesThatSawPreparation = 0;
        var prepare = jobScheduler.Schedule(new TestJob(0, () =>
        {
            Thread.Sleep(20);
            prepared = true;
        }));
        var parallelFor = jobScheduler.ScheduleParallelFor(new CheckingJob(() => Volatile.Read(ref prepared), () => Interlocked.Increment(ref indicesThatSawPreparation)), 1_000);
        jobScheduler.AddDependency(parallelFor, prepare);

        jobScheduler.Flush(prepare);
        jobScheduler.Wait(parallelFor);

        Assert.That(indicesThatSawPreparation, Is.EqualTo(1_000));
    }

    [Test]
    public void AnotherJob_CanDependOnTheJob_AndRunsAfterAllIndices()
    {
        using var jobScheduler = new JobScheduler();
        var hits = new int[10_000];
        var indicesDoneWhenDependentRan = -1;

        var parallelFor = jobScheduler.ScheduleParallelFor(new CountingJob { Hits = hits }, hits.Length);
        var dependent = jobScheduler.Schedule(new TestJob(0, () => indicesDoneWhenDependentRan = hits.Count(hit => hit == 1)));
        jobScheduler.AddDependency(dependent, parallelFor);

        jobScheduler.Flush(parallelFor);
        jobScheduler.Wait(dependent);

        Assert.That(indicesDoneWhenDependentRan, Is.EqualTo(hits.Length));
    }

    [Test]
    public void RepeatedRuns_ReusePooledJobsCorrectly()
    {
        using var jobScheduler = new JobScheduler();

        for (var run = 0; run < 300; run++)
        {
            var hits = new int[5_000];
            var handle = jobScheduler.ScheduleParallelFor(new CountingJob { Hits = hits }, hits.Length);
            jobScheduler.Flush(handle);
            jobScheduler.Wait(handle);

            Assert.That(hits, Has.All.EqualTo(1), $"run {run}");
        }
    }

    [Test]
    public void ManyJobsAtTheSameTime_AllExecuteEveryIndexExactlyOnce()
    {
        using var jobScheduler = new JobScheduler();

        const int Jobs = 200;
        var hits = Enumerable.Range(0, Jobs).Select(_ => new int[1_000]).ToArray();
        var handles = new JobHandle[Jobs];
        for (var i = 0; i < Jobs; i++)
        {
            handles[i] = jobScheduler.ScheduleParallelFor(new CountingJob { Hits = hits[i] }, hits[i].Length);
        }

        jobScheduler.Flush(handles.AsSpan());
        jobScheduler.Wait(handles.AsSpan());

        Assert.That(hits.SelectMany(h => h), Has.All.EqualTo(1));
    }

    private struct CheckingJob : IJobParallelFor
    {
        private readonly Func<bool> _condition;
        private readonly Action _onTrue;

        public CheckingJob(Func<bool> condition, Action onTrue)
        {
            _condition = condition;
            _onTrue = onTrue;
        }

        public void Execute(int index)
        {
            if (_condition())
            {
                _onTrue();
            }
        }
    }
}
