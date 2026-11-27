using Schedulers.Idle;
using Schedulers.Utils;

[assembly: CLSCompliant(true)]

namespace Schedulers;

/// <summary>
///     A <see cref="JobScheduler"/> schedules and processes <see cref="IJob"/>s asynchronously. Better-suited for larger jobs due to its underlying events.
/// </summary>
public partial class JobScheduler : IDisposable
{
    /// <summary>
    /// Creates an instance and singleton.
    /// </summary>
    /// <param name="threads">The amount of worker threads to use. If zero we will use the amount of processors available.</param>
    /// <param name="idleSpinPolicy">
    /// Decides how long idle workers keep looking for work before they go to sleep.
    /// If <c>null</c>, an <see cref="AdaptiveIdleSpinPolicy"/> adapts to the machine automatically.
    /// Use a <see cref="FixedIdleSpinPolicy"/> or a custom <see cref="IIdleSpinPolicy"/> to override this.
    /// </param>
    public JobScheduler(int threads = 0, IIdleSpinPolicy? idleSpinPolicy = null)
    {
        var amount = threads;
        if (amount == 0)
        {
            amount = Environment.ProcessorCount;
        }

        IdleWorkers = new(amount, idleSpinPolicy ?? new AdaptiveIdleSpinPolicy());

        for (var index = 0; index < amount; index++)
        {
            var worker = new Worker(this, index);
            Workers.Add(worker);
            Queues.Add(worker.Queue);
        }

        foreach (var worker in Workers)
        {
            worker.Start();
        }
    }

    /// <summary>
    /// A list of all <see cref="WorkStealingDeque{T}"/> of the Workers with <see cref="IJob"/>s that are currently being processed.
    /// </summary>
    internal List<WorkStealingDeque<JobHandle>> Queues { get; } = new();

    /// <summary>
    /// All active <see cref="Workers"/>.
    /// </summary>
    internal List<Worker> Workers { get; } = new();

    /// <summary>
    /// Puts <see cref="Workers"/> to sleep while there is no work and wakes them up when there is.
    /// </summary>
    internal IdleWorkers IdleWorkers { get; }

    /// <summary>
    /// Called on the thread that ran the job whenever a job throws an exception. Must not throw itself.
    /// If this is <c>null</c>, the exceptions are collected and thrown by the next <see cref="Wait(JobHandle)"/>
    /// as an <see cref="AggregateException"/>.
    /// A job that throws is treated like a job that finished: waiting threads continue and jobs that depend on it are executed.
    /// </summary>
    public Action<Exception>? JobExceptionHandler
    {
        get => _jobExceptionHandler;
        set => _jobExceptionHandler = value;
    }

    private volatile Action<Exception>? _jobExceptionHandler;
    private readonly JobFailures _failures = new();

    /// <summary>
    /// A counter used to distribute <see cref="IJob"/>s flushed from outside the workers round robin.
    /// Padded, because the workers constantly read the fields next to it.
    /// </summary>
    private PaddedLong _nextWorker;

    /// <summary>
    /// Creates a new <see cref="JobHandle"/> from a <see cref="IJob"/>.
    /// </summary>
    /// <param name="iJob">The <see cref="IJob"/>.</param>
    /// <param name="pooled">Whether the handle should be pooled or not</param>
    /// <returns>The new created <see cref="JobHandle"/>.</returns>
    public JobHandle Schedule(IJob iJob)
    {
        return JobHandle.Pool.RentJobHandle(iJob);
    }

    /// <summary>
    /// Creates a new <see cref="JobHandle"/> from a struct <see cref="IJob"/>.
    /// Unlike passing the struct as a <see cref="IJob"/>, this does not box it, so it does not allocate.
    /// </summary>
    /// <param name="job">The job. It is copied, so changing it afterwards has no effect.</param>
    /// <typeparam name="T">The type of the job.</typeparam>
    /// <returns>The new created <see cref="JobHandle"/>.</returns>
    public JobHandle Schedule<T>(T job) where T : struct, IJob
    {
        return Schedule(PooledStructJob<T>.Rent(job));
    }

    /// <summary>
    /// This is similar to wait but doesn't require a job handle, and allow limiting execution to a certain amount of jobs.
    /// </summary>
    /// <param name="max">The maximum amount of jobs that will be executed, 0 means unlimited</param>
    public void TryToExecuteRemainingJobs(int max = 0)
    {
        var totalExecuted = 0;
        while (TryTakeJob(out var job))
        {
            Execute(job);
            totalExecuted++;
            if (max > 0 && totalExecuted >= max)
            {
                break;
            }
        }

        ThrowIfJobsFailed();
    }

