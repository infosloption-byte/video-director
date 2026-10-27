# Voxora AI Pipeline — Admin Sandbox & Rollout Lock (Phase 1B)

This increment is intentionally **ADMIN ONLY**. Do not modify or reroute the working customer research, storyboard, visual asset, TTS, Remotion or billing workflows as part of this release.

## What is implemented

- `/admin/pipelines`: configure pipeline drafts, including future provider adapters that are marked `planned`. These drafts can be saved and inspected but cannot be published while relying on unfinished adapters.
- `Run admin sandbox`: deterministic schema/contract simulation for all nine ordered stages; each run records per-stage results and configuration warnings.
- Persistent sandbox test history per pipeline version; reports have a canonical SHA-256 fingerprint. After edits, previous reports appear **stale**.
- Publishing a new pipeline version requires a passing sandbox test for its **current saved definition**.
- **Workspace rollout lock:** with `PIPELINE_WORKSPACE_ROLLOUT` unset (recommended), the admin API refuses activation of every non-Classic pipeline version. This prevents inadvertent changes to new-project assignments from PR #65. The database's existing published `voxora-legacy-v1` remains active.
- Tests are isolated: the sandbox **never contacts Gemini, Pexels, TTS, Grok or any GPU**, never renders video, never reads customer project data, never reserves billing credits, and never modifies projects. `actualProviderCalls=0` and `workspaceMutations=0` are explicit report fields.

**A passing contract simulation is NOT a successful live provider test.** It verifies stage order, adapter capability compatibility, required simulated input/output keys, availability gating, and current configuration warnings. A separate admin-only live provider integration test phase is needed before production rollout.

## Storage

Migration: `20261027210000_ai_pipeline_sandbox_tests`

New `ai_pipeline_sandbox_tests` table stores:
- version ID, administrator user ID, definition fingerprint
- passed/fail outcome, timestamp and JSON stage reports

No database changes to `projects` or render credits in this PR.

## Routes

Protected by existing `requireAuth` and `requirePlatformAdmin`:
- `POST /api/platform-admin/pipelines/:pipelineId/versions/:versionId/sandbox-tests`: run and persist an isolated simulation **on the saved version**.
- `GET /api/platform-admin/pipelines/:pipelineId/versions/:versionId/sandbox-tests`: list up to 15 recent test reports, with `current` flag based on a fingerprint.
- `PUT /api/platform-admin/pipelines/:pipelineId/versions/:versionId`: drafts accept `planned` adapter references for design, not for live execution.
- `POST /api/platform-admin/pipelines/:pipelineId/versions/:versionId/publish`: rejects untested/stale/invalid/unimplemented configurations.
- `POST /api/platform-admin/pipelines/:pipelineId/versions/:versionId/activate`: rejects non-Classic version while rollout flag is not explicitly `enabled`.

## Admin testing procedure after review and staging rollout

1. Back up the MySQL database, apply the migration to a test/staging environment, deploy API and frontend. Do **not** set `PIPELINE_WORKSPACE_ROLLOUT=enabled`.
2. Sign in as an administrator and open `/admin/pipelines`. Select published **Voxora Classic v1**.
3. Click **Run admin sandbox**. Expect 9/9 passed, 0 external API calls and 0 workspace mutations; missing API keys may appear as warnings.
4. Create a named draft pipeline. Save and run the sandbox. After a pass, Publish becomes available.
5. Publish the draft; verify that **Activate globally** is blocked for non-Classic versions and the global active pointer still references Classic v1.
6. Create another draft. Select planned Grok Storyboard or Grok Imagine. Save successfully. Test run should fail the corresponding stage and publishing must be blocked.
7. Edit that draft back to the supported existing adapter, save and rerun the sandbox. The previous test must show stale; only a new passing run should allow publishing.
8. Confirm admin test history appears and no customer video/research/voice/media or subscription records changed.
9. Verify a normal customer receives HTTP 403 for all admin sandbox endpoints.

### Suggested technical checks

```sh
cd server
npx prisma validate
npm run prisma:generate
npm test

cd ../frontend
npm run lint
npm run test:unit
npm run build
```

Run `npx prisma migrate deploy` only in a backed-up, intended environment. On Voxora Lightsail, the existing API Docker entrypoint performs migration deployment automatically at API startup. Never remove Docker database volumes.

After deployment, inspect the active pipeline pointer:

```sql
SELECT id, version_id FROM active_ai_pipeline;
SELECT id, pipeline_version_id, actor_user_id, passed, created_at
FROM ai_pipeline_sandbox_tests ORDER BY created_at DESC LIMIT 10;
```

Expected active pointer: `global → voxora-legacy-v1`. No admin sandbox requests generate video or consume billing credits.

## Production rollout deliberately deferred

Before permitting actual pipelines to control workspaces, add:
1. Admin-only **live** tests of provider credentials, connectivity, structured outputs, media decoding and limits.
2. Actual task adapters and normalized outputs per provider, including Grok and dedicated GPU.
3. Staged research/storyboard/media/TTS execution with version-pinned dispatch and retry/idempotency tests.
4. Explicit operator approval and measured costs, privacy safeguards and safe rollback.

Do not turn on `PIPELINE_WORKSPACE_ROLLOUT` in production until these are complete.
