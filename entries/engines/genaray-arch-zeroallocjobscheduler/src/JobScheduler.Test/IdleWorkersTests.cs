using NUnit.Framework;
using Schedulers.Idle;

namespace Schedulers.Test;

[TestFixture]
internal class IdleWorkersTests
{
    private static readonly TimeSpan ShortWait = TimeSpan.FromMilliseconds(150);
    private static readonly TimeSpan LongWait = TimeSpan.FromSeconds(5);

    private static IIdleSpinPolicy NoSpin
    {
        get => new FixedIdleSpinPolicy(TimeSpan.Zero);
    }

    private sealed class RecordingPolicy : IIdleSpinPolicy
    {
        public readonly List<long> Latencies = new();

        public long SpinTicks => 0;

        public void OnWakeUp(long latencyTicks)
        {
            lock (Latencies)
            {
                Latencies.Add(latencyTicks);
            }
        }
    }

    [Test]
    public void WakeOne_WakesASleepingWorker()
    {
        var idleWorkers = new IdleWorkers(2, NoSpin);
        using var woken = new ManualResetEventSlim();

        idleWorkers.BeginSearching();

        idleWorkers.PrepareToSleep(1);
        var sleeper = Task.Run(() =>
        {
            idleWorkers.Sleep(1);
            woken.Set();
        });

        Assert.That(woken.Wait(ShortWait), Is.False, "the worker must sleep until it is woken");

        idleWorkers.WakeOne(0);

        Assert.That(woken.Wait(LongWait), Is.True);
        Assert.That(sleeper.Wait(LongWait), Is.True);
    }

    [Test]
    public void WakeOne_WithoutSleepingWorkers_LeavesNoSignalBehind()
    {
        var idleWorkers = new IdleWorkers(1, NoSpin);
        idleWorkers.WakeOne(0);

        AssertSleepsUntilWoken(idleWorkers, 0);
    }

    [Test]
    public void CancelSleep_BeforeBeingWoken_LeavesNoSignalBehind()
    {
        var idleWorkers = new IdleWorkers(1, NoSpin);
        idleWorkers.BeginSearching();
        idleWorkers.PrepareToSleep(0);
        idleWorkers.CancelSleep(0);

        idleWorkers.WakeOne(0);
        AssertSleepsUntilWoken(idleWorkers, 0);
    }

    [Test]
    public void CancelSleep_AfterBeingWoken_ConsumesTheSignal()
    {
        var idleWorkers = new IdleWorkers(1, NoSpin);
        idleWorkers.BeginSearching();
        idleWorkers.PrepareToSleep(0);
        idleWorkers.WakeOne(0);
        idleWorkers.CancelSleep(0);

        AssertSleepsUntilWoken(idleWorkers, 0);
    }

    [Test]
    public void WakeAll_WakesEverySleepingWorker()
    {
        const int WorkerCount = 5;
        var idleWorkers = new IdleWorkers(WorkerCount, NoSpin);
        var woken = 0;

        var sleepers = Enumerable.Range(0, WorkerCount).Select(workerId =>
        {
            idleWorkers.BeginSearching();
            idleWorkers.PrepareToSleep(workerId);
            return Task.Run(() =>
            {
                idleWorkers.Sleep(workerId);
                Interlocked.Increment(ref woken);
            });
        }).ToArray();

        idleWorkers.WakeAll();

        Assert.That(Task.WaitAll(sleepers, LongWait), Is.True);
        Assert.That(woken, Is.EqualTo(WorkerCount));
    }

    [Test]
    public void WakeOne_WakesOnlyOneWorkerPerCall()
    {
        var idleWorkers = new IdleWorkers(3, NoSpin);
        var woken = 0;

        var sleepers = Enumerable.Range(0, 3).Select(workerId =>
        {
            idleWorkers.BeginSearching();
            idleWorkers.PrepareToSleep(workerId);
            return Task.Run(() =>
            {
                idleWorkers.Sleep(workerId);
                Interlocked.Increment(ref woken);
            });
        }).ToArray();

        idleWorkers.WakeOne(0);
        Task.WaitAny(sleepers, LongWait);
        Thread.Sleep(ShortWait);

        Assert.That(woken, Is.EqualTo(1));

        idleWorkers.WakeAll();
        Assert.That(Task.WaitAll(sleepers, LongWait), Is.True);
    }