    /// <summary>
    /// Creates a new <see cref="JobHandle"/> from a <see cref="IJob"/> with a <see cref="JobHandle"/> as a parent.
    /// Links the job to the parent. This allows you to wait for the parent until all of its children have been processed.
    /// </summary>
    /// <param name="iJob">The <see cref="IJob"/>.</param>
    /// <param name="parent">The parent <see cref="JobHandle"/>.</param>
    /// <returns>The new <see cref="JobHandle"/>.</returns>
    /// <exception cref="ArgumentException">Thrown when the parent has already finished.</exception>
    public JobHandle Schedule(IJob iJob, JobHandle parent)
    {
        if (parent.IsFinished)
        {
            throw new ArgumentException("The parent has already finished, so it cannot get any more children.", nameof(parent));
        }

        Interlocked.Increment(ref parent.UnfinishedJobs);
        var job = JobHandle.Pool.RentJobHandle(iJob);
        job.Parent = parent.Index;
        return job;
    }

    /// <summary>
    /// Creates a new <see cref="JobHandle"/> from a struct <see cref="IJob"/> with a <see cref="JobHandle"/> as a parent.
    /// Unlike passing the struct as a <see cref="IJob"/>, this does not box it, so it does not allocate.
    /// </summary>
    /// <param name="job">The job. It is copied, so changing it afterwards has no effect.</param>
    /// <param name="parent">The parent <see cref="JobHandle"/>.</param>
    /// <typeparam name="T">The type of the job.</typeparam>
    /// <returns>The new <see cref="JobHandle"/>.</returns>
    /// <exception cref="ArgumentException">Thrown when the parent has already finished.</exception>
    public JobHandle Schedule<T>(T job, JobHandle parent) where T : struct, IJob
    {
        return Schedule(PooledStructJob<T>.Rent(job), parent);
    }

    /// <summary>
    /// Creates a dependency between two <see cref="JobHandle"/>s.
    /// The dependent <see cref="JobHandle"/>s is executed after the target <see cref="JobHandle"/> has finished.
    /// This ensures that a <see cref="JobHandle"/> is executed at a later point in time.
    /// </summary>
    /// <remarks>
    /// A <see cref="JobHandle"/> can depend on any number of other handles, and any number of handles can depend on it.
    /// It is executed once all handles it depends on have finished, so it must not be flushed itself.
    /// Dependencies have to be added before the handle they depend on is flushed.
    /// If it has finished already, there is nothing to wait for and nothing is added.
    /// </remarks>
    /// <param name="dependency">The <see cref="JobHandle"/> dependency.</param>
    /// <param name="dependOn">The <see cref="JobHandle"/> it depends on.</param>
    /// <exception cref="ArgumentException">Thrown when the dependency has already finished.</exception>
    public void AddDependency(JobHandle dependency, JobHandle dependOn)
    {
        ThrowIfFinished(dependency);
        if (dependOn.IsFinished)
        {
            return;
        }

        dependOn.AddDependent(dependency);
    }


    /// <summary>
    /// Transfers a <see cref="JobHandle"/> to the <see cref="Workers"/> so that it can be executed.
    /// </summary>
    /// <remarks>
    /// Called from one of this scheduler's workers (e.g. inside a job), the <see cref="JobHandle"/> goes straight into
    /// that worker's own queue, where idle workers will steal it. Called from any other thread, it is handed to the workers round robin.
    /// </remarks>
    /// <param name="job">The <see cref="JobHandle"/>.</param>
    /// <exception cref="ArgumentException">Thrown when the job has already finished.</exception>
    public void Flush(JobHandle job)
    {
        ThrowIfFinished(job);

        var currentWorker = Worker.GetCurrent(this);
        if (currentWorker != null)
        {
            currentWorker.Queue.PushBottom(job);
            IdleWorkers.WakeOne(currentWorker.Id);
            return;
        }

        FlushRoundRobin(job);
    }

    /// <summary>
    /// Hands a <see cref="JobHandle"/> to the incoming queue of the next worker, skipping workers whose queue is full.
    /// </summary>
    /// <param name="job">The <see cref="JobHandle"/>.</param>
    private void FlushRoundRobin(JobHandle job)
    {
        var workerCount = Workers.Count;
        var firstWorker = (int)(Interlocked.Increment(ref _nextWorker.Value) % workerCount);

        for (var attempt = 0; ; attempt++)
        {
            var workerIndex = (firstWorker + attempt) % workerCount;
            if (Workers[workerIndex].IncomingQueue.TryEnqueue(job))
            {
                IdleWorkers.WakeOne(workerIndex);
                return;
            }

            // Every queue is full, give the workers time to drain them.
            if (attempt % workerCount == workerCount - 1)
            {
                Thread.Yield();
            }
        }
    }

