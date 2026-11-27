using Schedulers.Utils;

namespace Schedulers;

/// <summary>
/// The <see cref="JobHandleSoaPool"/> class
/// acts as a pool for meta-data of a <see cref="JobHandle"/> to reduce allocations.
/// </summary>
/// <remarks>
/// The data of all handles is stored in arrays, one per field, and a <see cref="JobHandle"/> is an index into them.
/// Handles are recycled once their job has finished. To tell an old <see cref="JobHandle"/> from the new one that reuses
/// its slot, every slot has a generation which changes with every recycling.
/// </remarks>
public class JobHandleSoaPool
{
    /// <summary>
    /// The bit of <see cref="_status"/> that is set while cancellation of a job was requested.
    /// The lower 16 bits of <see cref="_status"/> hold the generation.
    /// </summary>
    private const int CancelledBit = 1 << 16;

    /// <summary>
    /// An array that stores the parent of each <see cref="JobHandle"/>.
    /// </summary>
    internal readonly ushort[] Parent;

    /// <summary>
    /// An array that stores, for each <see cref="JobHandle"/>, the first node of the list of jobs which wait for it.
    /// The nodes of these lists are stored in <see cref="DependentNodeTargets"/> and <see cref="DependentNodeNexts"/>.
    /// </summary>
    internal readonly ushort[] FirstDependentNode;

    /// <summary>
    /// An array that stores, for each <see cref="JobHandle"/>, for how many other jobs it still waits.
    /// It is executed once this reaches zero.
    /// </summary>
    internal readonly int[] PendingDependencies;

    /// <summary>
    /// An array that stores, for each dependent node, the <see cref="JobHandle"/> which waits.
    /// </summary>
    internal readonly ushort[] DependentNodeTargets;

    /// <summary>
    /// An array that stores, for each dependent node, the next node of the list it is part of.
    /// </summary>
    internal readonly ushort[] DependentNodeNexts;

    /// <summary>
    /// An array that stores the unfished jobs of each <see cref="JobHandle"/>-
    /// </summary>
    internal readonly int[] UnfinishedJobs;

    /// <summary>
    /// An array that stores the <see cref="IJob"/> of each <see cref="JobHandle"/>.
    /// </summary>
    internal readonly IJob[] Jobs;

    /// <summary>
    /// An array that stores the generation of each <see cref="JobHandle"/> in its lower 16 bits, and whether cancellation was requested in
    /// <see cref="CancelledBit"/>. Both live in one value, so that cancelling a handle whose job has finished in the meantime can
    /// never cancel the job which reuses its slot.
    /// </summary>
    private readonly int[] _status;

    /// <summary>
    /// The recycable ids of the handles.
    /// </summary>
    private readonly LockFreeIndexStack _freeIds;

    /// <summary>
    /// The recycable ids of the dependent nodes.
    /// </summary>
    private readonly LockFreeIndexStack _freeDependentNodes;

    /// <summary>
    /// How many handles currently have cancellation requested. Lets the hot path skip all cancellation checks while it is zero.
    /// Padded, as all workers read it all the time.
    /// </summary>
    private PaddedLong _cancelledCount;

    /// <summary>
    /// Creates a new instance.
    /// </summary>
    internal JobHandleSoaPool()
    {
        const ushort MaxCount = ushort.MaxValue;
        _freeIds = new(MaxCount);
        _freeDependentNodes = new(MaxCount);
        Parent = new ushort[MaxCount];
        FirstDependentNode = new ushort[MaxCount];
        PendingDependencies = new int[MaxCount];
        DependentNodeTargets = new ushort[MaxCount];
        DependentNodeNexts = new ushort[MaxCount];
        UnfinishedJobs = new int[MaxCount];
        Jobs = new IJob[MaxCount];
        _status = new int[MaxCount];
    }

    /// <summary>
    /// Rents a new or pooled <see cref="JobHandle"/>.
    /// </summary>
    /// <param name="iJob">The <see cref="IJob"/>.</param>
    /// <returns>A new or pooled <see cref="JobHandle"/> instance.</returns>
    /// <exception cref="Exception">Throws when <see cref="IJob"/> is null.</exception>
    /// <exception cref="InvalidOperationException">Throws if there no more handles available.</exception>
    internal JobHandle RentJobHandle(IJob iJob)
    {
        if (iJob == null)
        {
            throw new("Job cannot be null");
        }

        if (!_freeIds.TryPop(out var index))
        {
            throw new InvalidOperationException("No more handles available");
        }

        Jobs[index] = iJob;
        Parent[index] = JobHandle.InvalidIndex;
        UnfinishedJobs[index] = 1;
        FirstDependentNode[index] = JobHandle.InvalidIndex;
        PendingDependencies[index] = 0;

        return new(index, GetGeneration(index));
    }

