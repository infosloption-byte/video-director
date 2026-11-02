# Container resource measurement correction (Remotion baseline)

## Root cause

Batch 2 used `process.cpuUsage()` and, if cgroup memory was missing,
`process.memoryUsage().rss`. Those cover the Voxora Node process, not
necessarily the Chromium child processes that render Remotion frames.
The dashboard could therefore display 1–5% CPU and 0.1 GiB RAM while
`docker stats voxora-api-1` reported much higher container resources.

Separately, the 7-day view returned only the **newest** reading in each
15-minute bucket, which could conceal short rendering spikes.

## Correction

- Read cgroup v2 `cpu.stat usage_usec` and `memory.current`.
- Support cgroup v1 `cpuacct.usage` (nanoseconds) and
  `memory.usage_in_bytes` as a fallback.
- Compute container CPU percentage using the delta of cgroup CPU time
  across sampling intervals, where **100% means one fully used logical
  core**, so >100% can be normal when Remotion uses multiple cores.
- Keep `ramTotalBytes=null` for unlimited cgroup memory, including v1
  sentinel values. This is NOT total physical Lightsail RAM.
- If cgroup files cannot be accessed, explicitly label
  `node-process+node-rss` or the corresponding mixed source, and do
  not present fallback as an accurate container-wide benchmark.
- The first CPU sample after startup will be `null` until a valid
  preceding counter exists. This is intentional; it is not zero usage.
- Use 1-minute history for 1-day view, and preserve observed CPU,
  GPU, and RAM interval peaks in the 15-minute 7-day view.
  Peaks are maxima **of samples**, not continuously measured extrema.
- Add tests for cgroup v1/v2 parsing, multi-core percentages,
  unlimited limits, missing files, and UI source/peak labels.

## What remains unchanged

No database migration. No GPU EC2 deployment. No changes to Remotion
encoding, frame rate, TTS or queue logic. Existing rows retain their
prior `node-cgroup` source and are not rewritten.

## Safe verification on Lightsail

During any active Remotion render, do NOT recreate or restart the API.
Run only the feature-branch tests in an isolated, short-lived container.
After PR merge, **wait until research and both BullMQ queues are idle**
before a normal API/frontend rollout.

After deployment:
- Open `/admin/analytics/infrastructure`, select **1 day**, and inspect
  a new `lightsail-api` sample source.
- A `cgroup-v1` or `cgroup-v2` reading means the CPU and memory
  include Chromium subprocesses; `node-process+node-rss` means
  the host's cgroup data is unavailable to the service and metrics
  remain Node-only.
- Compare against `sudo docker stats --no-stream voxora-api-1`
  **during a real render**, allowing for sample timing and interval.
- To inspect cgroup availability without exposing secrets:
  ```bash
  sudo docker exec voxora-api-1 sh -c '
    for f in /sys/fs/cgroup/cpu.stat /sys/fs/cgroup/cpuacct/cpuacct.usage /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory/memory.usage_in_bytes; do
      [ ! -r "$f" ] || echo "readable: $f"
    done
  '
  ```
- This is still **Voxora API container usage**, not whole Lightsail
  host usage across the user's other applications. For host-wide
  benchmarking, a separate host-level collector is needed.
