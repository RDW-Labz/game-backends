using BenchmarkDotNet.Attributes;
using Schedulers;

namespace Schedulers.Benchmarks.Baseline;

/// <summary>
///     Scenarios that look like what a game does every frame, identical to <c>JobScheduler.Benchmarks/FrameBenchmark.cs</c>.
///     Keep both files in sync.
/// </summary>
[MemoryDiagnoser]
public class FrameBenchmark
{
    private const int ElementsPerQuery = 2_000;
    private const int MaxHeavyElements = 100_000;

    private sealed class AddJob : IJobParallelFor
    {
        public float[] A = new float[ElementsPerQuery];
        public float[] B = new float[ElementsPerQuery];
        public float[] Result = new float[ElementsPerQuery];

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

    private sealed class HeavyIndexJob : IJobParallelFor
    {
        public float[] Data = new float[MaxHeavyElements];

        public int ThreadCount => 0;
        public int BatchSize => 64;

        public void Execute(int index)
        {
            var x = Data[index] + 1f;
            for (var i = 0; i < 100; i++)
            {
                x = (x * 1.0001f) + (0.5f / (x + 1f));
            }

            Data[index] = x;
        }

        public void Finish()
        {
        }
    }

    private sealed class HeavyJob : IJob
    {
        public double Result;

        public void Execute()
        {
            var x = 1.0;
            for (var i = 0; i < 1_000; i++)
            {
                x = Math.Sqrt(x + i);
            }

            Result = x;
        }
    }

    private JobScheduler _scheduler = null!;
    private readonly AddJob _addJob = new();
    private readonly HeavyIndexJob _heavyIndexJob = new();
    private HeavyJob[] _heavyJobs = null!;
    private JobHandle[] _handles = null!;

    /// <summary>Scales all scenarios: 10 / 100 queries, 100 / 1000 jobs and 10,000 / 100,000 heavy elements.</summary>
    [Params(10, 100)]
    public int Size;

    private int Queries => Size;
    private int Jobs => Size * 10;
    private int HeavyElements => Size * 1_000;

    [GlobalSetup]
    public void Setup()
    {
        _scheduler = new JobScheduler(new JobScheduler.Config
        {
            ThreadCount = 0,
            MaxExpectedConcurrentJobs = 8192,
            StrictAllocationMode = false,
            ThreadPrefixName = "Baseline",
        });

        _heavyJobs = Enumerable.Range(0, Jobs).Select(_ => new HeavyJob()).ToArray();
        _handles = new JobHandle[Math.Max(Queries, Jobs)];
    }

    [GlobalCleanup]
    public void Cleanup()
    {
        _scheduler.Dispose();
    }

    /// <summary>Many small parallel-fors at once, like a frame with many queries.</summary>
    [Benchmark]
    public void SmallParallelFors()
    {
        for (var i = 0; i < Queries; i++)
        {
            _handles[i] = _scheduler.Schedule(_addJob, ElementsPerQuery);
        }

        _scheduler.Flush();
        JobHandle.CompleteAll(_handles.AsSpan(0, Queries));
    }

    /// <summary>One big parallel-for where every index does real work.</summary>
    [Benchmark]
    public void HeavyParallelFor()
    {
        var handle = _scheduler.Schedule(_heavyIndexJob, HeavyElements);
        _scheduler.Flush();
        handle.Complete();
    }

    /// <summary>Independent jobs that each take a few microseconds.</summary>
    [Benchmark]
    public void HeavyJobs()
    {
        for (var i = 0; i < Jobs; i++)
        {
            _handles[i] = _scheduler.Schedule(_heavyJobs[i]);
        }

        _scheduler.Flush();
        JobHandle.CompleteAll(_handles.AsSpan(0, Jobs));
    }
}
