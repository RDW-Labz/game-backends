using System.Runtime.InteropServices;

namespace Schedulers.Utils;

/// <summary>
///     A <see cref="long"/> that owns a whole cache line (and its neighbours' halves). Fields of this type never share a
///     cache line with other fields, which prevents false sharing between threads that write to different counters.
/// </summary>
[StructLayout(LayoutKind.Explicit, Size = 128)]
internal struct PaddedLong
{
    [FieldOffset(64)]
    public long Value;
}
