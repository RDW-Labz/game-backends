namespace Schedulers.Utils;

public static class JobSchedulerExtensions
{

    /// <summary>
    ///     Transfers a collection of <see cref="JobHandle"/> instances to the <see cref="Worker"/> so that they can be executed.
    /// </summary>
    /// <param name="jobs">A span of <see cref="JobHandle"/> instances to be distributed.</param>
    public static void Flush(this JobScheduler jobScheduler, Span<JobHandle> jobs)
    {
        foreach (ref var job in jobs)
        {
            jobScheduler.Flush(job);
        }
    }

    /// <summary>
    ///     Waits until all submitted <see cref="JobHandle"/>s are finished and processes unfinished jobs on the main thread in the meantime.
    /// </summary>
    /// <param name="jobScheduler">The <see cref="JobScheduler"/>.</param>
    /// <param name="jobs">An array of <see cref="JobHandle"/>s to wait for.</param>
    public static void Wait(this JobScheduler jobScheduler, params JobHandle[] jobs)
    {
        jobScheduler.Wait(jobs.AsSpan());
    }

    /// <summary>
    ///     Waits until both <see cref="JobHandle"/>s are finished and processes unfinished jobs on the main thread in the meantime.
    ///     Unlike the <c>params</c> overload this does not allocate an array.
    /// </summary>
    /// <param name="jobScheduler">The <see cref="JobScheduler"/>.</param>
    /// <param name="first">The first <see cref="JobHandle"/> to wait for.</param>
    /// <param name="second">The second <see cref="JobHandle"/> to wait for.</param>
    public static void Wait(this JobScheduler jobScheduler, JobHandle first, JobHandle second)
    {
        Span<JobHandle> jobs = stackalloc JobHandle[] { first, second };
        jobScheduler.Wait(jobs);
    }

    /// <summary>
    ///     Waits until all three <see cref="JobHandle"/>s are finished and processes unfinished jobs on the main thread in the meantime.
    ///     Unlike the <c>params</c> overload this does not allocate an array.
    /// </summary>
    /// <param name="jobScheduler">The <see cref="JobScheduler"/>.</param>
    /// <param name="first">The first <see cref="JobHandle"/> to wait for.</param>
    /// <param name="second">The second <see cref="JobHandle"/> to wait for.</param>
    /// <param name="third">The third <see cref="JobHandle"/> to wait for.</param>
    public static void Wait(this JobScheduler jobScheduler, JobHandle first, JobHandle second, JobHandle third)
    {
        Span<JobHandle> jobs = stackalloc JobHandle[] { first, second, third };
        jobScheduler.Wait(jobs);
    }

    /// <summary>
    ///     Waits until all submitted <see cref="JobHandle"/>s are finished and processes unfinished jobs on the main thread in the meantime.
    /// </summary>
    /// <param name="jobScheduler">The <see cref="JobScheduler"/>.</param>
    /// <param name="jobs">A <see cref="Span{T}"/> of <see cref="JobHandle"/>s to wait for.</param>
    public static void Wait(this JobScheduler jobScheduler, Span<JobHandle> jobs)
    {
        var firstUnfinished = 0;
        while (true)
        {
            // Finished handles stay finished, so the ones in front never have to be looked at again.
            while (firstUnfinished < jobs.Length && jobs[firstUnfinished].IsFinished)
            {
                firstUnfinished++;
            }

            if (firstUnfinished == jobs.Length)
            {
                break;
            }

            // Take jobs from the workers and process them on the main.
            if (jobScheduler.TryTakeJob(out var nextJob))
            {
                jobScheduler.Execute(nextJob);
            }
        }

        jobScheduler.ThrowIfJobsFailed();
    }
}
