using NUnit.Framework;
using Schedulers.Utils;

namespace Schedulers.Test;

/// <summary>
///     Handles are recycled once their job has finished. An old handle must never be mistaken for the new one in its slot.
/// </summary>
internal class JobHandleGenerationTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    /// <summary>
    ///     Runs a job and waits for it. The slot of the returned handle is free again afterwards, and is the first one to be reused.
    /// </summary>
    private static JobHandle RunToCompletion(JobScheduler jobScheduler)
    {
        var handle = jobScheduler.Schedule(new TestJob(0));
        jobScheduler.Flush(handle);
        jobScheduler.Wait(handle);
        return handle;
    }

    /// <summary>
    ///     Schedules a job that does not finish before the returned event is set. Its handle reuses the slot of <paramref name="staleHandle"/>.
    /// </summary>
    private static (JobHandle Handle, ManualResetEventSlim Release, ManualResetEventSlim Executed) ScheduleBlockingJobInSlotOf(JobScheduler jobScheduler, JobHandle staleHandle)
    {
        var release = new ManualResetEventSlim();
        var executed = new ManualResetEventSlim();
        var handle = jobScheduler.Schedule(new TestJob(1, () =>
        {
            executed.Set();
            release.Wait(Timeout);
        }));

        Assert.That(handle.Index, Is.EqualTo(staleHandle.Index), "the test needs the slot to be reused");
        return (handle, release, executed);
    }

    [Test]
    public void ReusedSlot_GetsANewGeneration()
    {
        using var jobScheduler = new JobScheduler();

        var stale = RunToCompletion(jobScheduler);
        var (reused, release, _) = ScheduleBlockingJobInSlotOf(jobScheduler, stale);
        release.Set();

        Assert.That(reused.Generation, Is.Not.EqualTo(stale.Generation));
    }

    [Test]
    public void IsFinished_IsTrueForStaleHandles_AndFalseForTheJobInTheSameSlot()
    {
        using var jobScheduler = new JobScheduler();

        var stale = RunToCompletion(jobScheduler);
        var (reused, release, _) = ScheduleBlockingJobInSlotOf(jobScheduler, stale);

        Assert.That(stale.IsFinished, Is.True);
        Assert.That(reused.IsFinished, Is.False);
        release.Set();
    }

    [Test]
    public void Wait_ForAStaleHandle_DoesNotWaitForTheJobInTheSameSlot()
    {
        using var jobScheduler = new JobScheduler();

        var stale = RunToCompletion(jobScheduler);
        var (reused, release, executed) = ScheduleBlockingJobInSlotOf(jobScheduler, stale);
        jobScheduler.Flush(reused);
        Assert.That(executed.Wait(Timeout), Is.True, "the job in the reused slot has to be running");

        var waiting = Task.Run(() => jobScheduler.Wait(stale));

        Assert.That(waiting.Wait(Timeout), Is.True, "waiting for a finished job has to return immediately");
        release.Set();
        jobScheduler.Wait(reused);
    }

    [Test]
    public void Cancel_ForAStaleHandle_DoesNotCancelTheJobInTheSameSlot()
    {
        using var jobScheduler = new JobScheduler();

        var stale = RunToCompletion(jobScheduler);
        var (reused, release, executed) = ScheduleBlockingJobInSlotOf(jobScheduler, stale);

        Assert.That(jobScheduler.Cancel(stale), Is.False);

        jobScheduler.Flush(reused);
        Assert.That(executed.Wait(Timeout), Is.True, "the job in the reused slot must not be cancelled");
        release.Set();
        jobScheduler.Wait(reused);
    }

    [Test]
    public void Flush_OfAStaleHandle_IsRejected()
    {
        using var jobScheduler = new JobScheduler();

        var stale = RunToCompletion(jobScheduler);
        var (reused, release, _) = ScheduleBlockingJobInSlotOf(jobScheduler, stale);

        Assert.Throws<ArgumentException>(() => jobScheduler.Flush(stale));
        release.Set();
    }

    [Test]
    public void AddDependency_OnAFinishedJob_IsAlreadySatisfied()
    {
        using var jobScheduler = new JobScheduler();

        var stale = RunToCompletion(jobScheduler);
        var executed = false;
        var dependent = jobScheduler.Schedule(new TestJob(1, () => executed = true));

        jobScheduler.AddDependency(dependent, stale);

        // Nothing waits for the finished job, so the dependent is not released by anything and has to be flushed.
        jobScheduler.Flush(dependent);
        jobScheduler.Wait(dependent);
        Assert.That(executed, Is.True);
    }

    [Test]
    public void AddDependency_OfAStaleDependent_IsRejected()
    {
        using var jobScheduler = new JobScheduler();

        var staleDependent = RunToCompletion(jobScheduler);
        var other = jobScheduler.Schedule(new TestJob(1));

        Assert.Throws<ArgumentException>(() => jobScheduler.AddDependency(staleDependent, other));
        jobScheduler.Flush(other);
        jobScheduler.Wait(other);
    }

    [Test]
    public void Schedule_WithAStaleParent_IsRejected()
    {
        using var jobScheduler = new JobScheduler();

        var staleParent = RunToCompletion(jobScheduler);

        Assert.Throws<ArgumentException>(() => jobScheduler.Schedule(new TestJob(1), staleParent));
        Assert.Throws<ArgumentException>(() => jobScheduler.Schedule(new NoOpStructJob(), staleParent));
    }

    [Test]
    public void Slots_CanBeReusedManyTimes()
    {
        using var jobScheduler = new JobScheduler();

        // More jobs than a 16 bit generation has values, so slots wrap around.
        var staleHandles = new List<JobHandle>();
        for (var i = 0; i < ushort.MaxValue * 2; i++)
        {
            var handle = RunToCompletion(jobScheduler);
            if (i % 10_000 == 0)
            {
                staleHandles.Add(handle);
            }
        }

        // Only old enough handles are tested, the most recent one may share its generation with its slot again after wrapping.
        Assert.That(staleHandles.Take(staleHandles.Count - 1), Has.All.Matches<JobHandle>(handle => handle.IsFinished));
    }

    private struct NoOpStructJob : IJob
    {
        public void Execute()
        {
        }
    }
}
