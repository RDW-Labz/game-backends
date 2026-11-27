using NUnit.Framework;
using Schedulers.Utils;

namespace Schedulers.Test;

[TestFixture]
internal class ObjectPoolTests
{
    private sealed class Item
    {
    }

    [Test]
    public void EmptyPool_HasNothingToRent()
    {
        var pool = new ObjectPool<Item>();

        Assert.That(pool.TryRent(out _), Is.False);
    }

    [Test]
    public void ReturnedObject_CanBeRentedAgain()
    {
        var pool = new ObjectPool<Item>();
        var item = new Item();

        pool.Return(item);

        Assert.That(pool.TryRent(out var rented), Is.True);
        Assert.That(rented, Is.SameAs(item));
        Assert.That(pool.TryRent(out _), Is.False);
    }

    [Test]
    public void Pool_GrowsWithTheAmountOfObjectsInUse()
    {
        var pool = new ObjectPool<Item>();
        const int Count = 5_000;
        var items = Enumerable.Range(0, Count).Select(_ => new Item()).ToArray();

        foreach (var item in items)
        {
            pool.Return(item);
        }

        var rented = new HashSet<Item>();
        while (pool.TryRent(out var item))
        {
            Assert.That(rented.Add(item), Is.True, "an object was rented twice");
        }

        Assert.That(rented, Is.EquivalentTo(items));
    }

    [Test]
    public void Pool_DropsObjectsBeyondItsMaximumCapacity()
    {
        var pool = new ObjectPool<Item>();

        for (var i = 0; i < 70_000; i++)
        {
            pool.Return(new Item());
        }

        var count = 0;
        while (pool.TryRent(out _))
        {
            count++;
        }

        Assert.That(count, Is.EqualTo(64 * 1024));
    }

    [Test]
    public void ConcurrentRentAndReturn_NeverHandsOutAnObjectTwice()
    {
        var pool = new ObjectPool<Item>();
        const int Threads = 8;
        const int Rounds = 50_000;
        var inUse = new System.Collections.Concurrent.ConcurrentDictionary<Item, bool>();
        var violations = 0;

        var tasks = Enumerable.Range(0, Threads).Select(_ => Task.Run(() =>
        {
            var local = new List<Item>();
            for (var round = 0; round < Rounds; round++)
            {
                if (!pool.TryRent(out var item))
                {
                    item = new Item();
                }

                if (!inUse.TryAdd(item, true))
                {
                    Interlocked.Increment(ref violations);
                }

                local.Add(item);
                if (local.Count >= 3000)
                {
                    foreach (var returned in local)
                    {
                        inUse.TryRemove(returned, out bool _);
                        pool.Return(returned);
                    }

                    local.Clear();
                }
            }
        })).ToArray();

        Assert.That(Task.WaitAll(tasks, TimeSpan.FromSeconds(60)), Is.True);
        Assert.That(violations, Is.Zero);
    }
}
