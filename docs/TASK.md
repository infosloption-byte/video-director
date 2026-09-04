# Helix — Task & Milestone Tracker

> **Living tracker.** Update this file as work lands. `BUILD_PLAN.md` is the
> source of truth for product/architecture changes; reflect approved changes
> here without allowing the two documents to drift.

**Status legend:** `Not started` · `In progress` · `Blocked` · `Done` · `Deferred`

---

## Baseline — M0 through M8
**Status:** Done

M0–M8 are complete: backend wiring, signal feed, search, research, guided
setup, storyboard/live preview, narration/captions, Remotion rendering, and
Finalize/export.

## M9 — Direct-to-Facebook publish
**Status:** Deferred (development integration only)

- [x] Meta Graph API development integration exists
- [x] Publish endpoint exists
- [x] Finalize UI gate exists
- [ ] Production OAuth / multi-user publishing
- [ ] Meta App Review / Business Verification work
- [ ] Final publishing UX

**Decision:** keep the development integration, but do not expand M9 into
production work until the product direction for publishing is decided.

## M10 — Accounts & Authentication
**Status:** Done — implementation complete; acceptance QA remains

- [x] Users/session/token tables and Prisma migration
- [x] Sign-up/sign-in/sign-out and persistent sessions
- [x] Password reset and email verification flows
- [x] Account/profile settings
- [x] Authenticated workspace routes
- [x] Project/media/render/export ownership protections
- [x] Secure cookie/session configuration and CSRF strategy
- [x] Explicit development auth fallback configuration
- [x] Production builds require authentication; `local-user` is development-only
- [x] Rate limiting / abuse protection for expensive provider operations
- [ ] Final cross-user verification with multiple real accounts

**Acceptance:** authenticated users can access only their own project and media
resources, survive refresh, and sign out safely.

## M10A — Public Discovery, Responsive Navigation & Theme System
**Status:** Done — implementation complete; browser QA remains

- [x] Public Signals landing
- [x] Public search/filter
- [x] Auth-gated Direct this Reel
- [x] Sign in / Create account navigation
- [x] Authenticated user greeting and My Research navigation
- [x] Three-dot account menu
- [x] Mobile navigation
- [x] Persistent light/dark theme
- [x] Theme toggle on desktop/mobile navigation
- [x] Refreshed Sign-in UX/UI
- [x] Refreshed Sign-up UX/UI
- [x] Safe sign-in/sign-up redirects
- [ ] Browser QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440
- [ ] Verify auth flow in production-auth mode
- [ ] Audit remaining page-specific hard-coded colors for light theme coverage

## M11 — Advanced Video Editor Core — **Separate Feature / Workspace**
**Status:** Done — implementation complete; acceptance QA remains

**Critical rule:** the Advanced Video Editor is a separate optional workspace.
It is NOT another step in the existing:

```text
Signals → Research → Setup → Storyboard → Preview/Finalize
```

Opening/editing in the Advanced Editor must not mutate the existing Storyboard,
narration, timestamps, selected B-roll, or normal Preview/Finalize behavior.

### Implemented

- [x] Protected `/editor/:id` route and responsive editor shell
- [x] Dedicated `ProjectEditor` persistence model/migration
- [x] Version-aware editor GET/PATCH APIs
- [x] Non-destructive initialization from Storyboard scenes/assets/narration/captions
- [x] Independent 9:16 preview and multi-track timeline
- [x] Select/move/trim/split/delete/reorder editor clips
- [x] Caption text/style/position/emphasis controls
- [x] Overlay text/position controls
- [x] Music track with volume/fade metadata
- [x] Waveform loading and synchronized browser audio playback
- [x] Timeline zoom, ruler seeking, snapping, scrubbing, keyboard shortcuts
- [x] Bounded undo/redo and dirty-state autosave/version indicator
- [x] Touch-capable timeline move/trim controls and responsive inspector
- [x] Remotion-safe transition/effect metadata and live browser preview
- [x] External Jamendo music search/import and editor media picker integration
- [x] My Research “Edit video” entry
- [x] Editor access protected by project ownership/authentication

### Acceptance QA remaining

- [ ] Editor-specific loading/error/empty states QA
- [ ] Verify editor changes never mutate Storyboard source records
- [ ] Full browser QA across supported viewport sizes

## M12 — Media Library & Upload Pipeline
**Status:** Done — implementation complete; runtime acceptance QA remains

