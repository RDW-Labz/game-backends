using System.Diagnostics;
using NUnit.Framework;
using Schedulers.Idle;

namespace Schedulers.Test;

[TestFixture]
internal class IdleSpinPolicyTests
{
    private static long Ticks(double microseconds)
    {
        return (long)(microseconds / 1_000_000 * Stopwatch.Frequency);
    }

    [Test]
    public void Fixed_AlwaysReturnsItsDuration()
    {
        var policy = new FixedIdleSpinPolicy(TimeSpan.FromMilliseconds(2));
        var before = policy.SpinTicks;

        policy.OnWakeUp(Ticks(5_000));
        policy.OnWakeUp(Ticks(1));

        Assert.That(policy.SpinTicks, Is.EqualTo(before));
        Assert.That(before, Is.EqualTo(Ticks(2_000)).Within(2));
    }

    [Test]
    public void Fixed_AllowsZero()
    {
        Assert.That(new FixedIdleSpinPolicy(TimeSpan.Zero).SpinTicks, Is.Zero);
    }

    [Test]
    public void Fixed_RejectsNegativeDurations()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new FixedIdleSpinPolicy(TimeSpan.FromTicks(-1)));
    }

    [Test]
    public void Adaptive_StartsWithTheInitialDuration()
    {
        var policy = new AdaptiveIdleSpinPolicy();

        Assert.That(policy.SpinTicks, Is.EqualTo(Ticks(50)).Within(2));
    }

    [Test]
    public void Adaptive_ConvergesToTheMeasuredWakeUpLatency()
    {
        var policy = new AdaptiveIdleSpinPolicy();

        for (var i = 0; i < 100; i++)
        {
            policy.OnWakeUp(Ticks(120));
        }

        Assert.That(policy.SpinTicks, Is.EqualTo(Ticks(120)).Within(Ticks(1)));
    }

    [Test]
    public void Adaptive_FollowsChangingLatencies()
    {
        var policy = new AdaptiveIdleSpinPolicy();
        for (var i = 0; i < 100; i++)
        {
            policy.OnWakeUp(Ticks(200));
        }

        for (var i = 0; i < 100; i++)
        {
            policy.OnWakeUp(Ticks(30));
        }

        Assert.That(policy.SpinTicks, Is.EqualTo(Ticks(30)).Within(Ticks(1)));
    }

    [Test]
    public void Adaptive_StaysWithinMinimumAndMaximum()
    {
        var policy = new AdaptiveIdleSpinPolicy();

        for (var i = 0; i < 200; i++)
        {
            policy.OnWakeUp(Ticks(1_000_000));
        }

        Assert.That(policy.SpinTicks, Is.EqualTo(Ticks(500)).Within(Ticks(1)));

        for (var i = 0; i < 200; i++)
        {
            policy.OnWakeUp(0);
        }

        Assert.That(policy.SpinTicks, Is.EqualTo(Ticks(20)).Within(Ticks(1)));
    }

    [Test]
    public void Adaptive_ASingleOutlierDoesNotMoveItMuch()
    {
        var policy = new AdaptiveIdleSpinPolicy();
        for (var i = 0; i < 100; i++)
        {
            policy.OnWakeUp(Ticks(60));
        }

        policy.OnWakeUp(Ticks(50_000));

        Assert.That(policy.SpinTicks, Is.LessThan(Ticks(60 + ((500 - 60) / 8) + 2)));
    }

    [Test]
    public void Adaptive_RejectsInconsistentDurations()
    {
        var ms = TimeSpan.FromMilliseconds(1);

        Assert.Throws<ArgumentOutOfRangeException>(() => new AdaptiveIdleSpinPolicy(initial: ms, minimum: ms * 2, maximum: ms * 3));
        Assert.Throws<ArgumentOutOfRangeException>(() => new AdaptiveIdleSpinPolicy(initial: ms * 4, minimum: ms, maximum: ms * 3));
        Assert.Throws<ArgumentOutOfRangeException>(() => new AdaptiveIdleSpinPolicy(initial: ms, minimum: -ms, maximum: ms));
    }
}
