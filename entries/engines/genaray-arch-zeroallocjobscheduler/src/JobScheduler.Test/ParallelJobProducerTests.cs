using NUnit.Framework;
using Schedulers.Utils;

namespace Schedulers.Test;

/// <summary>
///     The legacy producer API still has to work, even though it is obsolete.
/// </summary>
#pragma warning disable CS0618
internal class ParallelJobProducerTests
{
    private struct CountingProducer : IParallelJobProducer
    {
        public int[] Hits;

        public void RunVectorized(int start, int end)
        {
            for (var i = start; i < end; i++)
            {
                RunSingle(i);
            }
        }

        public void RunSingle(int index)
        {
            Interlocked.Increment(ref Hits[index]);
        }
    }

    [Test]
    public void EveryIndexIsProcessedExactlyOnce([Values(1, 2, 15, 16, 17, 1_000, 100_003)] int size, [Values(true, false)] bool onlySingle)
    {
        using var scheduler = new JobScheduler();
        var hits = new int[size];

        var producer = new ParallelJobProducer<CountingProducer>(size, new CountingProducer { Hits = hits }, scheduler, onlySingle: onlySingle);
        scheduler.Wait(producer.GetHandle());

        Assert.That(hits, Has.All.EqualTo(1));
    }

    [Test]
    public void RepeatedRuns_ReusePooledChildrenCorrectly()
    {
        using var scheduler = new JobScheduler();

        for (var run = 0; run < 200; run++)
        {
            var hits = new int[5_000];
            var producer = new ParallelJobProducer<CountingProducer>(hits.Length, new CountingProducer { Hits = hits }, scheduler);
            scheduler.Wait(producer.GetHandle());

            Assert.That(hits, Has.All.EqualTo(1), $"run {run}");
        }
    }
}
#pragma warning restore CS0618
