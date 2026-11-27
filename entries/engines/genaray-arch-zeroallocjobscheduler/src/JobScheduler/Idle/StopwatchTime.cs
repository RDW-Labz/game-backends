using System.Diagnostics;

namespace Schedulers.Idle;

/// <summary>
///     Converts between <see cref="TimeSpan"/> and <see cref="Stopwatch"/> ticks, the unit used to measure idle times.
/// </summary>
internal static class StopwatchTime
{
    public static long ToTicks(TimeSpan duration)
    {
        return (long)(duration.TotalSeconds * Stopwatch.Frequency);
    }
}
