namespace Schedulers.Utils;

/// <summary>
///     Lets an <see cref="IJobParallelFor"/> run as an <see cref="IJobParallelForBatch"/>.
/// </summary>
/// <typeparam name="T">The type of the job.</typeparam>
internal struct ParallelForAdapter<T> : IJobParallelForBatch where T : IJobParallelFor
{
    // Not readonly: calling a method on a readonly struct field would copy the struct on every call.
    private T _job;

    public ParallelForAdapter(T job)
    {
        _job = job;
    }

    public void Execute(int start, int count)
    {
        var end = start + count;
        for (var index = start; index < end; index++)
        {
            _job.Execute(index);
        }
    }
}