- [x] Project-owned `ProjectMedia` model and authenticated media APIs
- [x] Upload video/image/audio/caption files with validation and progress
- [x] Project-owned runtime storage and cleanup
- [x] Media search/filter/grid, metadata, thumbnails/posters
- [x] Pexels imports into the project library
- [x] Large-video 720px proxy processing with persistent state and restart recovery
- [x] Editor media picker for ready project video/audio
- [x] Orphan/temporary/derived-media cleanup
- [x] Ownership enforcement on project media
- [ ] Runtime validation with representative uploads across supported media types

**Acceptance:** uploaded/imported project media can be stored, inspected, previewed,
reused by the standalone editor, and safely cleaned without mutating Storyboard
source records.

## M13 — Editor Rendering Integration & Reliability
**Status:** Done — implementation/reliability complete; runtime acceptance QA remains

### Implemented

- [x] Remotion consumes canonical `ProjectEditor.timeline`
- [x] Dedicated `HelixEditorReel` remains separate from Storyboard `HelixReel`
- [x] Video trim/offset/duration timing
- [x] Timeline audio volume/fade timing
- [x] Caption/overlay timing
- [x] Transition/effect metadata consumption
- [x] Authenticated render-media resolution with proxy preference
- [x] Editor render preflight, ownership checks, and media-state validation
- [x] Render stage telemetry and progress workflow
- [x] Version/hash/url/error metadata and stale-render protection
- [x] Deterministic retry-safe editor render queue
- [x] ffprobe validation for 1080x1920, positive duration, and required audio
- [x] Dedicated `/editor/:id/render` workflow
- [x] Automated timing, metadata, resolver, route, ownership, cancellation and retry coverage
- [x] Worker lock/stall recovery configuration

### Runtime validation remaining

- [ ] Verify trim/split/reorder parity against real browser-generated editor timelines
- [ ] Verify uploaded/local media playback in the Remotion worker
- [ ] Verify caption/audio synchronization against representative projects
- [ ] Full render regression QA with real MP4 output

## M14 — AI Editing Assistant
**Status:** In progress — implementation has started; acceptance scope remains

### Implemented so far

- [x] AI editor assistant workspace foundation
- [x] AI editor assistant backend route
- [x] AI assistant lint cleanup and effect handling
- [x] Non-destructive narration suggestions on the locked narration track
- [x] Suggestions scoped specifically to the narration track
- [x] Locked-track handling for suggestion flows
- [x] Deterministic overlay IDs for generated editor operations

### Remaining M14 work

- [ ] Structured reversible editor operations for supported AI actions
- [ ] Tighten scene / hook / B-roll replacement / pacing suggestions
- [ ] Caption and narration regeneration suggestions with explicit preview
- [ ] One-step undoable application of accepted suggestions
- [ ] Clear reasoning/explanation display for proposed edits
- [ ] Enforce source-media immutability for all AI operations
- [ ] Rate-limit and abuse-protect AI edit actions
- [ ] Automated acceptance coverage for AI suggestion/apply flows
- [ ] Real browser QA for AI assistant interactions

## M15 — Versions, Templates & Review Workflow
**Status:** In progress — implementation substantially complete; product UX and runtime QA remain

### Implemented backend/API

- [x] Project version snapshots
- [x] Version history listing
- [x] Version restore
- [x] Optimistic editor-version conflict detection with `409` protection
- [x] Project duplication
- [x] Scene/asset copying during duplication
- [x] Timeline scene/asset reference remapping during duplication
- [x] Reusable project templates
- [x] Template ownership enforcement
- [x] Public read-only review links
- [x] Review-link expiry
- [x] Review-link revocation
- [x] Public reviewer comments
- [x] Comment resolution
- [x] Project activity/history records
- [x] Project ownership enforcement across project-scoped productivity APIs
- [x] Acceptance tests covering the M15 route surface and ownership rules

### Implemented UI

- [x] Project productivity workspace
- [x] Snapshot creation and version history display
- [x] Version restore action
- [x] Project duplication action
- [x] Template creation and listing
- [x] Review-link creation and display
- [x] Activity/history display

### M15 remaining product work

