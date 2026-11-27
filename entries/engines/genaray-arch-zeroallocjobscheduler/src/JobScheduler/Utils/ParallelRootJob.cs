namespace Schedulers.Utils;

/// <summary>
///     The job behind <see cref="ParallelForExtensions"/>: runs a job over a range, split over the workers.
///     Instances are pooled, so scheduling a parallel job does not allocate once the pool is warm.
/// </summary>
/// <typeparam name="T">The job type.</typeparam>
internal sealed class ParallelRootJob<T> : IPooledJob where T : struct, IJobParallelForBatch
{
    private static readonly ObjectPool<ParallelRootJob<T>> Pool = new();

    private JobScheduler? _scheduler;
    private JobHandle _handle;
    private T _job;
    private int _count;
    private int _batchSize;

    private ParallelRootJob()
    {
    }

    /// <summary>
    ///     Schedules, but does not flush, a job which runs <paramref name="job"/> for all indices in <c>[0, count)</c>.
    /// </summary>
    /// <returns>The <see cref="JobHandle"/> of the job. It is finished once all parts of the range are finished.</returns>
    public static JobHandle Schedule(JobScheduler scheduler, T job, int count, int batchSize)
    {
        if (!Pool.TryRent(out var root))
        {
            root = new();
        }

        root._scheduler = scheduler;
        root._job = job;
        root._count = count;
        root._batchSize = batchSize;

        // The job cannot run before it is flushed, so it is safe to hand it its own handle afterwards.
        root._handle = scheduler.Schedule(root);
        return root._handle;
    }

    /// <inheritdoc />
    public void Execute()
    {
        try
        {
            ParallelRange.RunOrSplit(_scheduler!, _handle, ref _job, _count, _batchSize);
        }
        finally
        {
            ReturnToPool();
        }
    }

    /// <inheritdoc />
    public void ReturnToPool()
    {
        // The parts have their own copy of the job, so this job is not needed anymore.
        _scheduler = null;
        _job = default;
        Pool.Return(this);
    }
}
