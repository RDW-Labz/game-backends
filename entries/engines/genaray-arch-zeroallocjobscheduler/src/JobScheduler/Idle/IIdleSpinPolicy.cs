namespace Schedulers.Idle;

/// <summary>
///     Decides how long an idle <see cref="Worker"/> keeps looking for work before it goes to sleep.
/// </summary>
/// <remarks>
///     Looking for work keeps a core busy, but notices new work almost immediately. Sleeping frees the core, but waking up
///     takes much longer. A good policy bridges the gaps between the jobs of a busy phase without spinning during idle phases.
///     Implementations are called by all workers at the same time and must be thread safe.
/// </remarks>
public interface IIdleSpinPolicy
{
    /// <summary>
    ///     How long an idle worker keeps looking for work before it goes to sleep, in <see cref="System.Diagnostics.Stopwatch"/> ticks.
    /// </summary>
    long SpinTicks { get; }

    /// <summary>
    ///     Reports how long it took a sleeping worker to run again after it was woken up.
    ///     Lets a policy adapt to the machine it runs on.
    /// </summary>
    /// <param name="latencyTicks">The time between the wake-up and the worker running again, in <see cref="System.Diagnostics.Stopwatch"/> ticks.</param>
    void OnWakeUp(long latencyTicks);
}
