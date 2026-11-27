namespace Schedulers.Utils;

/// <summary>
///     A bounded, lock-free, multi-producer multi-consumer FIFO queue, based on Dmitry Vyukov's bounded MPMC queue.
///     All memory is allocated up front, so enqueueing and dequeueing never allocate. This is in contrast to
///     <see cref="System.Collections.Concurrent.ConcurrentQueue{T}"/>, which allocates a new segment whenever one fills up.
/// </summary>
/// <remarks>
///     Every cell carries a sequence number that tells producers and consumers whose turn it is:
///     <list type="bullet">
///         <item><description><c>sequence == position</c>: the cell is free for the producer at <c>position</c>.</description></item>
///         <item><description><c>sequence == position + 1</c>: the cell holds an item for the consumer at <c>position</c>.</description></item>
///         <item><description>Anything lower means the queue is full (producer) or empty (consumer).</description></item>
///     </list>
/// </remarks>
/// <typeparam name="T">The item type.</typeparam>
internal sealed class BoundedMpmcQueue<T>
{
    private struct Cell
    {
        public long Sequence;
        public T Value;
    }

    private readonly Cell[] _cells;
    private readonly int _mask;

    // Producers and consumers hammer different positions, keep them on separate cache lines.
    private PaddedLong _enqueuePosition;
    private PaddedLong _dequeuePosition;

    /// <summary>
    ///     Creates a new <see cref="BoundedMpmcQueue{T}"/>.
    /// </summary>
    /// <param name="capacity">The maximum amount of items. Must be a power of two and at least 2.</param>
    /// <exception cref="ArgumentException">Thrown when the capacity is not a power of two or smaller than 2.</exception>
    public BoundedMpmcQueue(int capacity)
    {
        if (capacity < 2 || (capacity & (capacity - 1)) != 0)
        {
            throw new ArgumentException("Capacity must be a power of two and at least 2.", nameof(capacity));
        }

        _cells = new Cell[capacity];
        _mask = capacity - 1;

        for (var i = 0; i < capacity; i++)
        {
            _cells[i].Sequence = i;
        }
    }

    /// <summary>
    ///     Tries to append an item.
    /// </summary>
    /// <param name="item">The item.</param>
    /// <returns><c>false</c> if the queue is full.</returns>
    public bool TryEnqueue(T item)
    {
        var position = Volatile.Read(ref _enqueuePosition.Value);
        while (true)
        {
            ref var cell = ref _cells[(int)(position & _mask)];
            var difference = Volatile.Read(ref cell.Sequence) - position;

            if (difference == 0)
            {
                // The cell is free, claim it by moving the enqueue position past it.
                if (Interlocked.CompareExchange(ref _enqueuePosition.Value, position + 1, position) == position)
                {
                    cell.Value = item;
                    Volatile.Write(ref cell.Sequence, position + 1);
                    return true;
                }
            }
            else if (difference < 0)
            {
                return false;
            }

            // Lost the race against another producer, or our position was stale.
            position = Volatile.Read(ref _enqueuePosition.Value);
        }
    }

    /// <summary>
    ///     Tries to remove the oldest item.
    /// </summary>
    /// <param name="item">The removed item, if any.</param>
    /// <returns><c>false</c> if the queue is empty.</returns>
    public bool TryDequeue(out T item)
    {
        var position = Volatile.Read(ref _dequeuePosition.Value);
        while (true)
        {
            ref var cell = ref _cells[(int)(position & _mask)];
            var difference = Volatile.Read(ref cell.Sequence) - (position + 1);

            if (difference == 0)
            {
                // The cell holds an item, claim it by moving the dequeue position past it.
                if (Interlocked.CompareExchange(ref _dequeuePosition.Value, position + 1, position) == position)
                {
                    item = cell.Value;
                    cell.Value = default!;

                    // Hand the cell back to the producer that will reach it one lap later.
                    Volatile.Write(ref cell.Sequence, position + _mask + 1);
                    return true;
                }
            }
            else if (difference < 0)
            {
                item = default!;
                return false;
            }

            // Lost the race against another consumer, or our position was stale.
            position = Volatile.Read(ref _dequeuePosition.Value);
        }
    }
}
