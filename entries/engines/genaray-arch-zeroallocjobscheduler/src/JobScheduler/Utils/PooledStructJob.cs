namespace Schedulers.Utils;

/// <summary>
///     Carries a struct job through the scheduler, which only knows <see cref="IJob"/> objects, without boxing it
///     every time. Instances are pooled, so scheduling a struct job does not allocate once the pool is warm.
/// </summary>
/// <typeparam name="T">The type of the job.</typeparam>
internal sealed class PooledStructJob<T> : IPooledJob where T : struct, IJob
{
    private static readonly ObjectPool<PooledStructJob<T>> Pool = new();

    private T _job;

    private PooledStructJob()
    {
    }

    /// <summary>
    ///     Rents a pooled instance and sets it up to run <paramref name="job"/>.
    /// </summary>
    public static PooledStructJob<T> Rent(T job)
    {
        if (!Pool.TryRent(out var pooled))
        {
            pooled = new();
        }

        pooled._job = job;
        return pooled;
    }

    /// <inheritdoc />
    public void Execute()
    {
        try
        {
            _job.Execute();
        }
        finally
        {
            ReturnToPool();
        }
    }

    /// <inheritdoc />
    public void ReturnToPool()
    {
        // Do not keep the data of the job alive while pooled.
        _job = default;
        Pool.Return(this);
    }
}
