namespace Schedulers.Idle;

/// <summary>
///     An <see cref="IIdleSpinPolicy"/> that lets idle workers look for work for the same, fixed duration every time.
///     Use <see cref="TimeSpan.Zero"/> to let workers sleep as soon as they run out of work.
/// </summary>
public sealed class FixedIdleSpinPolicy : IIdleSpinPolicy
{
    /// <summary>
    ///     Creates a new <see cref="FixedIdleSpinPolicy"/>.
    /// </summary>
    /// <param name="duration">How long idle workers keep looking for work before they go to sleep.</param>
    /// <exception cref="ArgumentOutOfRangeException">Thrown when the duration is negative.</exception>
    public FixedIdleSpinPolicy(TimeSpan duration)
    {
        if (duration < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(duration), "The duration must not be negative.");
        }

        SpinTicks = StopwatchTime.ToTicks(duration);
    }

    /// <inheritdoc />
    public long SpinTicks { get; }

    /// <inheritdoc />
    public void OnWakeUp(long latencyTicks)
    {
    }
}
