namespace Schedulers;

public partial class JobScheduler
{
    /// <summary>
    /// Requests the cancellation of a job, and of everything that belongs to it: its children, and the jobs that depend on it.
    /// </summary>
    /// <remarks>
    /// Jobs that have not started yet are skipped, but still count as finished, so waiting for them returns and nothing
    /// waits forever. Jobs that are running cannot be interrupted. They can check <see cref="IsCancelled"/> to stop early, and
    /// parallel-for jobs do so between their batches.
    /// Cancelling is not an error, so no exception is thrown for cancelled jobs.
    /// </remarks>
    /// <param name="job">The <see cref="JobHandle"/> of the job.</param>
    /// <returns>False if the job has already finished, in which case there was nothing to cancel.</returns>
    public bool Cancel(JobHandle job)
    {
        return JobHandle.Pool.TryCancel(job);
    }

    /// <summary>
    /// Returns whether the cancellation of a job was requested, or of a job it is a child of.
    /// Can be called by a running job to find out whether it should stop.
    /// </summary>
    /// <param name="job">The <see cref="JobHandle"/> of the job.</param>
    /// <returns>False if the job has already finished.</returns>
    public bool IsCancelled(JobHandle job)
    {
        return !job.IsFinished && job.IsCancellationRequested;
    }
}
