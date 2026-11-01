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

## Stage 3: GPU memory admission (draft)

GPU media jobs acquiring a shared lease now run a fail-closed `nvidia-smi` free-VRAM check before starting GPU inference. Initial thresholds are **provisional**, not based on final model profiling: transcription 2048 MiB; SDXL image 10240 MiB; Wan video 14336 MiB. They may be overridden with `GPU_MEDIA_MIN_FREE_MIB_TRANSCRIPTION`, `GPU_MEDIA_MIN_FREE_MIB_IMAGE`, and `GPU_MEDIA_MIN_FREE_MIB_VIDEO` for controlled profiling. A wrong or unavailable telemetry reading denies GPU admission rather than continuing blindly.

Free VRAM is **not** a reservation, and model resident allocations can change between measurements. This is not yet sufficient to safely enable heavy generation or offer real-time TTS guarantees. The media worker image must provide `nvidia-smi` at runtime; validate in the exact deployed container before enabling GPU mode. Unit tests use patched telemetry, not a live Tesla T4.

## Stage 4: disposable real-Redis integration tests

The first GPU scheduler unit suite passed 14/14 in the production worker's Python 3.12 image on November 1, 2026. A Tesla T4 in the GPU media worker reported 15,360 MiB total and 11,286 MiB free at the sampled instant. This verifies unit-level lease behavior and working `nvidia-smi` access; it does **not** verify TTS or CUDA concurrency.

To validate actual Redis lease protocol interoperability, after merging the integration-test PR run on the GPU host:

```bash
cd /opt/voxora-gpu/video-director
bash scripts/test_gpu_redis_integration.sh
```

The script creates an `--internal` Docker network and an ephemeral, password-protected Redis 7 container with **no published host ports**. It mounts current GPU media source and TTS gateway source read-only into a temporary copy of the existing `voxora-media-worker:latest` image. It tests:

- Two separate Redis clients cannot acquire the same lease simultaneously.
- The TTS and media `GPULease` implementations contend correctly using the same key.
- Renewal keeps an active Redis TTL alive.
- Stale owners cannot delete another owner's lease.
- A forcibly terminated worker's lease eventually expires and another worker can acquire.

It removes the temporary Redis container and network after the test, including on failure. It does **not** restart the running media worker, the TTS gateway, or the media queue.

**Guardrail:** This test must always run against its own disposable Redis. Never point `GPU_COORDINATION_TEST_REDIS_URL` at production or queue Redis. The password is temporary and passed to disposable test containers; it is not a deployment credential.

Passing these tests still does **not** prove safe GPU inference when the coordinator disconnects while a native CUDA kernel remains active. That requires runtime cancellation/fencing tests and an explicit policy for TTS latency during long-running image/video inference. Keep scheduling disabled and heavy jobs disabled until the complete rollout is validated.
