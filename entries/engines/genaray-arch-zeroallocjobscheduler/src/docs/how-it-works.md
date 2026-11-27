# How it works

This page explains how the scheduler is built and why it is fast. It is a tour, not a specification.

## The big picture

```
 your thread                          workers (one thread each)
 -----------                          -------------------------------------------
 Schedule(job)   -> handle            Worker 0          Worker 1          Worker 2
 Flush(handle)   -> incoming queue    incoming queue    incoming queue    incoming queue
                         |                 |                 |                 |
                         v                 v                 v                 v
                    local deque  <--- steal <----------- local deque  ---> local deque
                         |                                   |
                         v                                   v
                    run the job, then finish it (wake dependents, free the handle)

 Wait(handle)    -> runs jobs itself until the handle is finished
```

Every worker owns a **deque** (double-ended queue). The owner takes jobs from one end, thieves take them from the other.
Jobs reach a worker in two ways:

- From **outside** (your thread): `Flush` puts the handle into the *incoming queue* of one worker, round robin.
- From **inside** (a job that schedules more jobs, or a finished job that releases its dependents): the handle is pushed straight into the deque of the worker that is running, with no hand-over at all.

A worker that runs out of work steals from the other workers, so work spreads by itself.

## The life of a job

1. `Schedule(job)` rents a **handle**: an index into preallocated arrays, plus a generation (4 bytes in total). The job, its parent, its counters and its dependents live in these arrays.
2. `AddDependency` and `Schedule(job, parent)` only change counters in those arrays.
3. `Flush(handle)` hands the handle to a worker. A sleeping worker is woken up if needed.
4. A worker runs the job, or skips it if it was cancelled. Whatever happens, it then **finishes** the handle: it decrements the unfinished counter, releases dependents whose last dependency this was, tells the parent, and returns the handle to the pool.
5. `Wait(handle)` returns once the counter reaches zero. Until then the waiting thread takes jobs from the workers and runs them itself.

A job has an *unfinished* counter that starts at 1 for itself and grows by one for each child. That is why waiting for a parent also waits for all its children.
A job with dependencies has a *pending dependencies* counter. Each finished dependency decrements it, and exactly the thread that brings it to zero flushes the job.

## Handles and generations

A handle is recycled as soon as its job has finished, and a recycled slot is handed to the next job immediately. To make old handles harmless, every slot has a *generation* that changes with each recycling, and a handle remembers the generation it was created with.

- `Wait` for an old handle returns at once, because a different generation means the job is finished.
- `Cancel` for an old handle does nothing, and cannot cancel the new job in the slot. Generation and cancellation flag are stored in one integer and change together atomically.
- `Flush` for an old handle and `Schedule` with an old parent throw, instead of corrupting the new job.

## Cancellation

`Cancel(handle)` sets a flag in the status of the handle. Before a worker executes a job, it checks the flag of the job and of its parents. A cancelled job is not executed but finished as usual, so counters, waiting threads and dependents stay correct. When a cancelled job finishes, the jobs that depend on it are cancelled too.

The check is cheap in the normal case: a counter of all handles with a pending cancellation lets the worker skip it completely while it is zero.
Parallel-for jobs look at the flag between their batches, so they stop early. A job that is already running cannot be interrupted, it can only ask `IsCancelled(handle)`.

## Why there are no allocations

Everything is allocated once, up front, and reused:

| What | How it is reused |
|---|---|
| Job handles | Index into struct-of-arrays pool, recycled through a lock-free stack when the job is finished |
| Dependencies | Nodes of linked lists in preallocated arrays, recycled through a lock-free stack |
| Hand-over queues | Fixed-size lock-free ring buffers, instead of `ConcurrentQueue`, which allocates a new segment whenever one fills up |
| Parallel-for | The job that splits the range and the jobs for each part are pooled |
| Struct jobs | A pooled wrapper object carries the struct, so it is never boxed |
| Struct jobs in parallel-for | Passed as generic type parameters, so they are never boxed either |
| Pooled objects | The pools grow with the highest number of objects in use at the same time and never shrink, so a busy frame pays once |
| Exceptions | Only allocated when a job actually throws |