    /// <summary>
    /// Returns a new or pooled <see cref="JobHandle"/> to the pool.
    /// </summary>
    /// <param name="handle">The <see cref="JobHandle"/>.</param>
    public void ReturnHandle(JobHandle handle)
    {
        // Do not keep finished jobs (and everything they reference) alive.
        Jobs[handle.Index] = null!;

        // Only now old handles stop being recognized as such. The slot is not reused before it is back on the stack.
        StartNextGeneration(handle.Index);
        _freeIds.Push(handle.Index);
    }

    /// <summary>
    /// Returns the generation of a slot, which is the generation of the <see cref="JobHandle"/> that lives in it.
    /// </summary>
    internal ushort GetGeneration(ushort index)
    {
        return (ushort)Volatile.Read(ref _status[index]);
    }

    /// <summary>
    /// Returns whether the job of a <see cref="JobHandle"/> is finished. This includes all its children, and handles
    /// which are recycled already.
    /// </summary>
    internal bool IsFinished(JobHandle handle)
    {
        // Checked in this order: if the slot is recycled in between, the generation changes and we are told so on the next check.
        return GetGeneration(handle.Index) != handle.Generation || Volatile.Read(ref UnfinishedJobs[handle.Index]) <= 0;
    }

    /// <summary>
    /// Requests the cancellation of a job.
    /// </summary>
    /// <returns>False if the job has already finished.</returns>
    internal bool TryCancel(JobHandle handle)
    {
        ref var status = ref _status[handle.Index];
        while (true)
        {
            var current = Volatile.Read(ref status);
            if (IsFinished(handle))
            {
                return false;
            }

            if ((current & CancelledBit) != 0)
            {
                return true;
            }

            if (Interlocked.CompareExchange(ref status, current | CancelledBit, current) == current)
            {
                Interlocked.Increment(ref _cancelledCount.Value);
                return true;
            }
        }
    }

