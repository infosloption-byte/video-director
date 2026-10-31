# Shared GPU scheduling — implementation stage 1

This branch introduces an **unused** Redis GPU lease primitive with unit tests. It does not activate cross-service scheduling, alter the TTS gateway, or enable image/video jobs. The existing CPU-only queued transcription remains safe.

## Requirements before activation

The current TTS gateway uses only an in-process `asyncio.Lock`. Qwen3 GPU inference happens in a separate container and may load a model into VRAM even when no request is active. A lease acquired only by the media service is **not** cross-service protection.

1. Choose an authenticated, shared Redis coordination endpoint reachable from both Docker Compose projects; do not expose Redis publicly. Do not silently reuse queue Redis without explicitly configuring access controls.
2. Add coordination client dependencies to the TTS gateway and test full request/fallback and GPU model unload/switch lifecycle; preserve `asyncio.Lock` for per-process serialization.
3. Wrap GPU media inference and TTS GPU operations with the SAME lease key. Before entering GPU work, call `assert_held()`; check it between inference steps when possible. Refuse GPU admission when Redis is unreachable.
4. Implement strict lock-loss handling: a failed heartbeat cannot instantly interrupt running native kernels. Do not claim guaranteed TTS priority under active heavy jobs. Heavy jobs need explicit admission windows or separate GPU capacity.
5. Measure available VRAM (and account for resident Qwen models), enforce concurrency limits, cancellation and bounded waiting; test crashes, Redis outages, timeouts, and forced lease expiry.
6. Only after validation, enable GPU Whisper for queued jobs. Keep `GPU_MEDIA_HEAVY_ENABLED=false` until SDXL and Wan are profiled independently.

## Tests for stage 1

From `gpu-media-service` with its API dependencies installed:

```bash
python -m unittest discover -s tests -p 'test_gpu_lease.py' -v
```

**No server deployment is necessary for this stage.** Do not switch existing services to the lease until both clients are integrated and tested.

## Stage 2 opt-in integration (draft; do not enable in production yet)

Both the TTS gateway and media job worker now contain conditional use of the same Redis-backed lease key `voxora:gpu:exclusive`. Both default to coordination **disabled**. The TTS gateway holds it across `ensure_resident` and synthesis and across explicit unload. Media holds it around GPU transcriptions and image/video jobs; CPU transcriptions do not acquire it. When enabled, media GPU jobs fail closed if coordination is absent.

Required environment for BOTH stacks when fully validated:

```text
GPU_COORDINATION_ENABLED=true
GPU_COORDINATION_REDIS_URL=redis://<authenticated-private-coordinator>:6379/0
```

Do not use the literal example endpoint. An external Redis dependency must be authenticated, network-isolated, monitored, and configured with no-eviction for lease keys. The gateway Docker image now includes the Redis client. The local TTS Compose file is untracked on the live server, so **do not overwrite it** with an example or assume a deployable Compose file exists in Git.

**Known limitations:** An RQ worker cannot safely interrupt an in-progress CTranslate2 native call on heartbeat loss; the gateway likewise cannot interrupt a running Qwen kernel. This implementation provides mutual exclusion under healthy connectivity, not hard preemption or guaranteed TTS latency. Adding fencing/admission windows, heartbeat-loss integration tests, explicit priority policy, and pre-deployment rollback tests is required before any production flag is turned on. The current draft has not passed real concurrent GPU workload testing.
