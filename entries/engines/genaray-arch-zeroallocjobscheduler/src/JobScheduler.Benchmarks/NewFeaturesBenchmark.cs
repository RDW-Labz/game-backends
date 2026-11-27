using System.Numerics;
using Schedulers.Utils;

namespace Schedulers.Benchmarks;

/// <summary>
///     Features that the published NuGet package does not have: batches, cancellation, and exceptions in jobs.
/// </summary>
[MemoryDiagnoser]
public class NewFeaturesBenchmark
{
    private const int Elements = 1_000_000;

    private struct AddIndexJob : IJobParallelFor
    {
        public float[] A;
        public float[] B;
        public float[] Result;

        public void Execute(int index)
        {
            Result[index] = (A[index] * B[index]) + A[index];
        }
    }

    private struct AddBatchJob : IJobParallelForBatch
    {
        public float[] A;
        public float[] B;
        public float[] Result;

        public void Execute(int start, int count)
        {
            var end = start + count;
            var index = start;
            var width = Vector<float>.Count;
            for (; index <= end - width; index += width)
            {
                var a = new Vector<float>(A, index);
                var b = new Vector<float>(B, index);
                ((a * b) + a).CopyTo(Result, index);
            }

            for (; index < end; index++)
            {
                Result[index] = (A[index] * B[index]) + A[index];
            }
        }
    }

    private sealed class EmptyJob : IJob
    {
        public void Execute()
        {
        }
    }

    private sealed class FailingJob : IJob
    {
        public void Execute()
        {
            throw new InvalidOperationException("expected failure");
        }
    }

    private JobScheduler _scheduler = null!;
    private AddIndexJob _indexJob;
    private AddBatchJob _batchJob;
    private readonly EmptyJob _emptyJob = new();
    private readonly FailingJob _failingJob = new();
    private JobHandle[] _handles = null!;

    [Params(1_000, 20_000)]
    public int Count;

    [GlobalSetup]
    public void Setup()
    {
        _scheduler = new JobScheduler();
        _handles = new JobHandle[Count];

        var a = new float[Elements];
        var b = new float[Elements];
        var result = new float[Elements];
        _indexJob = new AddIndexJob { A = a, B = b, Result = result };
        _batchJob = new AddBatchJob { A = a, B = b, Result = result };
    }

    [GlobalCleanup]
    public void Cleanup()
    {
        _scheduler.Dispose();
    }

    /// <summary>The same loop over a million elements, one index at a time.</summary>
    [Benchmark]
    public void ParallelFor_PerIndex()
    {
        var handle = _scheduler.ScheduleParallelFor(_indexJob, Elements);
        _scheduler.Flush(handle);
        _scheduler.Wait(handle);
    }

    /// <summary>The same loop over a million elements, in SIMD batches of 256.</summary>
    [Benchmark]
    public void ParallelFor_SimdBatches()
    {
        var handle = _scheduler.ScheduleParallelForBatch(_batchJob, Elements, batchSize: 256);
        _scheduler.Flush(handle);
        _scheduler.Wait(handle);
    }

    /// <summary>Schedules jobs, cancels all of them before they run, flushes and waits. Nothing is executed.</summary>
    [Benchmark]
    public void CancelQueuedJobs()
    {
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.Schedule(_emptyJob);
            _scheduler.Cancel(_handles[i]);
        }

        _scheduler.Flush(_handles.AsSpan());
        _scheduler.Wait(_handles.AsSpan());
    }

    /// <summary>Jobs that all throw. Exceptions are expensive in .NET, this shows what handling them costs per job.</summary>
    [Benchmark]
    public void FailingJobs()
    {
        var count = Count / 10;
        for (var i = 0; i < count; i++)
        {
            _handles[i] = _scheduler.Schedule(_failingJob);
        }

        _scheduler.Flush(_handles.AsSpan(0, count));
        try
        {
            _scheduler.Wait(_handles.AsSpan(0, count));
        }
        catch (AggregateException)
        {
        }
    }
}
