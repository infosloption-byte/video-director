# Website-to-Video: local SDXL provider (staged, not activated)

**State 2026-11-03:** The GPU host has a previously tested SDXL model cache
under `voxora-sdxl-cache/hub/models--stabilityai--stable-diffusion-xl-base-1.0`.
The 576×1024 portrait pipeline and optional read-only cache mount have been
committed. GPU image jobs are **still disabled** and TTS/media coordination
**has not been activated**. No production SDXL storyboard image has been
verified. This document distinguishes code deployment from GPU activation.

## Architecture

1. Storyboard submits an authenticated `visualMode:"ai"` request.
2. With `VOXORA_MARKETING_IMAGE_PROVIDER=sdxl_local`, the Voxora API creates
   a short, scene-specific prompt and posts `kind:"image"` to the **private**
   GPU Media API (`POST /v1/jobs`). The GPU token never leaves the server.
3. The GPU API returns `202` plus a 32-character job ID. The Voxora API saves
   `sdxlImageJob` in the scene's existing customization JSON and returns
   `202` to the browser. **Existing scene artwork is unchanged.**
4. The browser polls **Voxora** (not GPU) at
   `GET /api/scenes/:sceneId/ai-image-jobs/:jobId`. Authentication and scene
   ownership middleware apply to both routes.
5. When the job finishes, Voxora downloads the authenticated bounded PNG,
   checks file type, dimensions and 9:16 aspect ratio, normalizes it through
   FFmpeg and updates the scene asset + provenance in one DB transaction.
   The media service's `gpu_reservation` admission gate is retained.
6. If the job fails, no new local fallback silently replaces the previous
   image. A failed job marker can be cleared so a deliberate retry can begin.

This is a **poll-driven finalization** design: leave the browser open to see
completion. If the browser closes, reopening a scene and requesting an AI
visual can resume a persisted pending job rather than queue another one.
Background job reconciliation and stronger multi-instance transaction locking
are needed before high-volume production.

## Configuration (OFF by default)

In Lightsail `.env.lightsail`:

```dotenv
VOXORA_MARKETING_IMAGE_PROVIDER=sdxl_local
VOXORA_MARKETING_AI_IMAGES_ENABLED=true
VOXORA_SDXL_ENABLED=false
# Set ONLY after approved private networking:
VOXORA_SDXL_API_URL=
```

In Lightsail `server/.env` (private, never commit or paste):

```dotenv
VOXORA_SDXL_API_TOKEN=
```

`VOXORA_SDXL_API_TOKEN` must be the **same private API bearer token** as
the GPU Media Service's `GPU_MEDIA_AUTH_TOKEN`, stored securely on each
host. The token is read from `server/.env` (`env_file`), not baked into the
frontend or Compose environment map.

Remote `VOXORA_SDXL_API_URL` **must use HTTPS**. The only permitted HTTP
destination is an explicit loopback address such as
`http://127.0.0.1:18010` reached over an **encrypted, access-controlled SSH
tunnel** maintained by the operator. The GPU service's real EC2
`127.0.0.1:8010` port stays private. Do **not** open port 8010 to the
public Internet and do not use an unencrypted private-IP URL.

Do not enable `VOXORA_SDXL_ENABLED=true` until private networking and
GPU coordination are both tested, otherwise scene requests will be rejected.

On the GPU Media Service, **ALL** of these are required before image jobs
are accepted:

```dotenv
GPU_MEDIA_HEAVY_ENABLED=true
GPU_MEDIA_IMAGE_ENABLED=true
GPU_COORDINATION_ENABLED=true
GPU_MEDIA_VIDEO_ENABLED=false
```

The GPU coordination overlay currently pins flags to `false` deliberately.
Do **not** edit live flags or recreate running services to bypass this gate
without an operator-approved TTS maintenance window, full cross-stack lock
testing and rollback preparation; see `gpu-coordination/ROLLOUT.md`.

## Important SDXL cache and GPU checks

The model cache volume exists and `models--stabilityai--stable-diffusion-xl-base-1.0`
was found, but no complete snapshot/weight-content inspection has been
provided yet. First verify the cached snapshot is complete, and run the
GPU media test suites and Compose config validation with no service restart.
Use the read-only inspection commands in
`gpu-media-service/SDXL_STAGING.md`.

Only after the TTS gateway and the media worker BOTH honor the same
authenticated Redis lease, and the Tesla T4 has adequate VRAM admission,
may one isolated operator-only 576×1024 SDXL image be attempted.
Qwen/TTS must be protected. The prior 768×1024 image benchmark is **not**
a proof of correct 576×1024 inference or live latency.

## Validation before deploying inactive code

```bash
cd /opt/apps/voxora
npm --prefix frontend run test:unit
npm --prefix frontend run build
node --check server/src/services/websiteSdxlImageService.js
node --check server/src/services/websiteMarketingVisualService.js
node --check server/src/routes/storyboard.js
node --test server/test/websiteSdxlImageService.test.js server/test/websiteAiBrandImages.test.js
```

On the GPU host (after installing test dependencies in an isolated env):

```bash
cd /opt/voxora-gpu/video-director/gpu-media-service
python3 -m compileall -q media_service
python3 -m pytest -q test/test_api.py tests/test_sdxl_runtime.py
sudo docker compose -p voxora-media \
  -f docker-compose.gpu.yml -f docker-compose.sdxl-cache.yml \
  --profile worker config --quiet
```

The test suites do not invoke CUDA, download SDXL model weights or create
paid Gemini requests. No database migration is required.

## Remaining rollout gates

- Run updated CI and smoke tests, verifying the code change does not break
  any existing Website-to-Video, narration or render workflow.
- Verify **actual** model weight files, not only the presence of the HF cache
  directory; make sure `local_files_only=True` can find the full model.
- Confirm gateway and worker are both on the validated coordination client
  and attached to the private Redis coordination network, including lease
  failure and cancellation tests.
- Establish and test the encrypted private connection between Lightsail and
  the GPU Media API using a non-image authenticated status request first.
- Test one operator-only SDXL image with other GPU-heavy jobs idle, record
  VRAM/latency/output and verify TTS recovery before enabling customer access.
- Test the complete owned-scene submit → poll → import → Preview flow with
  **one** scene before bulk generation. Render MP4 and verify captions.
- Add multi-instance-safe idempotency, background reconciliation, explicit
  per-customer quotas and GPU admission monitoring before scaling beyond a
  controlled beta. These protections are not yet proven in production.

**Do not assume that pushing these commits to main enables GPU inference.**
The flags and cross-host link deliberately remain disabled.