    /// <summary>
    /// Returns whether cancellation is requested for a job, or for one of the jobs it is a child of.
    /// The slot must belong to a job that has not finished.
    /// </summary>
    internal bool IsCancellationRequested(ushort index)
    {
        // The count is transiently off while a cancellation or a return is in progress, which is fine: cancelling is best effort.
        if (Volatile.Read(ref _cancelledCount.Value) == 0)
        {
            return false;
        }

        for (var current = index; current != JobHandle.InvalidIndex; current = Parent[current])
        {
            if ((Volatile.Read(ref _status[current]) & CancelledBit) != 0)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// How many handles currently have cancellation requested.
    /// </summary>
    internal int CancelledCount
    {
        get => (int)Volatile.Read(ref _cancelledCount.Value);
    }

    /// <summary>
    /// Rents a node, which links a waiting <see cref="JobHandle"/> into the list of the <see cref="JobHandle"/> it waits for.
    /// </summary>
    /// <returns>The index of the node.</returns>
    /// <exception cref="InvalidOperationException">Throws if there no more nodes available.</exception>
    internal ushort RentDependentNode()
    {
        if (!_freeDependentNodes.TryPop(out var node))
        {
            throw new InvalidOperationException("No more dependencies available");
        }

        return node;
    }

    /// <summary>
    /// Returns a node to the pool.
    /// </summary>
    /// <param name="node">The index of the node.</param>
    internal void ReturnDependentNode(ushort node)
    {
        _freeDependentNodes.Push(node);
    }

    /// <summary>
    /// Raises the generation of a slot and clears its cancellation request.
    /// </summary>
    private void StartNextGeneration(ushort index)
    {
        ref var status = ref _status[index];
        while (true)
        {
            var current = Volatile.Read(ref status);
            var next = (ushort)(current + 1);
            if (Interlocked.CompareExchange(ref status, next, current) != current)
            {
                continue;
            }

            if ((current & CancelledBit) != 0)
            {
                Interlocked.Decrement(ref _cancelledCount.Value);
            }

            return;
        }
    }
}

/// <summary>
/// The <see cref="JobHandle"/> struct
/// is used to control and await a scheduled <see cref="IJob"/>.
/// </summary>
/// <remarks>
/// A handle is only valid until its job has finished. After that its slot is recycled for other jobs. The generation lets
/// the scheduler recognize such a stale handle: waiting for it returns immediately, cancelling it does nothing.
/// </remarks>
public struct JobHandle
{
    /// <summary>
    /// The <see cref="JobHandleSoaPool"/> for pooling and to reduce allocations.
    /// </summary>
    internal static readonly JobHandleSoaPool Pool = new();

    /// <summary>
    /// Marks the absence of a <see cref="JobHandle"/>, for example no parent or no dependency.
    /// </summary>
    internal const ushort InvalidIndex = ushort.MaxValue;

    /// <summary>
    /// The index of this <see cref="JobHandle"/>, pointing towards its data inside the <see cref="Pool"/>.
    /// </summary>
    public ushort Index;

    /// <summary>
    /// The generation of the slot at <see cref="Index"/> when this <see cref="JobHandle"/> was created.
    /// </summary>
    public ushort Generation;

    /// <summary>
    /// Creates a <see cref="JobHandle"/> for the job that currently lives in the slot <paramref name="id"/>.
    /// </summary>
    /// <param name="id">Its id.</param>
    public JobHandle(ushort id)
    {
        Index = id;
        Generation = Pool.GetGeneration(id);
    }

    /// <summary>
    /// Creates a <see cref="JobHandle"/> for a slot and generation.
    /// </summary>
    internal JobHandle(ushort index, ushort generation)
    {
        Index = index;
        Generation = generation;
    }

    /// <summary>
    /// The associated <see cref="IJob"/> of this instance.
    /// </summary>
    public ref IJob Job
    {
        get => ref Pool.Jobs[Index];
    }

    /// <summary>
    /// The parent of this instance.
    /// </summary>
    public ref ushort Parent
    {
        get => ref Pool.Parent[Index];
    }

    /// <summary>
    /// The first node of the list of <see cref="JobHandle"/>s waiting for this instance, or <see cref="InvalidIndex"/>.
    /// </summary>
    internal ref ushort FirstDependentNode
    {
        get => ref Pool.FirstDependentNode[Index];
    }

    /// <summary>
    /// The amount of <see cref="JobHandle"/>s this instance still waits for before it can be executed.
    /// </summary>
    internal ref int PendingDependencies
    {
        get => ref Pool.PendingDependencies[Index];
    }

    /// <summary>
    /// Unfinished child jobs, in case that this one is a parent.
    /// </summary>
    public ref int UnfinishedJobs
    {
        get => ref Pool.UnfinishedJobs[Index];
    }

    /// <summary>
    /// Whether the job of this instance and all its children have finished.
    /// </summary>
    public bool IsFinished
    {
        get => Pool.IsFinished(this);
    }

    /// <summary>
    /// Whether cancellation was requested for this job, or for a job it is a child of.
    /// Only valid for handles of jobs that have not finished.
    /// </summary>
    internal bool IsCancellationRequested
    {
        get => Pool.IsCancellationRequested(Index);
    }

    /// <summary>
    /// Sets a <see cref="JobHandle"/> this instance depends on.
    /// </summary>
    /// <param name="toDependOn"></param>
    public void SetDependsOn(JobHandle toDependOn)
    {
        Interlocked.Increment(ref toDependOn.UnfinishedJobs);
        Parent = toDependOn.Index;
    }

    /// <summary>
    /// Returns whether other jobs depend on this instance.
    /// </summary>
    /// <returns></returns>
    public bool HasDependencies()
    {
        return FirstDependentNode != InvalidIndex;
    }

    /// <summary>
    /// Registers a <see cref="JobHandle"/> that has to wait for this instance.
    /// It is executed once this instance and all other instances it waits for have finished.
    /// </summary>
    /// <param name="dependent">The <see cref="JobHandle"/> that depends on this instance.</param>
    /// <remarks>
    /// Not thread safe, dependencies must be registered before this instance is flushed.
    /// </remarks>
    internal void AddDependent(JobHandle dependent)
    {
        var node = Pool.RentDependentNode();
        Interlocked.Increment(ref dependent.PendingDependencies);

        Pool.DependentNodeTargets[node] = dependent.Index;
        Pool.DependentNodeNexts[node] = FirstDependentNode;
        FirstDependentNode = node;
    }

    /// <summary>
    /// Takes one <see cref="JobHandle"/> that waits for this instance off its list of dependents.
    /// </summary>
    /// <param name="dependent">The taken <see cref="JobHandle"/>, if any.</param>
    /// <returns>False if no <see cref="JobHandle"/> is waiting for this instance anymore.</returns>
    internal bool TryTakeDependent(out JobHandle dependent)
    {
        var node = FirstDependentNode;
        if (node == InvalidIndex)
        {
            dependent = default;
            return false;
        }

        dependent = new JobHandle(Pool.DependentNodeTargets[node]);
        FirstDependentNode = Pool.DependentNodeNexts[node];
        Pool.ReturnDependentNode(node);
        return true;
    }

    /// <summary>
    /// Marks one of the <see cref="JobHandle"/>s this instance waits for as finished.
    /// </summary>
    /// <returns>True if this was the last one, which means this instance is ready to be executed.</returns>
    internal bool ReleaseDependency()
    {
        return Interlocked.Decrement(ref PendingDependencies) == 0;
    }
}
