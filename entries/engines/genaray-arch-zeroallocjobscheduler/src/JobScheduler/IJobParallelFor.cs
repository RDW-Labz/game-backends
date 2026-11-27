namespace Schedulers;

/// <summary>
///     The <see cref="IJobParallelFor"/> interface
///     represents a job which is executed once for every index of a range, with the indices spread over all workers.
///     Schedule it with <see cref="Utils.JobSchedulerExtensions.ScheduleParallelFor{T}"/>.
/// </summary>
/// <remarks>
///     A job that is a <c>struct</c> is copied for every part of the range, so each part has its own copy of its fields
///     and the call can be inlined. A job that is a <c>class</c> is shared by all parts: it saves the copies and allows
///     reusing one instance, but everything it writes to has to be thread safe.
///     Each index is passed to <see cref="Execute"/> exactly once.
/// </remarks>
public interface IJobParallelFor
{
    /// <summary>
    ///     Is called by a thread for every index of the range.
    /// </summary>
    /// <param name="index">The index, from zero up to but excluding the amount passed when scheduling the job.</param>
    void Execute(int index);
}
