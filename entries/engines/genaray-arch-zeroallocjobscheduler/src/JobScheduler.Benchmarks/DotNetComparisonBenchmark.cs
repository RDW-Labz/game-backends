using Schedulers.Utils;

namespace Schedulers.Benchmarks;

/// <summary>
///     The scheduler against what .NET offers out of the box: <see cref="Parallel"/>, <see cref="Task"/> and the <see cref="ThreadPool"/>.
///     The .NET variants use cached delegates and work items where possible, so they are as allocation friendly as they can be.
/// </summary>
[MemoryDiagnoser]
public class DotNetComparisonBenchmark
{
    private const int ElementsPerCount = 50;

    private sealed class EmptyJob : IJob
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

    /// <summary>Counts down finished work items, and signals when the last one is done.</summary>
    private sealed class Countdown : IThreadPoolWorkItem
    {
        public readonly ManualResetEventSlim Done = new(false);
        private int _remaining;

        public void Start(int count)
        {
            Done.Reset();
            _remaining = count;
        }

        public void Execute()
        {
            if (Interlocked.Decrement(ref _remaining) == 0)
            {
                Done.Set();
            }
        }
    }

    private JobScheduler _scheduler = null!;
    private readonly EmptyJob _emptyJob = new();
    private readonly Countdown _countdown = new();
    private AddJob _addJob;
    private JobHandle[] _handles = null!;
    private Task[] _tasks = null!;
    private float[] _a = null!;
    private float[] _b = null!;
    private float[] _result = null!;

    private readonly Action _noop = () => { };
    private readonly Action<int> _noopIndex = _ => { };
    private readonly Action<Task> _noopContinuation = _ => { };
    private Action<int> _addIndex = null!;
    private Action<Tuple<int, int>> _addRange = null!;

    [Params(1000, 20000)]
    public int Count;

    [GlobalSetup]
    public void Setup()
    {
        _scheduler = new JobScheduler();
        _handles = new JobHandle[Count];
        _tasks = new Task[Count];

        var elements = Count * ElementsPerCount;
        _a = new float[elements];
        _b = new float[elements];
        _result = new float[elements];
        _addJob = new AddJob { A = _a, B = _b, Result = _result };
        _addIndex = index => _result[index] = (_a[index] * _b[index]) + _a[index];
        _addRange = range =>
        {
            for (var index = range.Item1; index < range.Item2; index++)
            {
                _result[index] = (_a[index] * _b[index]) + _a[index];
            }
        };
    }

    [GlobalCleanup]
    public void Cleanup()
    {
        _scheduler.Dispose();
    }

    /// <summary>Count independent empty jobs.</summary>
    [Benchmark(Baseline = true)]
    public void Scheduler_ManyJobs()
    {
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.Schedule(_emptyJob);
        }

        _scheduler.Flush(_handles.AsSpan());
        _scheduler.Wait(_handles.AsSpan());
    }

    [Benchmark]
    public void ThreadPool_ManyJobs()
    {
        _countdown.Start(Count);
        for (var i = 0; i < Count; i++)
        {
            ThreadPool.UnsafeQueueUserWorkItem(_countdown, preferLocal: false);
        }

        _countdown.Done.Wait();
    }

    [Benchmark]
    public void Task_ManyJobs()
    {
        for (var i = 0; i < _tasks.Length; i++)
        {
            _tasks[i] = Task.Run(_noop);
        }

        Task.WaitAll(_tasks);
    }

    /// <summary>Not the same thing, but how many use Parallel.For for many small things: one iteration per job.</summary>
    [Benchmark]
    public void ParallelFor_EmptyIterations()
    {
        Parallel.For(0, Count, _noopIndex);
    }

    /// <summary>One parallel-for over Count * 50 elements.</summary>
    [Benchmark]
    public void Scheduler_ParallelFor()
    {
        var handle = _scheduler.ScheduleParallelFor(_addJob, _result.Length);
        _scheduler.Flush(handle);
        _scheduler.Wait(handle);
    }

    [Benchmark]
    public void Parallel_For()
    {
        Parallel.For(0, _result.Length, _addIndex);
    }

    [Benchmark]
    public void Parallel_ForEachWithRangePartitioner()
    {
        Parallel.ForEach(Partitioner.Create(0, _result.Length), _addRange);
    }

    /// <summary>Count jobs that run one after the other.</summary>
    [Benchmark]
    public void Scheduler_DependencyChain()
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

    [Benchmark]
    public void Task_ContinuationChain()
    {
        var task = Task.Run(_noop);
        for (var i = 1; i < Count; i++)
        {
            task = task.ContinueWith(_noopContinuation, TaskContinuationOptions.ExecuteSynchronously);
        }

        task.Wait();
    }
}

/// <summary>Many small parallel loops one after another, or at once, like the queries of a frame.</summary>
[MemoryDiagnoser]
public class DotNetFrameBenchmark
{
    private const int ElementsPerQuery = 2_000;

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
    private AddJob _addJob;
    private JobHandle[] _handles = null!;
    private Action<int> _addIndex = null!;

    [Params(10, 100)]
    public int Queries;

    [GlobalSetup]
    public void Setup()
    {
        _scheduler = new JobScheduler();
        _handles = new JobHandle[Queries];

        var a = new float[ElementsPerQuery];
        var b = new float[ElementsPerQuery];
        var result = new float[ElementsPerQuery];
        _addJob = new AddJob { A = a, B = b, Result = result };
        _addIndex = index => result[index] = (a[index] * b[index]) + a[index];
    }

    [GlobalCleanup]
    public void Cleanup()
    {
        _scheduler.Dispose();
    }

    /// <summary>All queries are scheduled first and run at the same time.</summary>
    [Benchmark(Baseline = true)]
    public void Scheduler_QueriesAtOnce()
    {
        for (var i = 0; i < _handles.Length; i++)
        {
            _handles[i] = _scheduler.ScheduleParallelFor(_addJob, ElementsPerQuery);
        }

        _scheduler.Flush(_handles.AsSpan());
        _scheduler.Wait(_handles.AsSpan());
    }

    /// <summary>Parallel.For blocks, so one query after the other.</summary>
    [Benchmark]
    public void Parallel_ForOneAfterTheOther()
    {
        for (var i = 0; i < Queries; i++)
        {
            Parallel.For(0, ElementsPerQuery, _addIndex);
        }
    }
}
