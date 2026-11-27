using System.Diagnostics;
using Schedulers.Utils;

namespace Schedulers.Benchmarks;

/// <summary>
///     Measures what BenchmarkDotNet cannot: how much CPU an idle scheduler uses, how long the first job takes after a pause,
///     and how fast cancellation reacts. The first parts are identical to <c>JobScheduler.Benchmarks.Baseline/SchedulerReport.cs</c>.
///     Run with <c>dotnet run -c Release -- report</c>.
/// </summary>
public static class SchedulerReport
{
    private sealed class EmptyJob : IJob
    {
        public void Execute()
        {
        }
    }

    private struct SlowIndexJob : IJobParallelFor
    {
        public void Execute(int index)
        {
            SpinFor(5);
        }
    }

    public static void Run()
    {
        using var scheduler = new JobScheduler();
        var job = new EmptyJob();

        Console.WriteLine($"idle cpu: {MeasureIdleCpuMilliseconds()} ms of CPU time in 2000 ms ({Environment.ProcessorCount} logical processors)");

        foreach (var (name, pause) in new (string, Action)[] { ("50 us pause", () => SpinFor(50)), ("2 ms pause", () => Thread.Sleep(2)) })
        {
            var samples = new List<double>();
            for (var i = 0; i < 300; i++)
            {
                pause();
                var start = Stopwatch.GetTimestamp();
                var handle = scheduler.Schedule(job);
                scheduler.Flush(handle);
                scheduler.Wait(handle);
                samples.Add((Stopwatch.GetTimestamp() - start) * 1_000_000.0 / Stopwatch.Frequency);
            }

            samples.Sort();
            Console.WriteLine($"first job after a {name}: median {samples[150]:F1} us, p90 {samples[270]:F1} us, p99 {samples[297]:F1} us");
        }

        foreach (var batchSize in new[] { 1, 16, 256, 4096 })
        {
            var samples = new List<double>();
            for (var i = 0; i < 20; i++)
            {
                var handle = scheduler.ScheduleParallelFor(new SlowIndexJob(), 10_000_000, batchSize);
                scheduler.Flush(handle);
                Thread.Sleep(20);

                var start = Stopwatch.GetTimestamp();
                scheduler.Cancel(handle);
                scheduler.Wait(handle);
                samples.Add((Stopwatch.GetTimestamp() - start) * 1_000_000.0 / Stopwatch.Frequency);
            }

            samples.Sort();
            Console.WriteLine($"cancelling a parallel-for of 5 us indices, batch size {batchSize,4}: Cancel to Wait returning, median {samples[10]:F0} us, max {samples[19]:F0} us");
        }
    }

    private static long MeasureIdleCpuMilliseconds()
    {
        Thread.Sleep(500);
        var before = Process.GetCurrentProcess().TotalProcessorTime;
        Thread.Sleep(2000);
        return (long)(Process.GetCurrentProcess().TotalProcessorTime - before).TotalMilliseconds;
    }

    private static void SpinFor(int microseconds)
    {
        var end = Stopwatch.GetTimestamp() + (Stopwatch.Frequency * microseconds / 1_000_000);
        while (Stopwatch.GetTimestamp() < end)
        {
        }
    }
}
