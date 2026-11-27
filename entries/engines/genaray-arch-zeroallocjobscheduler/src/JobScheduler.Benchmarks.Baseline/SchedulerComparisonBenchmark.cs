using BenchmarkDotNet.Attributes;
using Schedulers;

namespace Schedulers.Benchmarks.Baseline;

/// <summary>
///     Scenarios identical to <c>JobScheduler.Benchmarks/SchedulerComparisonBenchmark.cs</c>, written against the
///     API of the published NuGet package (Schedule / Flush / Complete). Keep both files in sync.
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

    // The package only accepts IJob, so every scheduled struct is boxed.
    private struct NoOpStructJob : IJob
    {
        public void Execute()
        {
        }
    }

    private sealed class AddJob : IJobParallelFor
    {
        public float[] A = Array.Empty<float>();
        public float[] B = Array.Empty<float>();
        public float[] Result = Array.Empty<float>();

        public int ThreadCount => 0;
        public int BatchSize => 64;

        public void Execute(int index)
        {
            Result[index] = (A[index] * B[index]) + A[index];
        }

        public void Finish()
        {
        }
    }

    private JobScheduler _scheduler = null!;
    private readonly EmptyJob _emptyJob = new();
    private readonly AddJob _addJob = new();
    private JobHandle[] _handles = null!;

    [Params(100, 1000, 20000)]
    public int Count;

    [GlobalSetup]
    public void Setup()
    {
        _scheduler = new JobScheduler(new JobScheduler.Config
        {
            ThreadCount = 0,
            MaxExpectedConcurrentJobs = Math.Max(Count * 2, 4096),
            StrictAllocationMode = false,
            ThreadPrefixName = "Baseline",
        });

        _handles = new JobHandle[Count];

        var elements = Count * ElementsPerCount;
        _addJob.A = new float[elements];
        _addJob.B = new float[elements];
        _addJob.Result = new float[elements];
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

        _scheduler.Flush();
        JobHandle.CompleteAll(_handles.AsSpan());
    }

    /// <summary>Like <see cref="ManyJobs"/>, but the jobs are structs.</summary>
    [Benchmark]
    public void ManyStructJobs()
    {
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.Schedule(new NoOpStructJob());
        }

        _scheduler.Flush();
        JobHandle.CompleteAll(_handles.AsSpan());
    }

    /// <summary>Runs one parallel-for over <c>Count * 50</c> elements.</summary>
    [Benchmark]
    public void ParallelFor()
    {
        var handle = _scheduler.Schedule(_addJob, _addJob.A.Length);
        _scheduler.Flush();
        handle.Complete();
    }

    /// <summary>Schedules a sequential chain of <see cref="Count"/> jobs where each depends on its predecessor.</summary>
    [Benchmark]
    public void DependencyChain()
    {
        var handle = _scheduler.Schedule(_emptyJob);
        for (var i = 1; i < Count; i++)
        {
            handle = _scheduler.Schedule(_emptyJob, handle);
        }

        _scheduler.Flush();
        handle.Complete();
    }

    /// <summary>One job that has to wait for <see cref="Count"/> other jobs.</summary>
    [Benchmark]
    public void FanIn()
    {
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.Schedule(_emptyJob);
        }

        var combined = _scheduler.CombineDependencies(_handles);
        var final = _scheduler.Schedule(_emptyJob, combined);

        _scheduler.Flush();
        final.Complete();
    }

    /// <summary><see cref="Count"/> jobs that all have to wait for one job.</summary>
    [Benchmark]
    public void FanOut()
    {
        var root = _scheduler.Schedule(_emptyJob);
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.Schedule(_emptyJob, root);
        }

        _scheduler.Flush();
        JobHandle.CompleteAll(_handles.AsSpan());
    }
}
