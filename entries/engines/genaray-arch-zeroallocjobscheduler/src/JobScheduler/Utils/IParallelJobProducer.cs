using System.Diagnostics.Contracts;

namespace Schedulers.Utils;

/// <summary>
/// Job that can be split into multiple jobs.
/// Implement <see cref="RunSingle"/> and schedule with onlySingle set to true, and <see cref="RunVectorized"/> is never called.
/// If you can make sure your job is always a multiple of the loop size, you can ignore <see cref="RunSingle"/>.
/// Calling a method that was not implemented throws, so scheduling without onlySingle requires both.
/// </summary>
[Obsolete("Implement IJobParallelForBatch or IJobParallelFor instead.")]
public interface IParallelJobProducer
{
    /// <summary>
    /// Use this by running a loop
    /// </summary>
    /// <param name="start">Index if the item you should start using</param>
    /// <param name="end">Exclusive end of the range</param>
    [Pure]
    public void RunVectorized(int start, int end)
    {
        throw new NotImplementedException($"{nameof(RunVectorized)} is not implemented. Implement it, or schedule with onlySingle set to true.");
    }

    /// <summary>
    /// This is for the remaining items that are not vectorized
    /// </summary>
    /// <param name="index">The current item to be processed</param>
    [Pure]
    public void RunSingle(int index)
    {
        throw new NotImplementedException($"{nameof(RunSingle)} is not implemented. It processes the indices that do not fill a whole block.");
    }
}

/// <summary>
/// A job producer that can be used to split a job into multiple jobs.
/// Schedules and flushes itself when created, and allocates an instance per call.
/// </summary>
/// <typeparam name="T">Type of the </typeparam>
/// <remarks>The reason we pass T instead of just IParallelJobProducer is because the compiler otherwise cannot inline it</remarks>
[Obsolete("Use JobScheduler.ScheduleParallelForBatch or ScheduleParallelFor instead, which do not allocate and can be cancelled.")]
public class ParallelJobProducer<T> : IJob where T : struct, IParallelJobProducer
{
    private readonly int _to;
    private readonly int _loopSize;
    private LegacyProducerAdapter<T> _adapter;
    private readonly JobScheduler _scheduler;
    private readonly JobHandle _selfHandle;

    /// <summary>
    /// Creates a new <see cref="ParallelJobProducer{T}"/>.
    /// </summary>
    /// <param name="to">Maximum to loop to. Zero is allowed and does nothing.</param>
    /// <param name="producer">The job to call</param>
    /// <param name="scheduler">The scheduler where the jobs should be put</param>
    /// <param name="loopSize">Size of the loop, useful for when you want to use vectorization</param>
    /// <param name="onlySingle">Makes sure you can ignore the end parameter in the IParallelJobProducer, and use start as index</param>
    /// <exception cref="ArgumentOutOfRangeException">Thrown when <paramref name="to"/> is negative or <paramref name="loopSize"/> is not positive.</exception>
    public ParallelJobProducer(int to, T producer, JobScheduler scheduler, int loopSize = 16, bool onlySingle = false)
    {
        if (to < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(to), to, "The range must not be negative.");
        }

        if (loopSize < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(loopSize), loopSize, "The loop size must be positive.");
        }

        _to = to;
        _adapter = new(producer, loopSize, onlySingle);
        _loopSize = loopSize;
        _scheduler = scheduler;
        _selfHandle = _scheduler.Schedule(this);
        _scheduler.Flush(_selfHandle);
    }

    /// <summary>
    /// Executes the job by splitting the range into children, which are scheduled as children of this job.
    /// A range which is too small to be split is processed directly.
    /// </summary>
    public void Execute()
    {
        ParallelRange.RunOrSplit(_scheduler, _selfHandle, ref _adapter, _to, _loopSize);
    }

    /// <summary>
    /// Returns the <see cref="JobHandle"/>.
    /// </summary>
    /// <returns></returns>
    public JobHandle GetHandle()
    {
        return _selfHandle;
    }
}
