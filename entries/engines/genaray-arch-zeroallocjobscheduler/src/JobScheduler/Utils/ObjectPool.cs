namespace Schedulers.Utils;

/// <summary>
///     A lock-free pool of objects that grows with the number of objects that are in use at the same time, and never shrinks.
///     Renting and returning does not allocate once the pool has seen its peak demand. Memory is only spent for what was needed once.
/// </summary>
/// <remarks>
///     The pool consists of segments, each a <see cref="BoundedMpmcQueue{T}"/>. A new segment is added when a returned object finds
///     all segments full, which is rare and takes a lock. Everything else is lock-free. An index remembers the segment that
///     worked last, so that renting and returning do not scan all segments.
///     Objects returned beyond the maximum capacity are dropped and left to the garbage collector.
/// </remarks>
/// <typeparam name="T">The type of the pooled objects.</typeparam>
internal sealed class ObjectPool<T> where T : class
{
    private const int SegmentCapacity = 1024;
    private const int MaxSegments = 64;

    private readonly BoundedMpmcQueue<T>?[] _segments = new BoundedMpmcQueue<T>?[MaxSegments];
    private readonly object _growLock = new();
    private int _segmentCount;

    // Only a hint where to look first, it may be outdated or overwritten by another thread without harm.
    private int _lastSegment;

    /// <summary>
    ///     Tries to take an object out of the pool.
    /// </summary>
    /// <param name="item">The object, if any.</param>
    /// <returns><c>false</c> if the pool is empty, in which case the caller has to create an object.</returns>
    public bool TryRent(out T item)
    {
        var segmentCount = Volatile.Read(ref _segmentCount);
        var first = Volatile.Read(ref _lastSegment);

        for (var attempt = 0; attempt < segmentCount; attempt++)
        {
            var segment = (first + attempt) % segmentCount;
            if (_segments[segment]!.TryDequeue(out item))
            {
                _lastSegment = segment;
                return true;
            }
        }

        item = null!;
        return false;
    }

    /// <summary>
    ///     Puts an object back into the pool.
    /// </summary>
    /// <param name="item">The object.</param>
    public void Return(T item)
    {
        while (true)
        {
            var segmentCount = Volatile.Read(ref _segmentCount);
            var first = Volatile.Read(ref _lastSegment);

            for (var attempt = 0; attempt < segmentCount; attempt++)
            {
                var segment = (first + attempt) % segmentCount;
                if (_segments[segment]!.TryEnqueue(item))
                {
                    _lastSegment = segment;
                    return;
                }
            }

            if (!TryAddSegment(segmentCount))
            {
                return;
            }
        }
    }

    /// <summary>
    ///     Adds a segment, unless another thread did already.
    /// </summary>
    /// <param name="observedSegmentCount">The amount of segments the caller found full.</param>
    /// <returns><c>false</c> if the pool has reached its maximum capacity.</returns>
    private bool TryAddSegment(int observedSegmentCount)
    {
        lock (_growLock)
        {
            if (_segmentCount != observedSegmentCount)
            {
                return true;
            }

            if (observedSegmentCount == MaxSegments)
            {
                return false;
            }

            _segments[observedSegmentCount] = new(SegmentCapacity);
            Volatile.Write(ref _segmentCount, observedSegmentCount + 1);
            return true;
        }
    }
}
