using Schedulers.Utils;

namespace Schedulers.Benchmarks;

/// <summary>
///     Scenarios that look like what a game does every frame, identical to
///     <c>JobScheduler.Benchmarks.Baseline/FrameBenchmark.cs</c>. Keep both files in sync.
/// </summary>
[MemoryDiagnoser]
public class FrameBenchmark
{
    private const int ElementsPerQuery = 2_000;
    private const int MaxHeavyElements = 100_000;

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

    private struct HeavyIndexJob : IJobParallelFor
    {
        public float[] Data;

        public void Execute(int index)
        {
            var x = Data[index] + 1f;
            for (var i = 0; i < 100; i++)
            {
                x = (x * 1.0001f) + (0.5f / (x + 1f));
            }

            Data[index] = x;
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
    private AddJob _addJob;
    private HeavyIndexJob _heavyIndexJob;
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
        _scheduler = new JobScheduler();

        _addJob = new AddJob { A = new float[ElementsPerQuery], B = new float[ElementsPerQuery], Result = new float[ElementsPerQuery] };
        _heavyIndexJob = new HeavyIndexJob { Data = new float[MaxHeavyElements] };
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
            _handles[i] = _scheduler.ScheduleParallelFor(_addJob, ElementsPerQuery);
        }

        _scheduler.Flush(_handles.AsSpan(0, Queries));
        _scheduler.Wait(_handles.AsSpan(0, Queries));
    }

    /// <summary>One big parallel-for where every index does real work.</summary>
    [Benchmark]
    public void HeavyParallelFor()
    {
        var handle = _scheduler.ScheduleParallelFor(_heavyIndexJob, HeavyElements);
        _scheduler.Flush(handle);
        _scheduler.Wait(handle);
    }

    /// <summary>Independent jobs that each take a few microseconds.</summary>
    [Benchmark]
    public void HeavyJobs()
    {
        for (var i = 0; i < Jobs; i++)
        {
            _handles[i] = _scheduler.Schedule(_heavyJobs[i]);
        }

        _scheduler.Flush(_handles.AsSpan(0, Jobs));
        _scheduler.Wait(_handles.AsSpan(0, Jobs));
    }
}