- [ ] Add complete review-link management UX, including revoke control and clear status
- [ ] Add reviewer-facing public review page/browser flow verification
- [ ] Add reviewer comment/resolution UX validation end-to-end
- [ ] Add template apply/use workflow to projects
- [ ] Add stronger template management UX (inspect/delete/apply)
- [ ] Verify duplication of all relevant project/editor/media relationships with real data
- [ ] Verify version restore preserves editor consistency and creates the expected version transition
- [ ] Verify conflict behavior with two concurrent editor sessions
- [ ] Expand automated integration coverage beyond source-pattern acceptance tests
- [ ] Full browser/mobile QA for productivity and review workflows

## M16 — Platform Publishing Abstraction & Analytics
**Status:** Not started

- [ ] Platform-neutral publish manifest
- [ ] Publish job/history model
- [ ] Generic destination adapter
- [ ] Publish status/retry handling
- [ ] Export-ready metadata
- [ ] Basic analytics storage
- [ ] Publishing history in My Research

**Explicit exclusion:** Facebook production OAuth and multi-user Meta publishing
remain deferred under M9 until separately approved.

# Cross-milestone quality gates

- [ ] `npm run lint` → zero warnings and zero errors
- [ ] `npm run build` succeeds
- [ ] Responsive QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440
- [ ] No horizontal overflow or inaccessible controls
- [ ] Destructive actions use the modern Helix confirmation dialog
- [ ] No generated content committed under `server/storage/`
- [x] Authenticated endpoints enforce ownership (automated ownership tests pass)
- [x] Long-running operations expose meaningful stage/progress states
- [x] Refresh/reconnect does not lose persisted editor/render state
- [ ] Rendered media remains playable and correctly timed against real MP4 output
- [ ] New migrations are documented and verified against local MySQL
- [ ] Error states are actionable; no silent/infinite spinners
- [ ] Existing Signals → Research → Setup → Storyboard → Preview/Finalize remains regression-tested after next-level changes
- [ ] Opening the Advanced Editor does not change existing Storyboard/narration data
- [ ] M14 AI assistant flow is regression-tested without source mutation
- [ ] M15 review/version/template workflows are regression-tested end-to-end

# Current execution focus

```text
1. Finish M14 deterministic AI editing behavior + acceptance coverage
                         ↓
2. Finish M15 product UX + end-to-end review/version/template validation
                         ↓
3. Complete M13 real-media render/runtime validation
                         ↓
4. Run full responsive/auth/regression browser QA
                         ↓
5. Synchronize BUILD_PLAN.md and remaining QA documentation
                         ↓
6. Start M16 Publishing/Analytics

M9 Facebook production → DEFERRED / separate product decision
```

# Decisions log

- `2026-08-28` — Baseline M0–M8 remains complete; M9 Facebook production publishing is deferred.
- `2026-08-28` — Real accounts/authentication and a dedicated advanced video editor are the next-level platform direction.
- `2026-08-28` — **Advanced Video Editor is a standalone feature/workspace, not a new required step in the core creation flow.**
- `2026-08-28` — Editor may reuse current scenes, visuals, narration, word timestamps, captions, and Remotion capabilities as source data but must not mutate the source workflow.
- `2026-08-28` — Editor state is persisted independently from Storyboard data.
- `2026-08-28` — Signals remains the public discovery landing page; Direct this Reel is authenticated.
- `2026-08-28` — Shared navigation uses responsive desktop/mobile account actions.
- `2026-08-28` — Persistent user-selectable light/dark theme is part of the frontend shell.
- `2026-08-28` — M11 first slice implemented with a dedicated `ProjectEditor` record, canonical timeline JSON, protected editor route, autosave, and non-destructive editing operations.
- `2026-08-29` — M12 media library foundation and large-media proxy processing were implemented with project ownership and source isolation.
- `2026-08-29` — M13 editor rendering/reliability implementation was completed; real-media runtime validation remains.
- `2026-08-30` — M14 AI editor assistant workspace and route were implemented; subsequent fixes scoped narration suggestions, handled locked tracks, and stabilized lint/effect behavior.
- `2026-08-30` — M15 versions, duplication, templates, review links, comments, conflict protection, and activity history were implemented with authenticated ownership checks.
- `2026-08-30` — M15 acceptance coverage was added for route presence, snapshot/restore behavior, duplication/remapping, template validation, review-link lifecycle, activity logging, and project ownership checks.
- `2026-09-05` — Tracker corrected to reflect the actual repository state: M14 is **In progress**, M15 is **In progress**, M13/M12 remain implementation-complete with runtime QA outstanding, and M16 remains not started.
