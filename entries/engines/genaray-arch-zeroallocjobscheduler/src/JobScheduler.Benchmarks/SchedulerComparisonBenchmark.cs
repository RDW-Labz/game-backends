using Schedulers.Utils;

namespace Schedulers.Benchmarks;

/// <summary>
///     Scenarios identical to <c>JobScheduler.Benchmarks.Baseline/SchedulerComparisonBenchmark.cs</c>, which runs
///     them against the latest published NuGet package. Keep both files in sync.
/// </summary>
[MemoryDiagnoser]
public class SchedulerComparisonBenchmark
{
    private const int ElementsPerCount = 50;

    private sealed class EmptyJob : IJob
    {
        public void Execute()
        {
        }
    }

    private struct NoOpStructJob : IJob
    {
        public void Execute()
        {
        }
    }

    private struct AddJob : IJobParallelFor
    {
        public float[] A;
        public float[] B;
        public float[] Result;

        public void Execute(int index)
        {
            Result[index] = (A[index] * B[index]) + A[index];
        }
    }

    private JobScheduler _scheduler = null!;
    private readonly EmptyJob _emptyJob = new();
    private AddJob _addJob;
    private JobHandle[] _handles = null!;

    [Params(100, 1000, 20000)]
    public int Count;

    [GlobalSetup]
    public void Setup()
    {
        _scheduler = new JobScheduler();
        _handles = new JobHandle[Count];

        var elements = Count * ElementsPerCount;
        _addJob = new AddJob
        {
            A = new float[elements],
            B = new float[elements],
            Result = new float[elements],
        };
    }

    [GlobalCleanup]
    public void Cleanup()
    {
        _scheduler.Dispose();
    }

    /// <summary>Schedules <see cref="Count"/> independent empty jobs, flushes and waits for all of them.</summary>
    [Benchmark]
    public void ManyJobs()
    {
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.Schedule(_emptyJob);
        }

        _scheduler.Flush(_handles.AsSpan());
        _scheduler.Wait(_handles.AsSpan());
    }

    /// <summary>Like <see cref="ManyJobs"/>, but the jobs are structs.</summary>
    [Benchmark]
    public void ManyStructJobs()
    {
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.Schedule(new NoOpStructJob());
        }

        _scheduler.Flush(_handles.AsSpan());
        _scheduler.Wait(_handles.AsSpan());
    }

    /// <summary>Runs one parallel-for over <c>Count * 50</c> elements.</summary>
    [Benchmark]
    public void ParallelFor()
    {
        var handle = _scheduler.ScheduleParallelFor(_addJob, _addJob.A.Length);
        _scheduler.Flush(handle);
        _scheduler.Wait(handle);
    }

    /// <summary>Schedules a sequential chain of <see cref="Count"/> jobs where each depends on its predecessor.</summary>
    [Benchmark]
    public void DependencyChain()
    {
        var first = _scheduler.Schedule(_emptyJob);
        var last = first;
        for (var i = 1; i < Count; i++)
        {
            var next = _scheduler.Schedule(_emptyJob);
            _scheduler.AddDependency(next, last);
            last = next;
        }

        _scheduler.Flush(first);
        _scheduler.Wait(last);
    }

    /// <summary>One job that has to wait for <see cref="Count"/> other jobs.</summary>
    [Benchmark]
    public void FanIn()
    {
        var final = _scheduler.Schedule(_emptyJob);
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.Schedule(_emptyJob);
            _scheduler.AddDependency(final, _handles[i]);
        }

        _scheduler.Flush(_handles.AsSpan());
        _scheduler.Wait(final);
    }

    /// <summary><see cref="Count"/> jobs that all have to wait for one job.</summary>
    [Benchmark]
    public void FanOut()
    {
        var root = _scheduler.Schedule(_emptyJob);
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.Schedule(_emptyJob);
            _scheduler.AddDependency(_handles[i], root);
        }

        _scheduler.Flush(root);
        _scheduler.Wait(_handles.AsSpan());
    }
}
