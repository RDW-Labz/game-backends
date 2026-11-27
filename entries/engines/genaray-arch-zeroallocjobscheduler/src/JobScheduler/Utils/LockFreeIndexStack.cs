namespace Schedulers.Utils;

/// <summary>
///     A lock-free stack of the indices <c>0</c> to <c>capacity - 1</c>, which initially contains all of them.
///     Pops and pushes never allocate, so it can serve as a pool of slots in preallocated arrays.
/// </summary>
internal sealed class LockFreeIndexStack
{
    private const ushort Empty = ushort.MaxValue;
    private const int IndexBits = 16;

    // The links of the stack: for every index that is currently on the stack, the index below it.
    private readonly ushort[] _next;

    // The lower bits hold the index on top of the stack, the upper bits a version that changes with every update.
    private PaddedLong _head;

    /// <summary>
    ///     Creates a new <see cref="LockFreeIndexStack"/> that contains all indices.
    /// </summary>
    /// <param name="capacity">The amount of indices, at most <see cref="ushort.MaxValue"/>.</param>
    /// <exception cref="ArgumentOutOfRangeException">Thrown when the capacity is not in the range of 1 to <see cref="ushort.MaxValue"/>.</exception>
    public LockFreeIndexStack(int capacity)
    {
        if (capacity < 1 || capacity > ushort.MaxValue)
        {
            throw new ArgumentOutOfRangeException(nameof(capacity), $"Capacity must be between 1 and {ushort.MaxValue}.");
        }

        _next = new ushort[capacity];
        for (var i = 0; i < capacity - 1; i++)
        {
            _next[i] = (ushort)(i + 1);
        }

        _next[capacity - 1] = Empty;
    }

    /// <summary>
    ///     Tries to take the index on top of the stack.
    /// </summary>
    /// <param name="index">The taken index, if any.</param>
    /// <returns><c>false</c> if the stack is empty.</returns>
    public bool TryPop(out ushort index)
    {
        while (true)
        {
            var head = Volatile.Read(ref _head.Value);
            index = (ushort)head;
            if (index == Empty)
            {
                return false;
            }

            if (Interlocked.CompareExchange(ref _head.Value, CreateHead(head, _next[index]), head) == head)
            {
                return true;
            }
        }
    }

    /// <summary>
    ///     Puts an index back on top of the stack. Only indices which were popped before may be pushed.
    /// </summary>
    /// <param name="index">The index.</param>
    public void Push(ushort index)
    {
        while (true)
        {
            var head = Volatile.Read(ref _head.Value);
            _next[index] = (ushort)head;

            if (Interlocked.CompareExchange(ref _head.Value, CreateHead(head, index), head) == head)
            {
                return;
            }
        }
    }

    // Raising the version with every update prevents the ABA problem: a pop must not succeed just because the
    // same index is on top again after others have popped and pushed it in the meantime.
    private static long CreateHead(long previousHead, ushort topIndex)
    {
        var version = (previousHead >> IndexBits) + 1;
        return (version << IndexBits) | topIndex;
    }
}
