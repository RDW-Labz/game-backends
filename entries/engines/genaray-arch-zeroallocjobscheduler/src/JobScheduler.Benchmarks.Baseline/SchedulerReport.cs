using System.Diagnostics;
using Schedulers;

namespace Schedulers.Benchmarks.Baseline;

/// <summary>
///     Measures what BenchmarkDotNet cannot: how much CPU an idle scheduler uses, and how long the first job takes after a pause.
///     Identical to the first part of <c>JobScheduler.Benchmarks/SchedulerReport.cs</c>.
/// </summary>
public static class SchedulerReport
{
    private sealed class EmptyJob : IJob
    {
        public void Execute()
        {
        }
    }

    public static void Run()
    {
        using var scheduler = new JobScheduler(new JobScheduler.Config { ThreadCount = 0, MaxExpectedConcurrentJobs = 1024, ThreadPrefixName = "Baseline" });
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
                scheduler.Flush();
                handle.Complete();
                samples.Add((Stopwatch.GetTimestamp() - start) * 1_000_000.0 / Stopwatch.Frequency);
            }

            samples.Sort();
            Console.WriteLine($"first job after a {name}: median {samples[150]:F1} us, p90 {samples[270]:F1} us, p99 {samples[297]:F1} us");
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

public static class Program
{
    public static void Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "report")
        {
            SchedulerReport.Run();
            return;
        }

        BenchmarkDotNet.Running.BenchmarkSwitcher.FromAssembly(typeof(Program).Assembly).Run(args);
    }
}
