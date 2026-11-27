using System.Diagnostics;
using Schedulers.Utils;

namespace Schedulers.Idle;

/// <summary>
///     Lets <see cref="Worker"/>s sleep while there is nothing to do and wakes them up when work arrives, so that idle workers
///     do not burn CPU.
/// </summary>
/// <remarks>
///     A worker without work is either <i>searching</i>, which means it keeps looking for work, or <i>sleeping</i>.
///     Producers only wake up a sleeping worker if nobody is searching, as a searching worker will find the new work anyway.
///     A searching worker that finds work wakes up the next one if it was the last searcher, so that sleeping workers
///     join in one after another, rather than all at once and at the expense of the producer.
///     <para>
///     Going to sleep takes three steps, so that no wake-up gets lost:
///     </para>
///     <list type="number">
///         <item><description><see cref="PrepareToSleep"/> announces the worker as sleeping and no longer searching.</description></item>
///         <item><description>The worker looks for work one last time, as work published before the announcement did not wake it.</description></item>
///         <item><description>It either calls <see cref="Sleep"/>, or <see cref="CancelSleep"/> if it found work.</description></item>
///     </list>
///     Producers publish their work first and call <see cref="WakeOne"/> afterwards. Both sides separate their steps with a full
///     memory barrier. Therefore either the worker sees the new work in step 2, or the producer sees that the worker no longer searches.
/// </remarks>
internal sealed class IdleWorkers
{
    private const int Awake = 0;
    private const int Sleeping = 1;

    private sealed class Slot
    {
        public int State;
        public long WakeRequestedTicks;
        public readonly SemaphoreSlim WakeSignal = new(0);
    }

    private readonly Slot[] _slots;
    private readonly IIdleSpinPolicy _spinPolicy;

    // How many workers keep looking for work, and how many sleep. Both are kept in sync with the states of the slots.
    // Allow producers to return quickly, which is the common case while the workers are busy.
    private PaddedLong _searchingCount;
    private PaddedLong _sleepingCount;

    /// <summary>
    ///     Creates a new <see cref="IdleWorkers"/>.
    /// </summary>
    /// <param name="workerCount">The amount of workers.</param>
    /// <param name="spinPolicy">Decides how long searching workers look for work before they sleep. Is told how long wake-ups take.</param>
    public IdleWorkers(int workerCount, IIdleSpinPolicy spinPolicy)
    {
        _spinPolicy = spinPolicy;
        _slots = new Slot[workerCount];
        for (var i = 0; i < workerCount; i++)
        {
            _slots[i] = new();
        }
    }

    /// <summary>
    ///     How long a searching worker looks for work before it should go to sleep, in <see cref="Stopwatch"/> ticks.
    /// </summary>
    public long SpinTicks
    {
        get => _spinPolicy.SpinTicks;
    }

    /// <summary>
    ///     Announces that a worker starts to look for work. A worker which was woken up is searching already.
    /// </summary>
    public void BeginSearching()
    {
        Interlocked.Increment(ref _searchingCount.Value);
    }

    /// <summary>
    ///     Announces that a searching worker found work and will run it. Wakes up a sleeping worker to take over the
    ///     search, if it was the last one searching.
    /// </summary>
    /// <param name="workerId">The id of the worker.</param>
    public void EndSearching(int workerId)
    {
        if (Interlocked.Decrement(ref _searchingCount.Value) == 0)
        {
            WakeOne(workerId);
        }
    }

    /// <summary>
    ///     Announces a searching worker as sleeping, so that producers wake it up from now on.
    ///     Has to be followed by either <see cref="Sleep"/> or <see cref="CancelSleep"/>.
    /// </summary>
    /// <param name="workerId">The id of the worker.</param>
    public void PrepareToSleep(int workerId)
    {
        Interlocked.Exchange(ref _slots[workerId].State, Sleeping);
        Interlocked.Increment(ref _sleepingCount.Value);
        Interlocked.Decrement(ref _searchingCount.Value);
    }

    /// <summary>
    ///     Takes back <see cref="PrepareToSleep"/> because the worker has found something to do or has to stop.
    ///     The worker is neither searching nor sleeping afterwards.
    /// </summary>
    /// <param name="workerId">The id of the worker.</param>
    public void CancelSleep(int workerId)
    {
        var slot = _slots[workerId];
        if (Interlocked.CompareExchange(ref slot.State, Awake, Sleeping) == Sleeping)
        {
            Interlocked.Decrement(ref _sleepingCount.Value);
            WakeOne(workerId);
            return;
        }

        // A producer has already claimed this worker and is about to signal it.
        // Consume that signal, otherwise the next sleep would end immediately.
        slot.WakeSignal.Wait();
        EndSearching(workerId);
    }

    /// <summary>
    ///     Blocks the worker until a producer wakes it up. Must be preceded by <see cref="PrepareToSleep"/>.
    /// </summary>
    /// <param name="workerId">The id of the worker.</param>
    public void Sleep(int workerId)
    {
        var slot = _slots[workerId];
        slot.WakeSignal.Wait();
        _spinPolicy.OnWakeUp(Stopwatch.GetTimestamp() - slot.WakeRequestedTicks);
    }

    /// <summary>
    ///     Wakes up one sleeping worker, unless there is none or a worker is searching anyway.
    ///     To be called after new work has been published.
    /// </summary>
    /// <param name="preferredWorkerId">The worker to wake up if it sleeps, for example because the work was handed to its queue.</param>
    public void WakeOne(int preferredWorkerId)
    {
        // Make the published work visible before looking at the workers, see the remarks of this class.
        Interlocked.MemoryBarrier();
        if (Volatile.Read(ref _searchingCount.Value) > 0 || Volatile.Read(ref _sleepingCount.Value) == 0)
        {
            return;
        }

        for (var i = 0; i < _slots.Length; i++)
        {
            if (TryWake(_slots[(preferredWorkerId + i) % _slots.Length]))
            {
                return;
            }
        }
    }

    /// <summary>
    ///     Wakes up all sleeping workers.
    /// </summary>
    public void WakeAll()
    {
        Interlocked.MemoryBarrier();
        foreach (var slot in _slots)
        {
            TryWake(slot);
        }
    }

    private bool TryWake(Slot slot)
    {
        if (Volatile.Read(ref slot.State) != Sleeping || Interlocked.CompareExchange(ref slot.State, Awake, Sleeping) != Sleeping)
        {
            return false;
        }

        // The woken worker is counted as searching from now on, so that producers do not wake up more workers while it is on its way.
        Interlocked.Increment(ref _searchingCount.Value);
        Interlocked.Decrement(ref _sleepingCount.Value);

        // Lets the worker measure how long it took to wake up.
        slot.WakeRequestedTicks = Stopwatch.GetTimestamp();
        slot.WakeSignal.Release();
        return true;
    }
}
