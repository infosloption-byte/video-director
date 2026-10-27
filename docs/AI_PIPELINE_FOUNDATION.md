# Voxora AI Pipeline Foundation — Phase 1

## Status and scope
This change is the FIRST increment of configurable production pipelines. Existing Gemini/Pexels/self-hosted TTS/Remotion calls are intentionally **not rerouted**. The active pipeline is persisted and assigned to new projects, but custom adapter execution and stage-level job orchestration are **Phase 2+** work. Never describe Grok/GPU as integrated by this change.

## UI
Use `/admin/pipelines` with a verified `platform_admin` account. The admin can:
- View installed/available versus planned/disallowed adapters.
- Create multiple pipeline definitions; keep one draft per pipeline at a time.
- Choose compatible stage adapters, validate, save drafts and publish immutable versions.
- Activate one published version globally, with an audited before/after record.
- Create a new draft revision from the most recent published version; published snapshots cannot be overwritten.
- Review validation warnings for missing environment credentials (this checks **configuration**, not actual provider health).

The stage order is fixed and key security/verification steps cannot be bypassed. Existing TTS is represented by the **customer-selected voice adapter**, respecting preset or consented clone choices.

## Database design
- `ai_pipelines`: name and description.
- `ai_pipeline_versions`: immutable published JSON definitions and append-only revisions.
- `active_ai_pipeline`: a single row with primary key `global` and one version FK. Updating this pointer in a transaction prevents two active pipelines.
- `projects.pipeline_version_id`: optional FK pinned when a new signal or conversational research project is created. NULL on older projects means the existing legacy flow.
- `admin_audit_logs`: existing audit infrastructure reused for pipeline events.

Migration `20261027180000_ai_pipeline_foundation` seeds the already-working **Voxora Classic v1** pipeline and activates it. No old projects are modified.

## Current capability catalog
1. Topic selection → user workspace.
2. Evidence search → Semantic Scholar / Tavily / Brave cascade.
3. Research synthesis → existing Gemini.
4. Mandatory evidence verification → Voxora service.
5. Storyboard planning → existing Gemini.
6. Visuals → Pexels stock footage.
7. Speech → existing selected TTS preset / clone gateway.
8. Rendering → Remotion + FFmpeg.
9. Export → Voxora.

Grok AI, Grok Imagine, Grok TTS and dedicated Wan/Qwen GPU workers appear as planned, unavailable entries. The backend does not permit publishing pipelines using those adapters. Later work will provide adapter implementations, capabilities, request/response contracts and tests, then mark them selectable.

## API
All under existing `/api/platform-admin/pipelines` router, protected by `requireAuth` AND `requirePlatformAdmin` in `app.js`.

- `GET /`: all pipelines, versions and active version.
- `GET /catalog`: known stages/adapters, with availability.
- `POST /`: create a named pipeline with v1 draft cloned from the working classic definition.
- `POST /:pipelineId/drafts`: create new draft revision after latest published revision.
- `PUT /:pipelineId/versions/:versionId`: update **draft only**.
- `POST /:pipelineId/versions/:versionId/validate`: validate proposed definition; no side effects.
- `POST /:pipelineId/versions/:versionId/publish`: validate and permanently publish draft.
- `POST /:pipelineId/versions/:versionId/activate`: atomically activate published version and audit.

No provider keys or account secrets are returned.

## Deploy and verify
1. Do not deploy straight to production without a database backup or staging test.
2. In a Node/MySQL environment, run `cd server && npx prisma validate && npm run prisma:generate && npm test`.
3. Run `cd frontend && npm run lint && npm run test:unit && npm run build`.
4. Apply migration to a staging MySQL DB. Verify there is **one** row in `active_ai_pipeline` pointing to `voxora-legacy-v1`.
5. Verify a customer receives HTTP 403 for admin routes, and an unverified/anonymous visitor is rejected.
6. Create a draft pipeline, validate, publish and activate it. Check the audit log and pointer.
7. Create both a suggested-signal project and a conversational-research project. Confirm each stores the active `pipeline_version_id`.
8. Switch back to Voxora Classic; check existing research/storyboard/Pexels/TTS/Remotion flows and billing are unchanged.
9. Do not attempt to run Grok or GPU models through this phase.

## Next batches
- Phase 2: per-project pipeline resolver and normalized LLM/source/TTS adapters at existing call sites; split combined scene generation into tracked tasks and verify project snapshot immutability.
- Phase 3: Grok cloud adapters, video generation, artifact storage and queues.
- Phase 4: self-hosted GPU providers, model health, per-stage costs, fallback permissions and execution dashboards.