    /// <summary>
    /// Wait until a <see cref="JobHandle"/> and all its children have been completed.
    /// Also works on jobs in the meantime.
    /// </summary>
    /// <param name="job">The <see cref="JobHandle"/>.</param>
    /// <exception cref="AggregateException">
    /// Thrown after waiting if jobs threw exceptions, unless a <see cref="JobExceptionHandler"/> is set.
    /// This includes jobs that are unrelated to <paramref name="job"/>.
    /// </exception>
    public void Wait(JobHandle job)
    {
        while (!job.IsFinished)
        {
            if (TryTakeJob(out var nextJob))
            {
                Execute(nextJob);
            }
        }

        ThrowIfJobsFailed();
    }

    /// <summary>
    /// Throws the exceptions of the jobs that failed since the last call, if there are any.
    /// </summary>
    /// <exception cref="AggregateException">Thrown if jobs failed.</exception>
    internal void ThrowIfJobsFailed()
    {
        _failures.ThrowIfAny();
    }

    /// <summary>
    /// Tries to take a job that has not started yet from any worker, no matter whether it already sits in
    /// the worker's queue or is still waiting in its incoming queue.
    /// Lets threads that wait for jobs help out, instead of waiting until a worker has picked everything up.
    /// </summary>
    /// <param name="job">The taken <see cref="JobHandle"/>, if any.</param>
    /// <returns>True if a job was taken.</returns>
    internal bool TryTakeJob(out JobHandle job)
    {
        for (var i = 0; i < Workers.Count; i++)
        {
            var worker = Workers[i];
            if (worker.Queue.TrySteal(out job) || worker.IncomingQueue.TryDequeue(out job))
            {
                return true;
            }
        }

        job = default;
        return false;
    }

    /// <summary>
    /// Executes a <see cref="JobHandle"/> and finishes it afterwards, unless its cancellation was requested, in which case
    /// it is only finished. A job that throws an exception is finished as well. Otherwise the thread would die and
    /// everything waiting for the job would wait forever.
    /// </summary>
    /// <param name="job">The <see cref="JobHandle"/>.</param>
    internal void Execute(JobHandle job)
    {
        if (job.IsCancellationRequested)
        {
            Discard(job);
        }
        else
        {
            Run(job);
        }

        Finish(job);
    }

    private void Run(JobHandle job)
    {
        try
        {
            job.Job.Execute();
        }
        catch (Exception exception)
        {
            HandleJobException(exception);
        }
    }

    /// <summary>
    /// Gets rid of a job that is not going to be executed.
    /// </summary>
    private static void Discard(JobHandle job)
    {
        // The job would have handed itself back to its pool at the end of its execution.
        if (job.Job is IPooledJob pooledJob)
        {
            pooledJob.ReturnToPool();
        }
    }

    private void HandleJobException(Exception exception)
    {
        var handler = _jobExceptionHandler;
        if (handler == null)
        {
            _failures.Add(exception);
            return;
        }

        try
        {
            handler(exception);
        }
        catch (Exception handlerException)
        {
            _failures.Add(handlerException);
        }
    }

    /// <summary>
    /// Completely ends a <see cref="JobHandle"/> and his children by cleaning it up.
    /// Transfers dependencies and has them executed.
    /// </summary>
    /// <param name="job"></param>
    internal void Finish(JobHandle job)
    {
        var unfinishedJobs = Interlocked.Decrement(ref job.UnfinishedJobs);
        if (unfinishedJobs != 0)
        {
            return;
        }

        // Dependents are released first: they are cancelled together with this job, which needs the parents to be alive still.
        FlushDependents(job);

        if (job.Parent != JobHandle.InvalidIndex)
        {
            Finish(new(job.Parent));
        }

        if(job.UnfinishedJobs <0)
        {
            throw new InvalidOperationException("Unfinished jobs cannot be negative");
        }

        JobHandle.Pool.ReturnHandle(job);
    }

    private static void ThrowIfFinished(JobHandle job)
    {
        if (job.IsFinished)
        {
            throw new ArgumentException("The job has already finished.", nameof(job));
        }
    }

    /// <summary>
    /// Flushes all <see cref="JobHandle"/>s that were waiting for <paramref name="job"/> to finish and have no other
    /// unfinished dependencies left.
    /// </summary>
    /// <param name="job">The finished <see cref="JobHandle"/>.</param>
    private void FlushDependents(JobHandle job)
    {
        // Jobs that depend on a cancelled job are cancelled too, as they would work with the results the job did not deliver.
        var cancelled = job.HasDependencies() && job.IsCancellationRequested;

        while (job.TryTakeDependent(out var dependent))
        {
            if (cancelled)
            {
                JobHandle.Pool.TryCancel(dependent);
            }

            if (dependent.ReleaseDependency())
            {
                Flush(dependent);
            }
        }
    }

    /// <summary>
    /// Cleans this instance and terminates all <see cref="Worker"/>s.
    /// </summary>
    public void Dispose()
    {
        foreach (var worker in Workers)
        {
            worker.Stop();
        }

        // Sleeping workers have to notice that they were stopped.
        IdleWorkers.WakeAll();
    }
}