    [Test]
    public void WakeOne_WhileAWorkerIsSearching_WakesNobody()
    {
        var idleWorkers = new IdleWorkers(2, NoSpin);
        using var woken = new ManualResetEventSlim();

        idleWorkers.BeginSearching();

        idleWorkers.BeginSearching();
        idleWorkers.PrepareToSleep(1);
        var sleeper = Task.Run(() =>
        {
            idleWorkers.Sleep(1);
            woken.Set();
        });

        idleWorkers.WakeOne(1);

        Assert.That(woken.Wait(ShortWait), Is.False, "the searching worker will find the work, nobody has to wake up");

        // The searching worker found work and was the last one searching, so somebody has to take over the search.
        idleWorkers.EndSearching(0);

        Assert.That(woken.Wait(LongWait), Is.True);
        Assert.That(sleeper.Wait(LongWait), Is.True);
    }

    [Test]
    public void EndSearching_WhileAnotherWorkerIsSearching_WakesNobody()
    {
        var idleWorkers = new IdleWorkers(3, NoSpin);
        using var woken = new ManualResetEventSlim();

        idleWorkers.BeginSearching();
        idleWorkers.BeginSearching();

        idleWorkers.BeginSearching();
        idleWorkers.PrepareToSleep(2);
        var sleeper = Task.Run(() =>
        {
            idleWorkers.Sleep(2);
            woken.Set();
        });

        idleWorkers.EndSearching(0);

        Assert.That(woken.Wait(ShortWait), Is.False);

        idleWorkers.WakeAll();
        Assert.That(sleeper.Wait(LongWait), Is.True);
    }

    [Test]
    public void Sleep_ReportsHowLongTheWakeUpTookToThePolicy()
    {
        var policy = new RecordingPolicy();
        var idleWorkers = new IdleWorkers(1, policy);

        idleWorkers.BeginSearching();
        idleWorkers.PrepareToSleep(0);
        var sleeper = Task.Run(() => idleWorkers.Sleep(0));
        Thread.Sleep(50);

        idleWorkers.WakeOne(0);

        Assert.That(sleeper.Wait(LongWait), Is.True);
        lock (policy.Latencies)
        {
            Assert.That(policy.Latencies, Has.Count.EqualTo(1));
            Assert.That(policy.Latencies[0], Is.GreaterThanOrEqualTo(0));

            // The worker slept for 50 ms, but the wake-up itself must not include that time.
            Assert.That(policy.Latencies[0], Is.LessThan(System.Diagnostics.Stopwatch.Frequency / 10));
        }
    }

    [Test]
    public void SpinTicks_AreTakenFromThePolicy()
    {
        var idleWorkers = new IdleWorkers(1, new FixedIdleSpinPolicy(TimeSpan.FromMilliseconds(3)));

        Assert.That(idleWorkers.SpinTicks, Is.EqualTo(System.Diagnostics.Stopwatch.Frequency * 3 / 1000).Within(2));
    }

    /// <summary>
    ///     Puts the worker to sleep and checks that it really blocks, instead of returning early because of a stale signal.
    /// </summary>
    private static void AssertSleepsUntilWoken(IdleWorkers idleWorkers, int workerId)
    {
        using var woken = new ManualResetEventSlim();

        idleWorkers.BeginSearching();

        idleWorkers.PrepareToSleep(workerId);
        var sleeper = Task.Run(() =>
        {
            idleWorkers.Sleep(workerId);
            woken.Set();
        });

        Assert.That(woken.Wait(ShortWait), Is.False, "the worker returned from sleep without being woken");

        idleWorkers.WakeOne(workerId);
        Assert.That(sleeper.Wait(LongWait), Is.True);
    }
}
