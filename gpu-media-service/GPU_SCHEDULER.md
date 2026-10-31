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
