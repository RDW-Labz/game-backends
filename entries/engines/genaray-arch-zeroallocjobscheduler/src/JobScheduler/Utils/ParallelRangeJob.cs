namespace Schedulers.Utils;

/// <summary>
///     A parallel job splits itself into several of these, each processing a part of the range.
///     Instances are pooled, so splitting does not allocate once the pool is warm.
/// </summary>
/// <typeparam name="T">The job type.</typeparam>
internal sealed class ParallelRangeJob<T> : IPooledJob where T : struct, IJobParallelForBatch
{
    // Rented by the splitting worker, returned by whichever worker ran the job.
    private static readonly ObjectPool<ParallelRangeJob<T>> Pool = new();

    private T _job;
    private JobHandle _owner;
    private int _from;
    private int _to;
    private int _batchSize;

    private ParallelRangeJob()
    {
    }

    /// <summary>
    ///     Schedules and flushes a job which processes <c>[from, to)</c>, as a child of <paramref name="owner"/>.
    /// </summary>
    public static void ScheduleAndFlush(JobScheduler scheduler, JobHandle owner, T job, int from, int to, int batchSize)
    {
        if (!Pool.TryRent(out var range))
        {
            range = new();
        }

        range._job = job;
        range._owner = owner;
        range._from = from;
        range._to = to;
        range._batchSize = batchSize;

        scheduler.Flush(scheduler.Schedule(range, owner));
    }

    /// <inheritdoc />
    public void Execute()
    {
        try
        {
            ParallelRange.RunBatches(ref _job, _owner, _from, _to, _batchSize);
        }
        finally
        {
            ReturnToPool();
        }
    }

    /// <inheritdoc />
    public void ReturnToPool()
    {
        // Do not keep the user's data alive while pooled.
        _job = default;
        Pool.Return(this);
    }
}
