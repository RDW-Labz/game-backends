namespace Schedulers.Idle;

/// <summary>
///     The default <see cref="IIdleSpinPolicy"/>. Lets idle workers look for work about as long as it takes to wake up a
///     sleeping worker on this machine, which it measures while the scheduler runs.
/// </summary>
/// <remarks>
///     Spinning for the duration of a wake-up is the classic answer to the "ski rental" problem: if work arrives in time,
///     spinning saved a wake-up. If it does not, spinning cost about as much as the wake-up would have, so the total cost is at
///     most twice the best a policy could have done without knowing the future. Faster wake-ups, as on some operating systems,
///     lead to shorter spinning and therefore less CPU usage.
///     The duration is kept between a minimum and a maximum, so that a few unusually slow wake-ups cannot make workers spin for ages.
/// </remarks>
public sealed class AdaptiveIdleSpinPolicy : IIdleSpinPolicy
{
    /// <summary>
    ///     The default minimum duration, 20 microseconds.
    /// </summary>
    public static readonly TimeSpan DefaultMinimum = TimeSpan.FromTicks(200);

    /// <summary>
    ///     The default maximum duration, 500 microseconds.
    /// </summary>
    public static readonly TimeSpan DefaultMaximum = TimeSpan.FromTicks(5000);

    /// <summary>
    ///     The default duration until the first wake-up has been measured, 50 microseconds.
    /// </summary>
    public static readonly TimeSpan DefaultInitial = TimeSpan.FromTicks(500);

    // Every measurement moves the average by 1/8 of its distance to the measurement.
    private const int SmoothingShift = 3;

    private readonly long _minimumTicks;
    private readonly long _maximumTicks;
    private long _spinTicks;

    /// <summary>
    ///     Creates a new <see cref="AdaptiveIdleSpinPolicy"/> with the default durations.
    /// </summary>
    public AdaptiveIdleSpinPolicy()
        : this(DefaultInitial, DefaultMinimum, DefaultMaximum)
    {
    }

    /// <summary>
    ///     Creates a new <see cref="AdaptiveIdleSpinPolicy"/>.
    /// </summary>
    /// <param name="initial">How long workers look for work until the first wake-up has been measured.</param>
    /// <param name="minimum">The shortest duration workers will look for work.</param>
    /// <param name="maximum">The longest duration workers will look for work.</param>
    /// <exception cref="ArgumentOutOfRangeException">Thrown unless <c>0 &lt;= minimum &lt;= initial &lt;= maximum</c>.</exception>
    public AdaptiveIdleSpinPolicy(TimeSpan initial, TimeSpan minimum, TimeSpan maximum)
    {
        if (minimum < TimeSpan.Zero || initial < minimum || maximum < initial)
        {
            throw new ArgumentOutOfRangeException(nameof(initial), "The durations must satisfy 0 <= minimum <= initial <= maximum.");
        }

        _minimumTicks = StopwatchTime.ToTicks(minimum);
        _maximumTicks = StopwatchTime.ToTicks(maximum);
        _spinTicks = StopwatchTime.ToTicks(initial);
    }

    /// <inheritdoc />
    public long SpinTicks
    {
        get => Volatile.Read(ref _spinTicks);
    }

    /// <inheritdoc />
    public void OnWakeUp(long latencyTicks)
    {
        // Workers report concurrently. Losing an update is harmless for an average, so there is no need for an atomic update.
        var measurement = Math.Min(Math.Max(latencyTicks, _minimumTicks), _maximumTicks);
        var current = Volatile.Read(ref _spinTicks);
        Volatile.Write(ref _spinTicks, current + ((measurement - current) >> SmoothingShift));
    }
}
