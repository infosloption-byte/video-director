# Voxora GPU Media Engine — queued inference (admin-only, staging)

**Phase:** isolated code and deployment candidate. This is **not wired into the customer workspace** and does **not** replace the existing `tts-service`.

The standalone T4 tests for Whisper-small CPU INT8, SDXL Base 1.0 and Wan2.1 T2V 1.3B are implemented as background jobs in a new Redis/RQ service. **Only one media worker** processes jobs at a time. Existing Kokoro/Qwen TTS workers are a *separate stack* and are **not yet protected by a common scheduler**. Accordingly, the media worker's GPU-intensive image/video paths **fail closed by default** with `GPU_MEDIA_HEAVY_ENABLED=false`. Do not enable GPU-intensive jobs while TTS may load Qwen; add a coordinated GPU arbiter/unload protocol first.

## Components

- `api`: FastAPI HTTP bearer-authenticated **operator-only** jobs API, default bind `127.0.0.1:8010`. Not exposed to browsers or end users.
- `redis`: Redis AOF for durable queued job metadata, **no published port**. RQ uses Python pickle; **never** connect this Redis instance to a public or untrusted network.
- `worker`: one RQ worker process / one job at a time, 3 CPU limit, 14 GiB RAM / 30 GiB swap, T4 GPU access, cached Hugging Face model weights on EBS-backed named volume. Uses separate forked job processes to release GPU memory after each job.
- `janitor`: removes terminal job artifacts older than 24 hours; no deletion while jobs are active.
- `media-artifacts`: private volume with per-job output, single immutable filename per job and `/v1/jobs/{id}/artifact` authenticated file delivery.

Job statuses: queued, started, finished, failed, canceled; running cancellation sends an RQ stop command and may race with completion. No re-enqueue/retry; failed jobs require an explicit new request.

Limits: 20 pending jobs, 25 MiB upload cap, 5 minute transcription audio cap (checked with ffprobe in worker), text prompts max 1200 characters, fixed 768x1024 SDXL image or 832x480, 33-frame Wan video, result/failed-job TTL 24h and max queue wait 6h.

## Local host deployment on GPU EC2

**After review/merge only**. Use the GPU EC2 host `/opt/voxora-gpu/video-director` and preserve the existing `tts-service` deployment.

```bash
cd /opt/voxora-gpu/video-director
git pull --ff-only origin main
cd gpu-media-service
umask 077
cp .env.example .env
openssl rand -hex 32
```

Paste the generated token into `.env` `GPU_MEDIA_AUTH_TOKEN`; do not share it in chats or git. Keep `GPU_MEDIA_BIND_IP=127.0.0.1` and `GPU_MEDIA_HEAVY_ENABLED=false`.

```bash
sudo docker compose -p voxora-media -f docker-compose.gpu.yml config --quiet
sudo docker compose -p voxora-media -f docker-compose.gpu.yml build api
sudo docker compose -p voxora-media -f docker-compose.gpu.yml up -d redis api janitor
curl -fsS http://127.0.0.1:8010/health
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8010/v1/status
# Expected: 401 if API token is configured
```

**Whisper worker** can be started independently for CPU tasks but will consume CPU/RAM alongside Qwen:

```bash
sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker build worker
sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker up -d worker
sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker ps
```

Use the locally stored secret for test requests on **the GPU instance** only; avoid echoing tokens into terminal logs or using commands that expose tokens in process listings. Example using a prompt `read -rs`:

```bash
read -rs -p 'Media API bearer token: ' TOKEN; echo
curl -fsS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8010/v1/status
unset TOKEN
```

For a local Whisper job, use `POST /v1/transcriptions` with a WAV/MP3/M4A file, poll `GET /v1/jobs/{id}`, and fetch `GET /v1/jobs/{id}/artifact`; the output is a private JSON containing detected language, timestamps, and transcript. Ensure you have rights to use any audio input.

```bash
# Pseudocode: set the locally protected token before invoking curl
curl -X POST http://127.0.0.1:8010/v1/transcriptions \
  -H "Authorization: Bearer ${TOKEN}" -F "file=@/path/to/approved-test.wav"
```

**Do not bind this new API to EC2 private IP or open port 8010 on security groups yet.** First add private TLS/mTLS and an operator-only client in Voxora Admin. The current service is admin-bearer-only, not tenant-aware and has no Paddle quota enforcement. No customer upload or generated content should be routed to it until identity, rate/quota limits and encrypted transport are in place.

### Endpoint contract

| Verb and path | Response |
|---|---|
| `GET /health` | public localhost liveness only; not proof queue or worker is available |
| `GET /v1/status` | authenticated Redis ping, queue depth, heavyweight disabled flag |
| `POST /v1/transcriptions` | authenticated multipart `file` (optional language ISO code); returns 202 job |
| `POST /v1/jobs` | authenticated image/video generation request; returns **HTTP 409** while GPU-heavy jobs are disabled, HTTP 202 only after safe enablement |
| `GET /v1/jobs/{id}` | authenticated status, progress and safe result metadata |
| `POST /v1/jobs/{id}/cancel` | authenticated queued cancellation or running stop request |
| `GET /v1/jobs/{id}/artifact` | authenticated file download only after success |

The worker downloads model checkpoints at first use; first-run latency may be much longer than warm-job time. The existing Wan benchmark took approximately **18 minutes end-to-end** for a ~2-second video on this T4, including download and model initialization. Do not offer interactive video promises or sell tiers based on that latency.

### Safeguards before image/video tests

1. Implement a **cross-stack GPU lease** shared with the Helix TTS gateway, including a verified Qwen unload and no new TTS model loads during heavyweight jobs; both sides must honor the lock. Merely limiting media worker concurrency does not prevent TTS overlap.
2. Rehearse cancellation and restart recovery without active customer jobs.
3. Apply private TLS and per-operator/multi-tenant scopes; add per-plan quotas and billing once workspace is integrated.
4. Add admin-only artifact previews, provenance/licensing review, GPU memory and cost metrics, and storage quotas.
5. Run a controlled test of SDXL and Wan with Qwen paused, and verify video/image outputs before claiming model readiness.
6. Do not enable `GPU_MEDIA_HEAVY_ENABLED=true` before these safeguards.

## Tests

```bash
cd gpu-media-service
python -m pip install -r requirements-test.txt
pytest -q test/
python -m compileall -q media_service
sudo docker compose -p voxora-media -f docker-compose.gpu.yml config --quiet
```

Testing is not a substitute for GPU inference on the EC2 instance.

**Roll back:** `sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker down` (named volumes are retained). This leaves the original `voxora-gpu` TTS compose project untouched.
