using System.Diagnostics;
using Schedulers.Idle;
using Schedulers.Utils;

namespace Schedulers;

/// <summary>
/// Represents a thread which has a <see cref="WorkStealingDeque{T}"/> and processes <see cref="JobHandle"/>s.
/// Steals <see cref="JobHandle"/>s from other workers if it has nothing more to do,
/// and sleeps if there is nothing to steal either.
/// </summary>
internal class Worker
{
    /// <summary>
    /// Incoming jobs are only moved into the local queue while it holds fewer jobs than this,
    /// so that a busy worker does not hoard jobs that idle workers could steal from the incoming queue.
    /// </summary>
    private const int MaxJobsTransferredFromIncomingQueue = 32;

    /// <summary>
    /// How many <see cref="JobHandle"/>s the incoming queue holds. Has to be a power of two.
    /// </summary>
    private const int IncomingQueueCapacity = 4096;

    /// <summary>
    /// The initial capacity of the local queue. Large enough for a job that splits into many children.
    /// </summary>
    private const int LocalQueueCapacity = 256;

    /// <summary>
    /// How long a spinning worker pauses between two searches for work. Keeps it from hammering the queues of the other workers.
    /// </summary>
    private const int PauseBetweenSearches = 10;

    [ThreadStatic] private static Worker? _current;

    private readonly int _workerId;
    private readonly Thread _thread;

    private readonly BoundedMpmcQueue<JobHandle> _incomingQueue;
    private readonly WorkStealingDeque<JobHandle> _queue;

    private readonly JobScheduler _jobScheduler;
    private readonly IdleWorkers _idleWorkers;
    private volatile CancellationTokenSource _cancellationToken;

    /// <summary>
    /// Creates a new <see cref="Worker"/>.
    /// </summary>
    /// <param name="jobScheduler">Its <see cref="JobScheduler"/>.</param>
    /// <param name="id">Its <see cref="id"/>.</param>
    public Worker(JobScheduler jobScheduler, int id)
    {
        _workerId = id;

        _incomingQueue = new(IncomingQueueCapacity);
        _queue = new(LocalQueueCapacity);

        _jobScheduler = jobScheduler;
        _idleWorkers = jobScheduler.IdleWorkers;
        _cancellationToken = new();

        // Workers must not keep the process alive when the scheduler is not disposed.
        _thread = new(() => Run(_cancellationToken.Token))
        {
            IsBackground = true,
            Name = $"{nameof(JobScheduler)} worker {id}",
        };
    }

    /// <summary>
    /// The id of this <see cref="Worker"/>, which is its index in <see cref="JobScheduler.Workers"/>.
    /// </summary>
    public int Id
    {
        get => _workerId;
    }

    /// <summary>
    /// Returns the <see cref="Worker"/> of <paramref name="jobScheduler"/> which runs on the calling thread.
    /// </summary>
    /// <param name="jobScheduler">The <see cref="JobScheduler"/>.</param>
    /// <returns>The <see cref="Worker"/>, or <c>null</c> if the calling thread is not one of its workers.</returns>
    public static Worker? GetCurrent(JobScheduler jobScheduler)
    {
        var current = _current;
        return current != null && current._jobScheduler == jobScheduler ? current : null;
    }

    /// <summary>
    /// Its <see cref="BoundedMpmcQueue{T}"/> with <see cref="JobHandle"/>s which are transferred into the <see cref="Queue"/>.
    /// Used by threads which are not workers to hand over jobs.
    /// </summary>
    public BoundedMpmcQueue<JobHandle> IncomingQueue
    {
        get => _incomingQueue;
    }

    /// <summary>
    /// Its <see cref="WorkStealingDeque{T}"/> with <see cref="JobHandle"/>s to process.
    /// </summary>
    public WorkStealingDeque<JobHandle> Queue
    {
        get => _queue;
    }

    /// <summary>
    /// Starts this instance.
    /// </summary>
    public void Start()
    {
        _thread.Start();
    }

    /// <summary>
    /// Stops this instance.
    /// </summary>
    public void Stop()
    {
        _cancellationToken.Cancel();
    }

    /// <summary>
    /// Runs this instance to process its <see cref="JobHandle"/>s.
    /// Steals from other <see cref="Worker"/>s if its own <see cref="_queue"/> is empty,
    /// and falls asleep if there is nothing to steal for a while.
    /// </summary>
    /// <param name="token"></param>
    private void Run(CancellationToken token)
    {
        _current = this;
        try
        {
            while (!token.IsCancellationRequested)
            {
                if (TryFindJob(out var job) || TrySearchForJob(token, out job))
                {
                    _jobScheduler.Execute(job);
                }
            }
        }
        catch (OperationCanceledException)
        {
            //Console.WriteLine("Operation was canceled");
        }
        finally
        {
            _current = null;
        }
    }

