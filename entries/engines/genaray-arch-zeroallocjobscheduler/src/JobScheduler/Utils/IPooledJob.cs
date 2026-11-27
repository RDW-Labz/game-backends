namespace Schedulers.Utils;

/// <summary>
///     An <see cref="IJob"/> that hands itself back to a pool once it is done, so that scheduling it does not allocate.
/// </summary>
internal interface IPooledJob : IJob
{
    /// <summary>
    ///     Hands the job back to its pool. Is called by the job at the end of <see cref="IJob.Execute"/>, and by the
    ///     scheduler if the job is skipped because it was cancelled and therefore never executes.
    /// </summary>
    void ReturnToPool();
}
