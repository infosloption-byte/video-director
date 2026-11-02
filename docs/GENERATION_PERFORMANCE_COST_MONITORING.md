# Detailed generation performance and cost monitoring — Batch 2

This release builds on the already deployed `generation_traces` and Admin Activity dashboards.
It DOES NOT change where rendering runs. Remotion still runs in the Lightsail Voxora API
worker, and TTS continues running on the EC2 GPU host.

## Admin pages

- `/admin/analytics/pipeline`: individual research stages, Gemini model attempts and
  reported tokens, Pexels search, per-scene Helix TTS inference/MP3 conversion,
  render media preparation, bundle, composition, frame/encoding completion milestones,
  observed muxing time, queue wait and full storyboard/editor render.
- `/admin/analytics/infrastructure`: API container CPU and cgroup RAM use; optional
  GPU EC2 utilization, VRAM, temperature and host RAM from authenticated outbound
  `nvidia-smi` reports. The 7-day retention is summarized into 15-minute data points
  when displayed; readings are not an AWS CloudWatch or whole-host fleet view.
- `/admin/analytics/economics`: per-project, current-plan and per-customer usage;
  verified provider charges (when reported), unknown-cost operation coverage and
  optional nominal compute-time estimates (operator-supplied hourly rates). Net margin
  and billed revenue **remain unavailable**, because there is no reconciled net
  Paddle revenue/invoice ledger and provider bills are not fully instrumented.

Operations/timing records are immutable and avoid prompts, raw model responses,
transcripts, audio, secret tokens, video URLs or raw provider errors. Existing
project and account deletion flows remove related generation traces.

## Correct interpretation

- A `render.remotion` span measures full storyboard execution; its children
  `render.remotion_media`, frame and encoding milestones are **overlapping**
  diagnostics, not independently billable CPU time. Never add them to total
  execution time or compute allocation. Official Remotion `renderedDoneIn`
  and `encodedDoneIn` report milliseconds, measured since rendering started.
- `render.queue_wait` and `editor_render.queue_wait` are BullMQ enqueue-to-start
  times, not actual CPU work. A retry creates a new attempt.
- Research phase boundaries represent the application's emitted progress stages.
  `research.full` measures the entire job and includes overhead.
- Gemini request `usageMetadata.promptTokenCount` and
  `usageMetadata.candidatesTokenCount` are recorded per HTTP attempt when provided.
  No token-based price list is silently assumed. A successful HTTP response may still
  be invalid schema/content; the provider HTTP status and the eventual generation
  outcome are separate facts.
- The TTS span measures API-to-remote-GPU inference/transport; the separate
  WAV-to-MP3 span measures local conversion/storage, not dedicated GPU kernel
  time. Worker-level GPU attribution requires future GPU-gateway instrumentation.
- API container CPU percentage may exceed 100% because it uses multiple cores.
  RAM is cgroup container RAM, **not whole Lightsail** RAM shared by other apps.
- Optional rate variables `LIGHTSAIL_RENDER_ALLOCATION_USD_PER_HOUR` and
  `LIGHTSAIL_RESEARCH_ALLOCATION_USD_PER_HOUR` produce nominal wall-time
  allocations. These are estimates, not invoices, net costs, or profitability.
- `verifiedProviderCostUsd=null`, `billedRevenueUsd=null` and `marginUsd=null`
  mean unknown. Never show missing amounts as $0.
- Report project history and cost allocation are limited to the latest 150
  created-in-window projects and 5,000 matching traces. A truncation flag is
  returned; the result is **not** an accounting reconciliation.

## Production rollout

This PR contains the additive MySQL migration
`20261102150000_infrastructure_monitoring`, and changes the API/frontend
images. Deploy only during a quiet window after the current Remotion rendering
and research queues are drained, and take a verified MySQL backup first.

Run manually after merging:

```bash
cd /opt/apps/voxora
git fetch origin
git pull --ff-only origin main

# Backend regression tests in the existing running API image are insufficient;
# build the NEW image before running the new tests:
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build api frontend

sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml \
  run --rm --no-deps --entrypoint node api --test \
  test/platformOperationsAnalytics.test.js test/generationPerformanceMonitoring.test.js

sudo docker build --target build -t voxora-frontend-monitoring-tests:20261102 ./frontend
sudo docker run --rm --network none voxora-frontend-monitoring-tests:20261102 npm run test:unit
```

After confirming tests and a fresh database backup, recreate only API/frontend,
using existing Lightsail Compose configuration. The API entrypoint applies the
migration at startup. Verify `/api/health`, admin authorization, both reporting
routes, and that new research/scene/narration/render events produce traces.

**Do not automatically restart GPU TTS, coordination Redis, GPU media workers,
MySQL, or other Lightsail services.** Do not enable GPU coordination to deliver
this release.

## OPTIONAL GPU telemetry setup (separate operator step)

The ingestion endpoint `POST /api/internal/telemetry/gpu` is disabled until
`GPU_TELEMETRY_INGEST_TOKEN` is configured with at least 32 random characters.
It accepts numerical GPU metrics only; it uses constant-time token comparison,
rejects stale/future timestamps, and does not accept voice or customer content.

1. Generate a strong 48-byte random secret offline on Lightsail, without
   pasting it into chat or logs. Store it as `GPU_TELEMETRY_INGEST_TOKEN` in
   `.env.lightsail` (permissions 600). Recreate only the Voxora API during a
   maintenance window so the Compose environment receives the value.
2. On GPU EC2, after pulling the merged code in its repo checkout, copy
   `scripts/report_gpu_telemetry.sh` to a root-owned protected location. Make a
   root-owned `/etc/voxora-gpu-telemetry.env` (permissions 600):
   ```
   VOXORA_METRICS_TOKEN=<same-secret-as-Lightsail>
   VOXORA_METRICS_URL=https://usevoxora.online/api/internal/telemetry/gpu
   ```
   Replace the placeholder privately; do not paste it here.
3. Verify a single run with `sudo bash scripts/report_gpu_telemetry.sh` and check
   that the server returns 202. Only then, if desired, schedule a root cron job
   no more often than every 60 seconds.
4. The script only invokes `nvidia-smi`, reads `/proc/meminfo`, and sends an
   outbound HTTPS POST. It never restarts, loads or evicts AI models. Do not
   expose port 8000 or EC2 GPU worker ports publicly for monitoring.

Keep the token out of all screenshots and shell transcript snippets. The
receiving endpoint uses a 3-minute timestamp tolerance, so the machines'
system clocks must be synchronized.

## Remaining instrumentation (not included)

- Exact Gemini and external search spend reconciled to provider bills/prices;
  usage count is tracked but unpriced.
- GPU per-request engine/worker timing, engine memory residency and actual
  GPU watt-hour utilization (host snapshots alone cannot attribute each job).
- Full Lightsail host utilization across all other Docker projects; current
  API metrics are intentionally scoped to its cgroup.
- Reconciled Paddle net revenue (tax, discounts, refunds, currency conversion,
  processor fees) and real margin per customer and subscription period.
- Predictive alerts, quotas tied to actual marginal cost, long-term storage/
  network billing, and complete history beyond bounded reporting windows.
