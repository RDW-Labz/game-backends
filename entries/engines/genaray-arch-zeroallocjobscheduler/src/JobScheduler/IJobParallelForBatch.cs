namespace Schedulers;

/// <summary>
///     The <see cref="IJobParallelForBatch"/> interface
///     represents a job which processes a range of indices in batches, with the batches spread over all workers.
///     Use it over <see cref="IJobParallelFor"/> to handle several indices at once, for example with SIMD.
///     Schedule it with <see cref="Utils.ParallelForExtensions.ScheduleParallelForBatch{T}"/>.
/// </summary>
/// <remarks>
///     The range is cut into batches of the batch size chosen when scheduling. All batches have exactly that size, except
///     the very last one, which gets the rest. Every index is part of exactly one batch.
///     The job is copied for every part of the range, so each part has its own copy of its fields.
/// </remarks>
public interface IJobParallelForBatch
{
    /// <summary>
    ///     Is called by a thread for every batch of the range.
    /// </summary>
    /// <param name="start">The index of the first element of the batch.</param>
    /// <param name="count">The amount of elements in the batch.</param>
    void Execute(int start, int count);
}
