![ZeroAllocJobScheduler](docs/zeroallocjobscheduler-banner.png)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg?style=for-the-badge)](https://GitHub.com/Naereen/StrapDown.js/graphs/commit-activity)
[![Nuget](https://img.shields.io/nuget/v/ZeroAllocJobScheduler?style=for-the-badge)](https://www.nuget.org/packages/ZeroAllocJobScheduler/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge)](https://opensource.org/licenses/Apache-2.0)
![C#](https://img.shields.io/badge/c%23-%23239120.svg?style=for-the-badge&logo=c-sharp&logoColor=white)
[![Build](https://img.shields.io/github/actions/workflow/status/genaray/ZeroAllocJobScheduler/workflows.yaml?style=for-the-badge)](https://github.com/genaray/ZeroAllocJobScheduler/actions)

A high-performance, allocation-free C# job scheduler for game development and data-oriented programming. It runs the parallel work of [Arch](https://github.com/genaray/Arch), the ECS, but fits any game loop.

- 🏎️ **_FAST_** > Work stealing, lock-free queues and cache-friendly data. A small job costs a fraction of a microsecond to schedule and finish!
- ♻️ **_ZERO ALLOC_** > Scheduling, waiting, dependencies and parallel-for do not create garbage, and tests make sure it stays that way.
- 😴 **_POLITE_** > Idle workers sleep, so your game keeps its CPU for rendering, audio and the rest. No spinning cores!
- 🤏 **_BARE MINIMUM_** > Three calls to remember: `Schedule`, `Flush`, `Wait`. Not bloated, no hidden costs.
- 🧩 **_COMPLETE_** > Dependencies, child jobs, parallel-for, SIMD batches, cancellation and exception handling are included.
- 🚢 **_SUPPORT_** > Targets .NetStandard 2.1, so it runs on .Net 6 and 8 and may be used with Unity or Godot!

Download the [package](https://www.nuget.org/packages/ZeroAllocJobScheduler/) and get started today!
```console
dotnet add PROJECT package ZeroAllocJobScheduler --version 2.0.0
```

# ⏩ Quickstart

Let's say you want to run some work on all your cores... sounds complicated? It's not! Create a scheduler, schedule a job, flush it and wait for it.

```cs
using Schedulers;

// A job is a class or a struct
public struct HelloJob : IJob
{
    public void Execute() => Console.WriteLine("Hello from a worker!");
}

using var scheduler = new JobScheduler();           // one worker per processor

var handle = scheduler.Schedule(new HelloJob());    // prepares the job
scheduler.Flush(handle);                            // hands it to the workers
scheduler.Wait(handle);                             // returns when it is done, and helps working meanwhile
```
> [!NOTE]
> Keep one scheduler for the lifetime of your program. Creating it is the only part that allocates. Jobs can be structs or classes.

# 💡 Highlights

That is all you need to start. If you want to know more about the techniques under the hood, read [how it works](docs/how-it-works.md). There's more to explore, for example...

## 🤝 Our promise
- [x] Bare minimum - No overengineering, no hidden costs
- [x] Incredibly fast and allocation free
- [x] No busy waiting, an idle scheduler uses no CPU
- [x] Every feature is tested, including stress tests for the threading code

## 🚀 Features
- [x] Jobs as classes or as structs, without boxing
- [x] Dependencies: a job can wait for any number of other jobs
- [x] Child jobs: wait for a parent and you wait for its children
- [x] Parallel-for over ranges, with optional SIMD batches
- [x] Cancellation of jobs, including children and dependents
- [x] Exceptions in jobs do not kill workers, and surface where you wait
- [x] Safe, recycled handles: old handles are recognized
- [x] Idle policy that adapts to your machine, and can be replaced
- And much more... 

## 🔗 Dependencies and children
```cs
var load = scheduler.Schedule(new LoadJob());
var physics = scheduler.Schedule(new PhysicsJob());
var render = scheduler.Schedule(new RenderJob());
scheduler.AddDependency(render, load);              // render waits for load AND physics
scheduler.AddDependency(render, physics);

scheduler.Flush(load);                              // flush the jobs without dependencies, the rest follows
scheduler.Flush(physics);
scheduler.Wait(render);

var parent = scheduler.Schedule(new ParentJob());
var child = scheduler.Schedule(new ChildJob(), parent);   // waiting for the parent also waits for its children
scheduler.Flush(parent);
scheduler.Flush(child);
scheduler.Wait(parent);
```

## 🧮 Parallel-for
```cs
using Schedulers.Utils;

public struct Scale : IJobParallelFor
{
    public float[] Data;
    public void Execute(int index) => Data[index] *= 2f;
}

var data = new float[100_000];
var handle = scheduler.ScheduleParallelFor(new Scale { Data = data }, data.Length);
scheduler.Flush(handle);
scheduler.Wait(handle);
```
Implement `IJobParallelForBatch` and use `ScheduleParallelForBatch` to receive `Execute(int start, int count)` with whole batches, for example to work with SIMD.
Like every other handle, the result can be waited for, cancelled and used for dependencies.

## 🛑 Cancellation
```cs
scheduler.Cancel(handle);                           // skips jobs that did not start, including children and dependents

if (scheduler.IsCancelled(handle)) return;          // lets a running job stop by itself, when it has its handle
```

## 💥 Exceptions
```cs
try { scheduler.Wait(handle); }
catch (AggregateException e) { /* the exceptions of the jobs that threw */ }

scheduler.JobExceptionHandler = exception => Console.WriteLine(exception);   // or get notified right away
```

## 😴 Idle workers
Workers without jobs look for work for a short time and then sleep. How long is chosen from the wake-up time of your machine. To override that:
```cs
using Schedulers.Idle;

var scheduler = new JobScheduler(0, new FixedIdleSpinPolicy(TimeSpan.FromMilliseconds(0.1)));   // or your own IIdleSpinPolicy
```

# 🚀 Performance
The scheduler is built for the jobs of a game frame: many small ones, a few big ones, and a lot of parallel-for.
Care is taken to find a healthy balance between CPU performance, memory and an idle machine.

| Scenario | NuGet 1.1.2 | Now | |
|---|---:|---:|---:|
| 20,000 independent jobs | 68.8 ms | 4.2 ms | **16x** |
| One job that waits for 1,000 jobs | 5.2 ms | 0.35 ms | **15x** |
| 100 parallel-fors of 2,000 elements, like a frame of queries | 10.4 ms | 2.0 ms | **5x** |
| Parallel-for over 1,000,000 elements | 1.8 ms | 0.29 ms | **6x** |
| Chain of 20,000 dependent jobs | 21.4 ms | 7.8 ms | **2.7x** |
| First job after a pause of 2 ms | 250 us | 53 us | **5x** |
| Allocation for 20,000 struct jobs | 480 KB | 0 | |
| CPU usage while idle | 0 | 0 | |

Measured against the last NuGet release with BenchmarkDotNet on one laptop, so take the numbers as an order of magnitude.

Compared with `Parallel.For`, `Task` and the `ThreadPool` it allocates nothing where they allocate kilobytes to megabytes, and it is faster for large ranges and for many queries at once. It is not faster everywhere: `ThreadPool` work items are a bit faster for 1,000 empty jobs, and `Task.ContinueWith` chains that run inline beat a short chain of dependent jobs.

Have a look at the [benchmarks](docs/benchmarks.md) for all scenarios, and how they were measured!

# 📖 Documentation
- 🔍 [How it works](docs/how-it-works.md) > What happens to a job, and why it is fast.
- 📊 [Benchmarks](docs/benchmarks.md) > Every scenario, compared with the last NuGet release.

# ⚠️ Good to know
- At most 65,535 jobs can be scheduled and unfinished at the same time.
- Handles are recycled once their job has finished. Using an old handle is safe: waiting for it returns at once, cancelling it does nothing and flushing it throws.
- `Wait` also executes jobs on the calling thread, which may include jobs you did not wait for.
- Running jobs are never interrupted, cancellation is cooperative.
- The tests and benchmarks ran on Linux x64 with .Net 8 so far. ARM64 and Windows are not covered yet.
- `IParallelJobProducer` and `ParallelJobProducer<T>` still work but are obsolete. Use `IJobParallelForBatch` instead.

# 🛠️ Contributing
Found a bug, or have an idea? Open an issue or a pull request! The solution contains the tests (`JobScheduler.Test`) and the benchmarks (`JobScheduler.Benchmarks`, and `JobScheduler.Benchmarks.Baseline` for the NuGet package).
Please run the tests before you send a pull request, they include stress tests for the threading code.
Every push is built and tested on Linux, Windows and macOS. A pull request with the label `benchmark` also runs the benchmarks. A release is made by starting the workflow by hand: enter the version and the release notes, and choose to publish. It pushes the package to NuGet and GitHub, and creates the GitHub release.

# 📄 License
Apache 2.0, see [LICENSE](LICENSE.MD).