    /// <summary>
    /// Tries to find a job in the local queue, the incoming queue or the queues of other workers.
    /// </summary>
    /// <param name="job">The found <see cref="JobHandle"/>, if any.</param>
    /// <returns>True if a job was found.</returns>
    private bool TryFindJob(out JobHandle job)
    {
        MoveIncomingJobsToLocalQueue();
        return _queue.TryPopBottom(out job) || TryStealJob(out job);
    }

    /// <summary>
    /// Looks for a job in an increasingly patient way: first for a short while without a break, then with sleeping in between.
    /// </summary>
    /// <param name="token">The token which stops this worker.</param>
    /// <param name="job">The found <see cref="JobHandle"/>, if any.</param>
    /// <returns>True if a job was found.</returns>
    private bool TrySearchForJob(CancellationToken token, out JobHandle job)
    {
        _idleWorkers.BeginSearching();
        while (!token.IsCancellationRequested)
        {
            if (TrySpinForJob(token, out job))
            {
                _idleWorkers.EndSearching(_workerId);
                return true;
            }

            if (TrySleepUntilJob(token, out job))
            {
                return true;
            }

            // Another thread woke us up and counted us as searching again, so keep looking.
        }

        job = default;
        return false;
    }

    /// <summary>
    /// Keeps looking for a job for a short while, so that jobs which arrive soon after are picked up without waking up first.
    /// How long is up to the <see cref="IIdleSpinPolicy"/> of the <see cref="JobScheduler"/>.
    /// </summary>
    /// <param name="token">The token which stops this worker.</param>
    /// <param name="job">The found <see cref="JobHandle"/>, if any.</param>
    /// <returns>True if a job was found.</returns>
    private bool TrySpinForJob(CancellationToken token, out JobHandle job)
    {
        var deadline = Stopwatch.GetTimestamp() + _idleWorkers.SpinTicks;
        while (Stopwatch.GetTimestamp() < deadline && !token.IsCancellationRequested)
        {
            if (TryFindJob(out job))
            {
                return true;
            }

            Thread.SpinWait(PauseBetweenSearches);
        }

        job = default;
        return false;
    }

    /// <summary>
    /// Sleeps until another thread wakes this worker up, which happens when it publishes a job or stops the worker.
    /// Must only be called by a searching worker.
    /// </summary>
    /// <param name="token">The token which stops this worker.</param>
    /// <param name="job">A <see cref="JobHandle"/> found right before going to sleep. Otherwise nothing.</param>
    /// <returns>True if a job was found instead of sleeping.</returns>
    private bool TrySleepUntilJob(CancellationToken token, out JobHandle job)
    {
        _idleWorkers.PrepareToSleep(_workerId);

        // Jobs and stop requests published before the announcement above did not wake us up. Make sure we do not oversleep them.
        var foundJob = TryFindJob(out job);
        if (foundJob || token.IsCancellationRequested)
        {
            _idleWorkers.CancelSleep(_workerId);
            return foundJob;
        }

        _idleWorkers.Sleep(_workerId);
        return false;
    }

    /// <summary>
    /// Passes jobs handed over by other threads to the local queue.
    /// </summary>
    private void MoveIncomingJobsToLocalQueue()
    {
        while (_queue.Size() < MaxJobsTransferredFromIncomingQueue && _incomingQueue.TryDequeue(out var jobHandle))
        {
            _queue.PushBottom(jobHandle);
        }
    }

    /// <summary>
    /// Tries to steal a job from another worker.
    /// </summary>
    /// <param name="job">The stolen <see cref="JobHandle"/>, if any.</param>
    /// <returns>True if a job was stolen.</returns>
    private bool TryStealJob(out JobHandle job)
    {
        var workers = _jobScheduler.Workers;

        // Start with the next worker rather than the first one, so that not all idle workers contend for the same queue.
        // Jobs still in the incoming queue of a busy worker can be taken as well.
        for (var offset = 1; offset < workers.Count; offset++)
        {
            var victim = workers[(_workerId + offset) % workers.Count];
            if (victim.Queue.TrySteal(out job) || victim.IncomingQueue.TryDequeue(out job))
            {
                return true;
            }
        }

        job = default;
        return false;
    }
}