With struct jobs you allocate nothing at all. Class jobs are your own objects: create them once and reuse them.
A test in `JobScheduler.Test` (`JobSchedulerAllocationTests`) measures allocations on all threads and fails if scheduling allocates.

## Why it is fast

- **No locks on the hot path.** Deques, queues and pools use atomic operations only. Owners push and pop in their own deque, and only race a thief with a compare-and-swap for the very last job.
- **Work stays local.** A job that spawns children keeps them on its own worker. Nobody else touches them unless they are idle and steal them.
- **Small, flat data.** A handle is a 4-byte struct and the data of all handles lies in a few arrays, instead of one object per job. Counters that threads update at the same time sit on their own cache lines (*padding*), so cores do not fight over one cache line.
- **Idle workers do not interfere.** A worker without work only reads other workers' queues, and a quick check shows whether a queue is empty before anything expensive is tried.
- **Waiting is working.** `Wait` executes jobs, so the calling thread is another worker instead of a blocked one.
- **Parallel-for is cheap.** A range is cut into a few parts per worker (4 per worker), not into one job per element. Each part is a pooled job that loops over batches of its indices. The loop is generic over your job type, so `Execute` can be inlined.
- **Sleeping, but not too early.** See below.

### Idle workers: spin first, then sleep

A worker without work first *searches* for a short time, then sleeps on a semaphore.
Searching notices new work within microseconds but burns a core. Sleeping costs nothing but waking up takes tens of microseconds.

How long to search is the classic ski-rental problem: spin about as long as a wake-up costs, and you never pay more than twice the best possible choice.
The default `AdaptiveIdleSpinPolicy` measures how long wake-ups take on your machine and uses that, within 20 to 500 microseconds.
You can replace it with a `FixedIdleSpinPolicy` or your own `IIdleSpinPolicy`.

Waking is cheap for the producer. Only one sleeping worker is woken at a time, and only if nobody is searching already. A woken worker that finds work wakes the next one if work is left, so workers join in one after another instead of all at once.
Sleep and wake-up use a protocol that cannot miss a job published at the wrong moment. It is described in `IdleWorkers`, and a stress test hands over jobs at random moments to check it.

## Exceptions

A job that throws is caught by the worker. The job still counts as finished, so waiting threads continue and dependents run. Cancelled jobs are not failures. The exception is stored, and the next `Wait` throws it as an `AggregateException`. With a `JobExceptionHandler` it is passed to the handler instead.
At most 32 exceptions are stored, so a job that fails every frame cannot fill the memory.

## Trade-offs

- **Limits**: 65,535 unfinished jobs and 65,535 dependency links at once. A handle is only recognized as old for 65,536 recyclings of its slot, after that the generation wraps around.
- **Dependencies**: add them before the job they depend on is flushed. Adding one to a job that has finished already does nothing, there is nothing to wait for.
- **Cancellation is cooperative**: running jobs are never interrupted.
- **Wake-up latency**: after more than the search time without work, the first jobs pay a wake-up, roughly 50 to 200 microseconds on a slow system. This is the price for using no CPU while idle.
- **`Wait` runs any job**: not only the ones you wait for.
- **Struct jobs**: they travel in a pooled wrapper, which costs a little more time than a class job that was created beforehand. They allocate nothing, though.
- **Fairness**: there are no priorities. Jobs run in the order the queues and thieves deliver them.

## Numbers

All scenarios, with the exact setup, are in [benchmarks](benchmarks.md).

Compared with the NuGet package 1.1.2 on the same machine:

- Scheduling and finishing many small jobs is about 13 to 30 times faster, and so are jobs with many dependencies.
- Parallel-for over small ranges, like the queries of an ECS frame, is about 5 to 6 times faster.
- Chains of dependent jobs are about 1.5 to 3 times faster.
- Work that is heavy enough to keep all cores busy takes the same time, as there is nothing left to save.
- Struct jobs do not allocate anymore. The package boxes them with 24 bytes per job.
- The first job after a pause of 2 milliseconds takes about 50 microseconds instead of 250.

Benchmark on your own workload before relying on any of these numbers: the jobs here are mostly almost empty, so they measure the scheduler, not your code.
