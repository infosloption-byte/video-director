# GPU media deployment and scheduling

## Verified fixes

- Faster-Whisper 1.2.1 is compatible with the pinned PyAV 18.1.0 decoder.
- CTranslate2 GPU inference on the Tesla T4 was tested with `int8_float16` using CUDA 12 cuBLAS and cuDNN 9 shared libraries.
- CPU transcription, queued RQ execution, and JSON artifacts were successfully tested on the GPU server.
- `GPU_MEDIA_WHISPER_DEVICE` remains `cpu` by default. Do not switch queued production jobs to CUDA without GPU coordination.
- Image/video jobs remain disabled by `GPU_MEDIA_HEAVY_ENABLED=false`.

## Deployment after PR merge

Do not pull over uncommitted server changes. Inspect first:

```bash
cd /opt/voxora-gpu/video-director
git status --short
git diff -- gpu-media-service
git fetch origin
```

The production server was manually patched before these repository fixes. Back up any changes, compare with the merged branch, and reconcile them before a pull. **Do not delete `.env` files, volumes, or the TTS data directory.** Once the working tree is clean:

```bash
git switch main
git pull --ff-only origin main
cd gpu-media-service
sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker build worker
sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker up -d --no-deps worker
sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker ps
```

The Docker build runs `smoke_decoder.py`. Test a new real-speech transcription through `POST /v1/transcriptions` and check status and artifact endpoints before changing GPU mode.

## Next phase: cross-service GPU coordination (not implemented in this PR)

The TTS gateway uses an in-process `asyncio.Lock` and Qwen3 uses the Tesla T4; the media worker serializes RQ jobs but does not coordinate with TTS. A shared network alone is **not** a scheduler.

Before enabling GPU jobs:

1. Add an authenticated shared coordination service reachable by both stacks; preserve independent media queue behavior.
2. Implement unique-owner leases, atomic unlock, renewal/expiry, and fail-closed handling when coordination is unavailable.
3. Ensure TTS GPU model lifecycle operations and synthesis acquire the shared lease, including unload/reload and failure/fallback paths.
4. Ensure media GPU execution acquires the same lease, validates available VRAM, and releases it on all outcomes.
5. Test concurrent TTS vs transcription, forced worker crashes, connectivity loss, lock expiry, and client cancellation.
6. Keep heavyweight generation disabled until TTS latency/VRAM behavior has been measured with actual SDXL/Wan workloads.

A cooperative lock cannot preempt already-running inference; strict TTS latency guarantees may require separate GPU capacity or scheduled heavy-job windows.
