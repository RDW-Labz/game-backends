using System.Collections.Concurrent;

namespace Schedulers;

/// <summary>
///     Collects the exceptions thrown by jobs until a thread that waits for jobs picks them up.
/// </summary>
/// <remarks>
///     Only the first <see cref="MaxStoredExceptions"/> exceptions are kept. A job that fails over and over, for example
///     every frame without anyone waiting, must not fill up the memory.
/// </remarks>
internal sealed class JobFailures
{
    private const int MaxStoredExceptions = 32;

    private readonly ConcurrentQueue<Exception> _exceptions = new();
    private int _droppedCount;

    /// <summary>
    ///     Stores an exception thrown by a job. Can be called from any thread.
    /// </summary>
    /// <param name="exception">The exception.</param>
    public void Add(Exception exception)
    {
        if (_exceptions.Count >= MaxStoredExceptions)
        {
            Interlocked.Increment(ref _droppedCount);
            return;
        }

        _exceptions.Enqueue(exception);
    }

    /// <summary>
    ///     Throws all stored exceptions as one <see cref="AggregateException"/>, and forgets them.
    ///     Does nothing if no job failed since the last time.
    /// </summary>
    /// <exception cref="AggregateException">Thrown if jobs failed.</exception>
    public void ThrowIfAny()
    {
        if (_exceptions.IsEmpty)
        {
            return;
        }

        var exceptions = new List<Exception>();
        while (_exceptions.TryDequeue(out var exception))
        {
            exceptions.Add(exception);
        }

        var dropped = Interlocked.Exchange(ref _droppedCount, 0);
        var message = dropped == 0
            ? $"{exceptions.Count} job(s) threw an exception."
            : $"{exceptions.Count + dropped} job(s) threw an exception, only the first {exceptions.Count} are included.";

        throw new AggregateException(message, exceptions);
    }
}
