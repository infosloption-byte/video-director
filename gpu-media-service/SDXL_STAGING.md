# SDXL Website-to-Video staging — safe checks before activation

**Status:** code ready for isolated verification, **not activated in production**.
No Gemini image request is made by these GPU-side changes. Lightsail Voxora
still uses its existing image provider until a separate backend integration is
deployed. Never claim live SDXL is available just because the model cache is
present.

## What the GPU host currently has (2026-11-03)

- Tesla T4 GPU, 15,360 MiB VRAM; ~3,627 MiB allocated by an existing
  `uvicorn` process in the supplied telemetry (not idle GPU memory).
- Existing tested `voxora-sdxl-cache`: 6.7 GB.
- Active worker HF cache `voxora-media_media-hf-cache`: 464 MB.
- `voxora-media` API, worker, Redis and janitor running.
- `GPU_MEDIA_HEAVY_ENABLED=false`; no coordination enabled on the worker.
- A coordination Redis container exists, but that alone does **not** mean
  the TTS gateway and media worker honor a common GPU lock.

## Code staged (not live)

- SDXL produces a portrait 576×1024 PNG (9:16) rather than the old
  768×1024 test image, which does not fit the Website-to-Video portrait gate.
  The new portrait resolution must be benchmarked on the T4; do not assume
  the previous runtime applies unchanged.
- SDXL model loading requires an operator-configured, **already cached**
  Hugging Face snapshot. Model downloads during a customer request are
  forbidden (`local_files_only=True`).
- Optional cache-only Compose overlay:
  `gpu-media-service/docker-compose.sdxl-cache.yml`. It mounts
  `voxora-sdxl-cache` read-only at `/sdxl-cache`, and sets
  `GPU_MEDIA_SDXL_CACHE_DIR=/sdxl-cache/hub`.
- Three switches must ALL be true before image jobs are accepted:
  `GPU_MEDIA_HEAVY_ENABLED`, `GPU_MEDIA_IMAGE_ENABLED`, and
  `GPU_COORDINATION_ENABLED`. Defaults remain **false**.
- Video inference stays independently disabled unless
  `GPU_MEDIA_VIDEO_ENABLED=true` is explicitly approved; enabling SDXL
  must never turn on Wan video generation.

## Read-only checks to run now on GPU EC2

These commands do **not** restart containers, enable generation or access
Gemini. They do not display passwords.

```bash
cd /opt/voxora-gpu/video-director
git status --short
git pull --ff-only origin main

cd gpu-media-service
python3 -m compileall -q media_service
python3 - <<'PY'
from media_service.sdxl_runtime import SDXL_WIDTH, SDXL_HEIGHT, image_job_enabled
assert (SDXL_WIDTH, SDXL_HEIGHT) == (576, 1024)
assert not image_job_enabled()
print("Offline SDXL staging config is valid; image inference remains disabled")
PY
# After installing requirements-test.txt in an isolated environment:
# python3 -m pytest -q test/test_api.py tests/test_sdxl_runtime.py

# Check the existing cache layout without writing to either HF volume.
sudo docker run --rm --network none --entrypoint sh \
  --mount type=volume,src=voxora-sdxl-cache,dst=/sdxl-cache,readonly \
  voxora-media-worker -c \
  'find /sdxl-cache -maxdepth 6 -type d -name "models--stabilityai--stable-diffusion-xl-base-1.0" -print; \
   find /sdxl-cache -maxdepth 8 -type d -name snapshots -print | head -12'

# Render the optional Compose configuration without deploying it.
sudo docker compose -p voxora-media \
  -f docker-compose.gpu.yml -f docker-compose.sdxl-cache.yml \
  --profile worker config --quiet

# Verify current TTS and GPU workloads before planning a canary.
nvidia-smi
sudo docker ps --format 'table {{.Names}}\t{{.Status}}'
```

**Do not execute an image inference job yet.** The read-only Docker command
uses the existing worker image solely to inspect the cache layout; it does
not require the updated source code inside that image.

If the cache root is NOT `/sdxl-cache/hub`, do not move/copy 6.7 GB blindly.
Inspect where the `models--...` folder is located and adjust the optional
mount's `GPU_MEDIA_SDXL_CACHE_DIR` only after review. Ensure `snapshots`
contains actual weight files or symlinks to present blobs, not just names.

## Required admission steps before enabling heavy jobs

1. Pass GPU media API and SDXL runtime tests plus the existing lease/client
   tests without CUDA or TTS disruption.
2. Verify the active TTS gateway and the media worker are both running the
   *same* validated coordination protocol against the *same*, private,
   authenticated lock Redis. The currently deployed worker has
   `GPU_COORDINATION_ENABLED` unset.
3. Establish an approved idle/TTS maintenance window, a controlled GPU
   admission plan and rollback snapshot (see `gpu-coordination/ROLLOUT.md`).
   A shared Redis lease is not guaranteed to interrupt an active CUDA kernel
   when a heartbeat is lost. Long SDXL jobs can delay live TTS.
4. With customer TTS submissions paused and no active media jobs, benchmark
   one **operator-only** 576×1024 SDXL image using the existing API.
   Measure VRAM, execution time, CUDA failures and quality.
5. Only once the private GPU API has passed staging may Lightsail backend
   integration be configured. It requires authenticated private transport,
   per-tenant accounting, async queue/polling, short-lived output validation
   and preservation of earlier scene images on failure. Never publish port
   8010 to the Internet or send the GPU API bearer token to browsers.

## Useful test commands after installing project test dependencies

```bash
cd gpu-media-service
python3 -m pytest -q test/test_api.py tests/test_sdxl_runtime.py
python3 -m pytest -q tests/test_gpu_admission.py tests/test_gpu_lease.py
python3 -m compileall -q media_service
```

**Rollback:** these source and optional overlay changes are dormant until
an operator uses them. The safe operational rollback is to keep the existing
base Compose file and all coordination/heavy flags disabled. Do not use
`docker compose down`, `--remove-orphans`, `-v`, or delete either cache
volume to roll back a code-only staging change.
