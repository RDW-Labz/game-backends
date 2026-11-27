# Performance: ZeroAllocJobScheduler 1.1.2 vs. 2.0.0

## Setup

- BenchmarkDotNet 0.13.9, net8.0, `--job short` (3 warmups, 3 measured iterations, one launch).
- Intel Core Ultra 7 155H laptop, WSL2 on Windows, 22 logical processors.
- Both variants ran the same scenarios with the same job code. 1.1.2 is the NuGet package (`JobScheduler.Benchmarks.Baseline`), the other is a project reference to version 2.0.0 (`JobScheduler.Benchmarks`). The package got `MaxExpectedConcurrentJobs` high enough not to allocate.
- Each variant ran **once**, one after the other. The runs are short and the machine is a laptop, so repeated runs vary by up to a third.
- 🟢 is 10% or more faster, 🔴 is 10% or more slower, ⚪ is within 10%. ⚠️ means that the standard deviation of one of the two runs is more than 15% of its mean, so the row is noisy.
- "Alloc" is managed bytes per operation. A few bytes are measurement noise.

## Summary

| Area | Change |
|---|---|
| Independent jobs (class jobs) | about 93–96% faster |
| Independent struct jobs | about 87–97% faster, allocation-free (was 2.3 KB to 469 KB per operation) |
| Dependencies: fan-in and fan-out | about 92–95% faster |
| Dependency chains | about 35–70% faster (the chain of 1,000 jobs is within the noise) |
| Parallel-for over small ranges | about 82–84% faster |
| Many small parallel-fors per frame | about 78–81% faster |
| Many jobs of a few microseconds | about 76–86% faster |
| One parallel-for with heavy work per index | about 58% faster with 10,000 elements, equal with 100,000 (all cores are busy) |
| First job after a pause of 50 µs / 2 ms | about 81% / 79% faster |
| Idle CPU usage | equal (both versions sleep, 0 ms in 2 s) |
| SIMD batches (`IJobParallelForBatch`) | about 58% faster than the same loop with one index at a time (new) |
| Cancellation, exceptions in jobs, generations, multiple dependencies | new, not in 1.1.2 |
| Versus `Parallel.For`, `Task` and `ThreadPool` | faster for large ranges (86% vs. `Parallel.For`, 28% vs. a range partitioner at 1,000,000 elements) and for many queries (33–58%), 30–43% faster for 20,000 jobs, no allocation. Slower than `ThreadPool` for 1,000 empty work items (+23%) and much slower than inline `ContinueWith` chains (+357% at 1,000 steps), see [Compared with .NET](#compared-with-net) |

## Results

#### SchedulerComparisonBenchmark

Jobs that do nothing, so the scheduler is measured. `Count` is the number of jobs, parallel-for processes `Count * 50` elements.

| Benchmark | 1.1.2 | 2.0.0 | Change | Alloc 1.1.2 | Alloc 2.0.0 |
|---|---:|---:|---:|---:|---:|
| `ManyJobs(Count: 100)` | 1.29 ms | 45.75 µs | 🟢 -96% | 1 B | 0 |
| `ManyJobs(Count: 1000)` | 5.03 ms | 330.51 µs | 🟢 -93% | 6 B | 0 |
| `ManyJobs(Count: 20000)` | 68.75 ms | 4.20 ms | 🟢 -94% | 82 B | 6 B |
| `ManyStructJobs(Count: 100)` | 1.70 ms | 54.74 µs | 🟢 -97% ⚠️ | 2.3 KB | 0 |
| `ManyStructJobs(Count: 1000)` | 4.98 ms | 439.84 µs | 🟢 -91% | 23.4 KB | 0 |
| `ManyStructJobs(Count: 20000)` | 67.71 ms | 8.76 ms | 🟢 -87% | 468.8 KB | 12 B |
| `ParallelFor(Count: 100)` | 229.30 µs | 40.68 µs | 🟢 -82% | 0 | 0 |
| `ParallelFor(Count: 1000)` | 346.10 µs | 57.50 µs | 🟢 -83% | 1 B | 0 |
| `ParallelFor(Count: 20000)` | 1.80 ms | 290.77 µs | 🟢 -84% ⚠️ | 1 B | 0 |
| `DependencyChain(Count: 100)` | 182.20 µs | 54.68 µs | 🟢 -70% | 0 | 0 |
| `DependencyChain(Count: 1000)` | 718.70 µs | 464.67 µs | 🟢 -35% ⚠️ | 1 B | 0 |
| `DependencyChain(Count: 20000)` | 21.40 ms | 7.81 ms | 🟢 -64% | 23 B | 6 B |
| `FanIn(Count: 100)` | 1.11 ms | 62.14 µs | 🟢 -94% ⚠️ | 1 B | 0 |
| `FanIn(Count: 1000)` | 5.17 ms | 348.58 µs | 🟢 -93% | 6 B | 0 |
| `FanIn(Count: 20000)` | 77.90 ms | 5.91 ms | 🟢 -92% | 92 B | 6 B |
| `FanOut(Count: 100)` | 991.00 µs | 46.87 µs | 🟢 -95% | 1 B | 0 |
| `FanOut(Count: 1000)` | 5.13 ms | 332.28 µs | 🟢 -94% | 6 B | 0 |
| `FanOut(Count: 20000)` | 88.82 ms | 5.40 ms | 🟢 -94% ⚠️ | 92 B | 504 B |

- **Struct jobs**: 1.1.2 only accepts an `IJob`, so it boxes every struct (24 bytes each). Struct jobs cost more time than class jobs that were created beforehand, because each one travels in a pooled wrapper.
- **Dependency chain**: the jobs run strictly one after another, so this measures the latency of handing a job on.
- **Fan-in**: one job waits for `Count` jobs. 1.1.2 needs `CombineDependencies` for this, the current version adds the dependencies one by one.
- **Fan-out**: `Count` jobs wait for one job.

#### FrameBenchmark

What a game frame looks like. `Size` queries of 2,000 elements, `Size * 10` jobs of about 3 µs, and one parallel-for over `Size * 1000` elements with 100 iterations of math each.

| Benchmark | 1.1.2 | 2.0.0 | Change | Alloc 1.1.2 | Alloc 2.0.0 |
|---|---:|---:|---:|---:|---:|
| `SmallParallelFors(Size: 10)` | 1.10 ms | 243.50 µs | 🟢 -78% | 1 B | 0 |
| `SmallParallelFors(Size: 100)` | 10.39 ms | 1.97 ms | 🟢 -81% | 12 B | 3 B |
| `HeavyJobs(Size: 10)` | 800.50 µs | 115.90 µs | 🟢 -86% | 1 B | 0 |
| `HeavyJobs(Size: 100)` | 3.79 ms | 894.40 µs | 🟢 -76% | 6 B | 1 B |
| `HeavyParallelFor(Size: 10)` | 1.49 ms | 631.90 µs | 🟢 -58% | 1 B | 1 B |
| `HeavyParallelFor(Size: 100)` | 3.79 ms | 3.63 ms | ⚪ -4% | 3 B | 6 B |

- With enough work per index all cores are busy, no scheduler can be faster, and the result is the same (`HeavyParallelFor` with `Size: 100`).

#### NewFeaturesBenchmark

Not available in 1.1.2, so there is nothing to compare with.

| Benchmark | 2.0.0 | Alloc |
|---|---:|---:|
| `ParallelFor_PerIndex` (1,000,000 elements, one index at a time) | 284.80 µs to 259.80 µs | 0 |
| `ParallelFor_SimdBatches` (the same, SIMD batches of 256) | 113.60 µs to 106.50 µs | 0 |
| `CancelQueuedJobs(Count: 1000)` | 351.10 µs | 0 |
| `CancelQueuedJobs(Count: 20000)` | 4.33 ms | 6 B |
| `FailingJobs(Count: 1000)` (100 jobs throw) | 418.40 µs | 35.5 KB |
| `FailingJobs(Count: 20000)` (2,000 jobs throw) | 6.15 ms | 673.8 KB |

- Cancelling a job costs about as much as executing an empty one, and skipped jobs do not allocate.
- Failing jobs allocate what .NET exceptions allocate (about 345 bytes per job), nothing else is created.

#### Idle workers, wake-up and cancellation

BenchmarkDotNet cannot measure these, `dotnet run -c Release -- report` does, in both projects. Medians over 300 samples.

| | 1.1.2 | 2.0.0 | Change |
|---|---:|---:|---:|
| CPU time of an idle scheduler in 2 s | 0 ms | 0 ms | ⚪ 0% |
| First job after a pause of 50 µs (median) | 46.4 µs | 8.7 µs | 🟢 -81% |
| First job after a pause of 50 µs (90th percentile) | 169.6 µs | 31.0 µs | 🟢 -82% |
| First job after a pause of 2 ms (median) | 250.1 µs | 52.9 µs | 🟢 -79% |
| First job after a pause of 2 ms (90th percentile) | 387.0 µs | 93.4 µs | 🟢 -76% |

How fast a parallel-for with 5 µs indices stops after `Cancel` (this version only), measured until `Wait` returns:

| Batch size | 1 | 16 | 256 | 4096 |
|---|---:|---:|---:|---:|
| Median | 465 µs | 473 µs | 1.77 ms | 21.75 ms |

A running job stops at the end of its batch, so the batch size is the reaction time. The default is 64.

## Compared with .NET

How does it compare with what comes with .NET? The scheduler against `Parallel.For`, `Task` and the `ThreadPool`, on the same machine and with the same settings. The .NET variants use cached delegates and work items, so they allocate as little as they can. The change is the scheduler relative to the .NET variant.

| Benchmark | .NET | Scheduler | Change | Alloc .NET | Alloc scheduler |
|---|---:|---:|---:|---:|---:|
| `ThreadPool work items vs. Schedule + Wait (Count: 1000)` | 218.23 µs | 269.00 µs | 🔴 +23% | 1 B | 0 |
| `Task.Run + WaitAll vs. Schedule + Wait (Count: 1000)` | 269.72 µs | 269.00 µs | ⚪ +0% | 70.4 KB | 0 |
| `ThreadPool work items vs. Schedule + Wait (Count: 20000)` | 5.63 ms | 3.94 ms | 🟢 -30% | 8 B | 3 B |
| `Task.Run + WaitAll vs. Schedule + Wait (Count: 20000)` | 6.96 ms | 3.94 ms | 🟢 -43% | 1.4 MB | 3 B |
| `Parallel.For vs. ScheduleParallelFor, 50,000 elements` | 146.14 µs | 45.71 µs | 🟢 -69% | 4.3 KB | 0 |
| `Parallel.ForEach + range partitioner vs. ScheduleParallelFor, 50,000 elements` | 42.44 µs | 45.71 µs | ⚪ +8% | 4.5 KB | 0 |
| `Parallel.For vs. ScheduleParallelFor, 1,000,000 elements` | 1.42 ms | 193.98 µs | 🟢 -86% | 6.0 KB | 0 |
| `Parallel.ForEach + range partitioner vs. ScheduleParallelFor, 1,000,000 elements` | 269.59 µs | 193.98 µs | 🟢 -28% | 5.6 KB | 0 |
| `Task.ContinueWith chain vs. dependency chain (Count: 1000)` | 94.50 µs | 432.00 µs | 🔴 +357% | 109.4 KB | 0 |
| `Task.ContinueWith chain vs. dependency chain (Count: 20000)` | 5.99 ms | 6.95 ms | 🔴 +16% | 2.1 MB | 8 B |
| `Parallel.For one after the other vs. all queries at once (Queries: 10)` | 381.80 µs | 254.40 µs | 🟢 -33% ⚠️ | 31.5 KB | 0 |
| `Parallel.For one after the other vs. all queries at once (Queries: 100)` | 5.07 ms | 2.12 ms | 🟢 -58% ⚠️ | 318.7 KB | 3 B |

- **Many jobs**: `ThreadPool` is a little faster for 1,000 empty work items and slower for 20,000. `Task.Run` is equal or slower and allocates about 72 bytes per task, 1.4 MB for 20,000.
- **Parallel-for**: `Parallel.For` with a delegate per index is several times slower for large ranges. `Parallel.ForEach` with a range partitioner is the right tool for plain loops, and it is close: about as fast for 50,000 elements, 1.4 times slower for a million. Both allocate a few KB per call.
- **Chains**: `ContinueWith` with `ExecuteSynchronously` runs every step inline on the thread that finished the one before, without handing anything over. That is faster than the scheduler for short chains, but it allocates 112 bytes per step. Dependent jobs always go through the queues here.
- **Frames**: with many queries the scheduler runs them at the same time, `Parallel.For` blocks and runs them one after the other.
- `Parallel.For` with an empty body takes 25 to 70 microseconds, because it hands out few large ranges, not one job per iteration. That is not the same work, so it is not in the table.
- The scheduler never allocates in these scenarios (a few bytes are noise), every .NET variant does.

## Caveats

- One machine, one run per variant, short BenchmarkDotNet jobs. Treat the numbers as an order of magnitude.
- A laptop with performance and efficiency cores adds bimodal results to parallel work.
- Linux x64 only. ARM64 and Windows were not measured.
- Almost all jobs here do nothing, so they measure the scheduler and not your work. With heavy jobs the difference disappears.

## Run them yourself

```
dotnet run -c Release --project JobScheduler.Benchmarks.Baseline -- --filter "*" --job short
dotnet run -c Release --project JobScheduler.Benchmarks -- --filter "*SchedulerComparisonBenchmark*" "*FrameBenchmark*" "*NewFeaturesBenchmark*" --job short
dotnet run -c Release --project JobScheduler.Benchmarks.Baseline -- report
dotnet run -c Release --project JobScheduler.Benchmarks -- report
```
