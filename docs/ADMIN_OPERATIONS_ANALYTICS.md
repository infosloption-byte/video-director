# Voxora admin operations analytics — Phase 1

## Purpose and provenance

The platform's administration now exposes four operational reports:

| Route | Description |
| --- | --- |
| /admin/analytics | Research → final MP4 throughput, research session status, recent projects |
| /admin/analytics/pipeline | Measured operation timings, outcomes, and recent errors (without sensitive error detail) |
| /admin/analytics/users | Highest-use customers; drill down for each user's projects and measured operations |
| /admin/analytics/costs | Verified provider cost only; unknown-cost coverage and provider/model breakdown |
| /admin/activity | Unified historical events from project creation, research sessions, project activity, render-credit reservations, admin audit, and new generation traces |

All endpoints are behind `requireAuth` + `requirePlatformAdmin`. Responses are private/no-store. No public endpoints are added.

### What can be shown historically

- Project creation and status, scene count, output seconds and whether an MP4 exists.
- Research session counts/statuses, render-credit reservations, saved voice profiles and customers.
- Pre-existing `ProjectActivity` and `AdminAuditLog` records (if any).
- Timestamps of actual created rows; a project/research session history entry is *derived from a persisted record*, not a fabricated event.

### New telemetry for future work

Migration `20261102120000_generation_analytics` creates `generation_traces`.
Recorded measurements are bounded metadata only:

- Project ID, user ID, stage and operation, success/failure.
- Start and end UTC timestamps and elapsed wall-clock milliseconds.
- Optional provider/model, token counts, **verified** cost in USD with provenance.
- Small allowlisted non-content metrics (scene count, output seconds, retry, job type).

Currently instrumented:

- Full background research execution (success/failure, elapsed).
- Full BullMQ storyboard Remotion render job duration and retry attempts.
- Synchronous project API operations: Setup, storyboard creation, narration generation/repair, rendering enqueue, export.

**Important accuracy distinctions:**

- A queued render's API time is *enqueue time*, not MP4 execution time.
- A full storyboard generation request can include Gemini/Pexels/TTS; that total cannot be split into provider costs without deeper provider instrumentation.
- Existing research sessions offer historical state but not complete per-model token/cost data.
- GPU inference utilization is NOT currently included.
- Null cost means **unmeasured**, not free. Never label cloud instance price, model-token price lists, or estimated costs as invoice spend.
- Historical stage timings cannot be reconstructed if they were not recorded at the time.

Admin Activity previously read only `ProjectActivity`, even though most creation, research and render events were stored in *different* tables; consequently the page could appear empty despite real user activity. The new feed queries existing durable records and future measurements. It does not backfill invented records or alter old audit logs.

### Security and retention

- No prompts, research text, source URLs, transcript/audio data, raw errors, authorization headers or API keys in traces.
- Traces for a project are deleted when its owner deletes the project.
- Traces owned by the user are deleted during account deletion.
- Admin queries are bounded with 7/30/90-day filtering and capped detail views.
- Database writers are best-effort, so telemetry downtime does not make a successful paid render appear to have failed.
- Future schema revisions should add explicit retention/archival policy and secure export control before large-scale rollout.

## Safe manual validation

**Do not deploy while a Lightsail Remotion job is running.**
The GPU TTS and media containers should not be touched.

After merging the PR and when the Lightsail video render queue is drained:

```bash
cd /opt/apps/voxora
git fetch origin
git pull --ff-only origin main

(cd server && node --check src/services/platformAnalyticsService.js \
  && node --check src/services/platformActivityService.js \
  && node --check src/routes/adminAnalytics.js \
  && node --check src/services/generationTelemetry.js \
  && node --test test/platformOperationsAnalytics.test.js)

(cd frontend && npm run test:unit && npm run build)
```

Before applying the DB migration, take a database backup. Confirm migrations in the repo
and use the **existing** production migration deployment mechanism. The Lightsail
API image's entrypoint runs `prisma migrate deploy` at startup, but the
production database should be backed up beforehand. Do not run `prisma migrate dev`
or `prisma db push` against production.

Then rebuild/recreate only `api` and `frontend` in the existing
`docker-compose.lightsail.yml` project during a quiet window. Other applications,
MySQL/Redis containers and EC2 GPU services are unchanged.

Check:
1. Platform admin sees new Analytics navigation, other users cannot access the routes/API.
2. Admin Activity lists existing project/research/credit records, not an empty table.
3. 7/30/90-day filters and user drilldowns display correct real counts.
4. Start one new research project, generate storyboard/narration and render one MP4.
5. Look for measured durations and statuses, no customer prompt or auth values.
6. Confirm user deletion and project deletion remove related traces.
7. Unknown cost remains `Not measured` until verifiable usage/cost instrumentation exists.

## Phase 2: detailed metering (planned, not delivered)

For accurate **cost per generation** and per-stage timings, each provider
adapter must save a signed or verifiable model request reference, model/version,
actual input/output/billable units, currency, provider pricing effective date,
any cache discount, retries, and provider bill/invoice reconciliation.
Plan instrumentation for:

- Research discovery, reading/extraction, claim verification and synthesis;
  external search queries, successes/failures, token counts and provider request IDs.
- Gemini scene script and rewrite operations, Pexels media search/download.
- Qwen/Kokoro per-scene synthesis, voice cloning enrollment and previews;
  GPU seconds, resident model VRAM, failures, storage and bytes transferred.
- Each Remotion stage: asset acquisition, bundle, composition, frames,
  encoding, mux and storage; queue wait vs execution and CPU/RAM peaks.
- Inference concurrency, queuing, request failures, model hot/cold loads,
  peak VRAM and performance when GPU coordinator is actually enabled.
- Daily/weekly/monthly cost allocation per user, plan, project, provider and
  model; marginal cost per successful minute and render retry waste.
- AWS Cost Explorer or provider invoice connector for infrastructure spend.
  Instance-hour costs should be **allocated** and labeled separately from
  directly billed API cost.
- Alerting, exportable reports, retention and high-volume aggregation.

These items require deeper worker and billing integrations and must not be
presented as already monitored by this Phase 1 PR.
