namespace Schedulers.Utils;

/// <summary>
///     Lets an <see cref="IParallelJobProducer"/> run as an <see cref="IJobParallelForBatch"/>, with the batch size being
///     its loop size: full batches go to <see cref="IParallelJobProducer.RunVectorized"/>, the rest to
///     <see cref="IParallelJobProducer.RunSingle"/>.
/// </summary>
/// <typeparam name="T">The type of the producer.</typeparam>
#pragma warning disable CS0618 // The interface is obsolete for users, not for its adapter.
internal struct LegacyProducerAdapter<T> : IJobParallelForBatch where T : struct, IParallelJobProducer
{
    private T _producer;
    private readonly int _loopSize;
    private readonly bool _onlySingle;

    public LegacyProducerAdapter(T producer, int loopSize, bool onlySingle)
    {
        _producer = producer;
        _loopSize = loopSize;
        _onlySingle = onlySingle;
    }

    public void Execute(int start, int count)
    {
        if (!_onlySingle && count == _loopSize)
        {
            _producer.RunVectorized(start, start + count);
            return;
        }

        var end = start + count;
        for (var index = start; index < end; index++)
        {
            _producer.RunSingle(index);
        }
    }
}
#pragma warning restore CS0618
