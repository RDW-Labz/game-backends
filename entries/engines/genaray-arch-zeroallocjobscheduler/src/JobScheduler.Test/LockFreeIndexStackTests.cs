using NUnit.Framework;
using Schedulers.Utils;

namespace Schedulers.Test;

[TestFixture]
internal class LockFreeIndexStackTests
{
    [TestCase(0)]
    [TestCase(-1)]
    [TestCase(ushort.MaxValue + 1)]
    public void Constructor_RejectsInvalidCapacity(int capacity)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new LockFreeIndexStack(capacity));
    }

    [Test]
    public void Pop_YieldsEveryIndexOnceThenFails()
    {
        var stack = new LockFreeIndexStack(100);
        var popped = new HashSet<ushort>();

        while (stack.TryPop(out var index))
        {
            Assert.That(popped.Add(index), Is.True, $"index {index} was popped twice");
        }

        Assert.That(popped, Has.Count.EqualTo(100));
        Assert.That(popped.Max(), Is.EqualTo(99));
    }

    [Test]
    public void Pop_WorksForTheLargestCapacity()
    {
        var stack = new LockFreeIndexStack(ushort.MaxValue);
        var count = 0;

        while (stack.TryPop(out _))
        {
            count++;
        }

        Assert.That(count, Is.EqualTo(ushort.MaxValue));
    }

    [Test]
    public void Push_MakesTheIndexAvailableAgain()
    {
        var stack = new LockFreeIndexStack(1);

        Assert.That(stack.TryPop(out var index), Is.True);
        Assert.That(stack.TryPop(out _), Is.False);

        stack.Push(index);

        Assert.That(stack.TryPop(out var again), Is.True);
        Assert.That(again, Is.EqualTo(index));
    }

    [Test]
    public void ConcurrentPopAndPush_NeverHandsOutAnIndexTwice()
    {
        const int Capacity = 64;
        const int Threads = 8;
        const int Rounds = 100_000;

        var stack = new LockFreeIndexStack(Capacity);
        var owned = new int[Capacity];
        var violations = 0;

        var tasks = Enumerable.Range(0, Threads).Select(_ => Task.Run(() =>
        {
            for (var round = 0; round < Rounds; round++)
            {
                if (!stack.TryPop(out var index))
                {
                    continue;
                }

                if (Interlocked.Exchange(ref owned[index], 1) != 0)
                {
                    Interlocked.Increment(ref violations);
                }

                Volatile.Write(ref owned[index], 0);
                stack.Push(index);
            }
        })).ToArray();

        Assert.That(Task.WaitAll(tasks, TimeSpan.FromSeconds(30)), Is.True);
        Assert.That(violations, Is.Zero);

        var remaining = 0;
        while (stack.TryPop(out _))
        {
            remaining++;
        }

        Assert.That(remaining, Is.EqualTo(Capacity), "no index may get lost");
    }
}
