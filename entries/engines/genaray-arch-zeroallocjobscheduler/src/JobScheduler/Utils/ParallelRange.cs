namespace Schedulers.Utils;

/// <summary>
///     Runs an <see cref="IJobParallelForBatch"/> over a range of indices in batches, and splits the range
///     over several jobs to share the work between the workers.
/// </summary>
internal static class ParallelRange
{
    /// <summary>
    /// How many parts a range is split into per worker. More than one, so that workers which finish early can take over from slower ones.
    /// </summary>
    private const int ChildrenPerWorker = 4;

    /// <summary>
    ///     Runs <paramref name="job"/> for all indices in <c>[from, to)</c>, one batch after the other.
    ///     Stops between two batches if the cancellation of <paramref name="owner"/> was requested.
    /// </summary>
    /// <remarks>
    ///     The job is passed by reference and generic so that its methods are called directly (and can be inlined)
    ///     instead of on a defensive copy.
    /// </remarks>
    public static void RunBatches<T>(ref T job, JobHandle owner, int from, int to, int batchSize) where T : struct, IJobParallelForBatch
    {
        // Counts down instead of comparing with the end, so that there is no overflow close to int.MaxValue.
        var remaining = to - from;
        while (remaining > 0 && !owner.IsCancellationRequested)
        {
            var count = Math.Min(batchSize, remaining);
            job.Execute(from, count);

            from += count;
            remaining -= count;
        }
    }

    /// <summary>
    ///     Runs <paramref name="job"/> for all indices in <c>[0, count)</c>. A range that is too small to share is run
    ///     directly. Otherwise it is split into parts of whole batches, which are scheduled as children of <paramref name="owner"/>.
    /// </summary>
    /// <param name="scheduler">The <see cref="JobScheduler"/> to schedule the parts on.</param>
    /// <param name="owner">The <see cref="JobHandle"/> of the job which runs this, so that waiting for it includes waiting for the parts.</param>
    /// <param name="job">The job to run.</param>
    /// <param name="count">The size of the range.</param>
    /// <param name="batchSize">The amount of indices passed to the job at once.</param>
    public static void RunOrSplit<T>(JobScheduler scheduler, JobHandle owner, ref T job, int count, int batchSize) where T : struct, IJobParallelForBatch
    {
        var batchCount = (count / batchSize) + (count % batchSize == 0 ? 0 : 1);
        var partCount = Math.Min(batchCount, ChildrenPerWorker * scheduler.Workers.Count);
        if (partCount <= 1)
        {
            RunBatches(ref job, owner, 0, count, batchSize);
            return;
        }

        for (var part = 0; part < partCount; part++)
        {
            // long, because the batches multiplied with the index of the part can exceed int.MaxValue.
            var firstBatch = (long)batchCount * part / partCount;
            var endBatch = (long)batchCount * (part + 1) / partCount;
            var from = (int)(firstBatch * batchSize);
            var to = (int)Math.Min(endBatch * batchSize, count);

            ParallelRangeJob<T>.ScheduleAndFlush(scheduler, owner, job, from, to, batchSize);
        }
    }
}
