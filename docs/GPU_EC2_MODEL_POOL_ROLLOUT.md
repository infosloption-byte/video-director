# Voxora GPU EC2: private connectivity and Admin TTS rollout

Status: **admin-only candidate; existing customer production TTS remains unchanged**.

## Verified network and model baseline

- Lightsail Voxora: `172.26.9.120`; GPU EC2 (Tesla T4): `172.31.64.234`; both `us-east-1`.
- Active VPC peering: `pcx-0311143e10399906e`, with a return route for `172.26.0.0/16` from EC2.
- Lightsail `kandyads_default` Docker bridge overlaps the GPU VPC (`172.31.0.0/16`). The successfully verified host route is `172.31.64.234/32 via 172.26.0.1 dev ens5 src 172.26.9.120`.
- From both the Lightsail host and Voxora API container, GPU `/health` returned HTTP 200. Unauthenticated `/diagnostics` returned HTTP 401.
- Verified experiments: Qwen3-TTS Base with `QWEN_DTYPE=float32`, Kokoro, faster-whisper CPU INT8, Chatterbox Multilingual V3, SDXL and Wan2.1 (33 frames, ~18 min total). Do not run heavyweight jobs concurrently.

## 1. Persist the /32 route on Lightsail

This does not reconfigure KandyAds Docker networks or require a reboot. Do not execute on EC2.

```bash
ip -4 route get 172.31.64.234
sudo tee /etc/systemd/system/voxora-gpu-route.service >/dev/null <<'EOF'
[Unit]
Description=Voxora route to GPU EC2, bypassing overlapping Docker bridge
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/sbin/ip -4 route replace 172.31.64.234/32 via 172.26.0.1 dev ens5 src 172.26.9.120
ExecStop=-/usr/sbin/ip -4 route del 172.31.64.234/32
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
command -v ip  # confirm /usr/sbin/ip before enabling, otherwise edit the paths in the unit
sudo systemctl daemon-reload
sudo systemctl enable --now voxora-gpu-route.service
sudo systemctl status voxora-gpu-route.service --no-pager
ip -4 route get 172.31.64.234
```

Expected: systemd `active (exited)` and route via `ens5`. Roll back with `sudo systemctl disable --now voxora-gpu-route.service`.

During a later maintenance window, migrate KandyAds off overlapping `172.31.0.0/16`; do not remove/recreate its live network now.

## 2. Security and transport

- EC2 SG inbound TCP 8000 source **only** `172.26.9.120/32`; no public access or exposed worker ports 8101/8104.
- GPU gateway bound to `172.31.64.234:8000`; it must have a nonempty `TTS_AUTH_TOKEN`. The gateway now fails closed on authenticated endpoints if not configured.
- Restrict SSH 22 to an administrative source; close 80/443 if unused.
- **VPC peering is not TLS.** Use synthetic admin test text and an explicitly consented, operator-owned Qwen test voice only during this internal HTTP phase. Add private HTTPS/mTLS or an encrypted tunnel before customer narration or reference recordings are sent to the new GPU server.

Confirm routing on Lightsail with:

```bash
curl -fsS http://172.31.64.234:8000/health
curl -sS -o /dev/null -w 'unauthorized=%{http_code}\n' http://172.31.64.234:8000/diagnostics
cd /opt/apps/voxora
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml exec -T api node -e 'fetch("http://172.31.64.234:8000/health").then(r => { console.log("API:", r.status); process.exitCode=r.ok?0:1 }).catch(e => { console.error(e.message); process.exitCode=1 })'
```

## 3. Configure the admin-only Model Pool

After merging this PR, use `/opt/apps/voxora/server/.env`, which is loaded by `api.env_file`, to supply:

```dotenv
AI_POOL_ALLOWED_ORIGINS=http://172.31.64.234:8000
AI_POOL_ALLOW_INSECURE_HTTP=true
GPU_TTS_AUTH_TOKEN=<secure-copy-of-gpu-TTS_AUTH_TOKEN>
AI_POOL_TTS_TEST_VOICE_ID=<authorized-operator-owned-voice-id>
```

Merge the GPU origin into any existing `AI_POOL_ALLOWED_ORIGINS` list; do **not** overwrite unrelated configured origins. Keep `AI_POOL_ENCRYPTION_KEY` unchanged. Model Pool can alternatively use a model-specific encrypted API key in Admin instead of `GPU_TTS_AUTH_TOKEN`.

`AI_POOL_ALLOW_INSECURE_HTTP=true` is an explicit, temporary admin-test exception; remove it once private HTTPS is deployed. Do not configure or change production `TTS_SERVICE_URL` or `TTS_SERVICE_AUTH_TOKEN`. The Lightsail Compose `environment` overrides production TTS variables through `.env.lightsail`.

When ready for admin testing, build and deploy only after review/merge and with controlled restart:

```bash
cd /opt/apps/voxora
git pull --ff-only origin main
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build api frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d --no-deps --force-recreate api frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml ps
```

### Register two admin model records

| Field | Kokoro | Qwen |
| --- | --- | --- |
| Hosting type | Self-hosted | Self-hosted |
| Provider | Voxora private GPU / TTS | Voxora private GPU / TTS |
| Model identifier | `kokoro` | `qwen3-tts-0.6b` |
| Endpoint | `http://172.31.64.234:8000/v1/audio/speech` | Same |
| Capabilities | `speech` | `speech` |
| Authentication | `GPU_TTS_AUTH_TOKEN` environment or encrypted key | Same |

Run the live speech test from Admin → AI Model Pool. It synthesizes a fixed **administrator-only** sentence, forces `allow_fallback=false`, checks actual WAV/audio format, duration and expected engine, and stores only metrics. It does not retain or display WAV/base64/reference recordings. Qwen tests require `AI_POOL_TTS_TEST_VOICE_ID` pointing to an approved, operator-owned voice; no regular customer reference should be used.

Passing this test grants **draft-stage verification only**; pipeline publishing safeguards remain in force. Actual voice similarity and latency must still be evaluated separately.

## 4. Further GPU development — separate milestones

The standalone SDXL and Wan containers are experiments, not deployable customer APIs. Next: permanent Whisper worker; authenticated image and video APIs; durable one-heavy-GPU-job-at-a-time scheduler, output isolation and S3/media retention, timeouts/cancellation/retries; admin-only capability tests and previews; encrypted transport; existing voice-profile migration plan; and finally feature-flagged workspace rollout. Wan should remain queued/experimental until speed and cost are acceptable.

Do not claim visuals/video verified in Admin merely because standalone CUDA tests produced files.
