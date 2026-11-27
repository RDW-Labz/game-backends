namespace Schedulers.Utils;

/// <summary>
///     Extensions to schedule jobs which process a range of indices in parallel.
/// </summary>
public static class ParallelForExtensions
{
    /// <summary>
    ///     The amount of indices that are passed to a job at once, unless specified otherwise.
    /// </summary>
    public const int DefaultBatchSize = 64;

    /// <summary>
    ///     Schedules an <see cref="IJobParallelFor"/> which is executed for every index in <c>[0, count)</c>, spread over all workers.
    ///     Does not allocate once the scheduler is warm.
    /// </summary>
    /// <remarks>
    ///     Like <see cref="JobScheduler.Schedule(IJob)"/>, this does not flush the job yet. This allows to
    ///     <see cref="JobScheduler.AddDependency"/> before, and waiting for the handle includes waiting for all indices.
    ///     Cancelling the handle stops the job before its next batch.
    /// </remarks>
    /// <param name="jobScheduler">The <see cref="JobScheduler"/>.</param>
    /// <param name="job">The job. See <see cref="IJobParallelFor"/> for the difference between structs and classes.</param>
    /// <param name="count">The amount of indices. Zero is allowed and does nothing.</param>
    /// <param name="batchSize">
    ///     How many indices are executed in a row before the job checks for cancellation.
    ///     Small values react faster to cancellation, which matters for expensive indices.
    /// </param>
    /// <typeparam name="T">The type of the job.</typeparam>
    /// <returns>The new <see cref="JobHandle"/>.</returns>
    /// <exception cref="ArgumentOutOfRangeException">Thrown when <paramref name="count"/> is negative or <paramref name="batchSize"/> is not positive.</exception>
    public static JobHandle ScheduleParallelFor<T>(this JobScheduler jobScheduler, T job, int count, int batchSize = DefaultBatchSize) where T : IJobParallelFor
    {
        return jobScheduler.ScheduleParallelForBatch(new ParallelForAdapter<T>(job), count, batchSize);
    }

    /// <summary>
    ///     Schedules an <see cref="IJobParallelForBatch"/> which is executed for batches of the indices in <c>[0, count)</c>,
    ///     spread over all workers. Does not allocate once the scheduler is warm.
    ///     Use this over <see cref="ScheduleParallelFor{T}"/> to process several indices at once, for example with SIMD.
    /// </summary>
    /// <remarks>
    ///     Like <see cref="JobScheduler.Schedule(IJob)"/>, this does not flush the job yet. This allows to
    ///     <see cref="JobScheduler.AddDependency"/> before, and waiting for the handle includes waiting for all indices.
    ///     Cancelling the handle stops the job before its next batch.
    /// </remarks>
    /// <param name="jobScheduler">The <see cref="JobScheduler"/>.</param>
    /// <param name="job">The job, which is copied for every part of the range.</param>
    /// <param name="count">The amount of indices. Zero is allowed and does nothing.</param>
    /// <param name="batchSize">The amount of indices passed to the job at once. The last batch may be smaller.</param>
    /// <typeparam name="T">The type of the job.</typeparam>
    /// <returns>The new <see cref="JobHandle"/>.</returns>
    /// <exception cref="ArgumentOutOfRangeException">Thrown when <paramref name="count"/> is negative or <paramref name="batchSize"/> is not positive.</exception>
    public static JobHandle ScheduleParallelForBatch<T>(this JobScheduler jobScheduler, T job, int count, int batchSize = DefaultBatchSize)
        where T : struct, IJobParallelForBatch
    {
        if (count < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(count), count, "The range must not be negative.");
        }

        if (batchSize < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(batchSize), batchSize, "The batch size must be positive.");
        }

        return ParallelRootJob<T>.Schedule(jobScheduler, job, count, batchSize);
    }
}
