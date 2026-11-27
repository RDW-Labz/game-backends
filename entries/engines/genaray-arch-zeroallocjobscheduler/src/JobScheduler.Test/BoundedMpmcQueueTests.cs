using System.Runtime.CompilerServices;
using NUnit.Framework;
using Schedulers.Utils;

namespace Schedulers.Test;

[TestFixture]
internal class BoundedMpmcQueueTests
{
    [TestCase(0)]
    [TestCase(1)]
    [TestCase(3)]
    [TestCase(100)]
    public void Constructor_RejectsCapacityThatIsNotAPowerOfTwo(int capacity)
    {
        Assert.Throws<ArgumentException>(() => new BoundedMpmcQueue<int>(capacity));
    }

    [Test]
    public void Dequeue_FromEmptyQueue_Fails()
    {
        var queue = new BoundedMpmcQueue<int>(4);

        Assert.That(queue.TryDequeue(out _), Is.False);
    }

    [Test]
    public void Enqueue_IntoFullQueue_Fails()
    {
        var queue = new BoundedMpmcQueue<int>(4);
        for (var i = 0; i < 4; i++)
        {
            Assert.That(queue.TryEnqueue(i), Is.True);
        }

        Assert.That(queue.TryEnqueue(4), Is.False);
    }

    [Test]
    public void Items_AreDequeuedInFifoOrder()
    {
        var queue = new BoundedMpmcQueue<int>(8);
        for (var i = 0; i < 8; i++)
        {
            queue.TryEnqueue(i);
        }

        for (var i = 0; i < 8; i++)
        {
            Assert.That(queue.TryDequeue(out var item), Is.True);
            Assert.That(item, Is.EqualTo(i));
        }
    }

    [Test]
    public void Queue_WrapsAroundItsCapacityManyTimes()
    {
        var queue = new BoundedMpmcQueue<int>(4);

        for (var i = 0; i < 1000; i++)
        {
            Assert.That(queue.TryEnqueue(i), Is.True);
            Assert.That(queue.TryDequeue(out var item), Is.True);
            Assert.That(item, Is.EqualTo(i));
        }
    }

    [Test]
    public void Dequeue_ReleasesTheReferenceHeldByTheQueue()
    {
        var queue = new BoundedMpmcQueue<object>(2);
        var reference = EnqueueAndDequeueNewObject(queue);

        GC.Collect();

        Assert.That(reference.IsAlive, Is.False);
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static WeakReference EnqueueAndDequeueNewObject(BoundedMpmcQueue<object> queue)
    {
        var item = new object();
        queue.TryEnqueue(item);
        queue.TryDequeue(out _);
        return new WeakReference(item);
    }

    [Test]
    public void ConcurrentProducersAndConsumers_DeliverEveryItemExactlyOnce()
    {
        const int Producers = 4;
        const int Consumers = 4;
        const int ItemsPerProducer = 50_000;
        const int TotalItems = Producers * ItemsPerProducer;

        var queue = new BoundedMpmcQueue<int>(1024);
        var seenCounts = new int[TotalItems];
        var consumed = 0;

        var producerTasks = Enumerable.Range(0, Producers).Select(producer => Task.Run(() =>
        {
            for (var i = 0; i < ItemsPerProducer; i++)
            {
                var item = (producer * ItemsPerProducer) + i;
                while (!queue.TryEnqueue(item))
                {
                    Thread.Yield();
                }
            }
        })).ToArray();

        var consumerTasks = Enumerable.Range(0, Consumers).Select(_ => Task.Run(() =>
        {
            while (Volatile.Read(ref consumed) < TotalItems)
            {
                if (!queue.TryDequeue(out var item))
                {
                    Thread.Yield();
                    continue;
                }

                Interlocked.Increment(ref seenCounts[item]);
                Interlocked.Increment(ref consumed);
            }
        })).ToArray();

        Assert.That(Task.WaitAll(producerTasks.Concat(consumerTasks).ToArray(), TimeSpan.FromSeconds(30)), Is.True);
        Assert.That(seenCounts, Has.All.EqualTo(1));
    }
}
