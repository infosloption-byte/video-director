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

---

# Next-level platform roadmap

## M10 — Accounts & Authentication
**Status:** In progress

- [x] Users/session/token tables and Prisma migration
- [x] Sign-up/sign-in/sign-out and persistent sessions
- [x] Password reset and email verification flows
- [x] Account/profile settings
- [x] Authenticated workspace routes
- [x] Project/media/render/export ownership protections
- [x] Secure cookie/session configuration and CSRF strategy
- [x] Explicit development auth fallback configuration
- [ ] Replace remaining production `local-user` assumptions
- [ ] Rate limiting / abuse protection for expensive provider operations
- [ ] Final cross-user verification with multiple real accounts

**Acceptance:** authenticated users can access only their own project and media
resources, survive refresh, and sign out safely.

## M10A — Public Discovery, Responsive Navigation & Theme System
**Status:** In progress

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
**Status:** In progress

**Critical rule:** the Advanced Video Editor is a separate optional workspace.
It is NOT another step in the existing:

```text
Signals → Research → Setup → Storyboard → Preview/Finalize
```

Opening/editing in the Advanced Editor must not mutate the existing Storyboard,
narration, timestamps, selected B-roll, or normal Preview/Finalize behavior.

### Implemented first slice

- [x] Add protected `/editor/:id` route
- [x] Add `EditorPage.jsx` and responsive editor shell
- [x] Add dedicated `ProjectEditor` persistence model/migration
- [x] Add `GET /api/projects/:id/editor`
- [x] Add version-aware `PATCH /api/projects/:id/editor`
- [x] Initialize editor timeline from existing Storyboard scenes/assets/narration/captions without modifying them
- [x] Independent 9:16 preview area
- [x] Multi-track timeline: B-roll, Narration, Captions, Overlays
- [x] Clip selection
- [x] Start/duration editing
- [x] Split clip
- [x] Delete editor clip
- [x] Reorder video clips
- [x] Edit caption text
- [x] Edit audio volume
- [x] Add text overlays
- [x] Dirty-state aware autosave
- [x] Save/version indicator
- [x] Add **Edit video** entry from My Research
- [x] Editor access is protected by project ownership/authentication

### Implemented timeline refinement

- [x] Frame-stepped playhead and current-time display
- [x] Play/pause timeline control with 30fps stepping
- [x] Timeline ruler seeking by click
- [x] Playhead shown across ruler and all tracks
- [x] Timeline zoom control
- [x] Snap modes for grid/clip boundaries and frame/clip boundaries
- [x] Start edits use snap behavior
- [x] Visual B-roll replacement using the existing scene asset set
- [x] Preview scrubbing follows the selected video clip
- [x] Bounded undo/redo timeline history
- [x] Keyboard shortcuts for play/pause, frame stepping, split, delete, undo and redo
- [x] Improved mobile/compact editor controls for zoom, snap and playback

### Implemented richer editing refinement

- [x] Drag-based clip moving in the timeline
- [x] Drag-based left/right clip trimming handles
- [x] Optional Music track in the editor
- [x] Add editor-only music clips with independent volume/fade metadata
- [x] Audio volume control with fade-in/fade-out controls
- [x] Caption position controls
- [x] Caption style controls
- [x] Caption emphasis controls
- [x] Overlay position controls
- [x] Touch-capable pointer interactions for timeline move/trim controls
- [x] Mobile-responsive richer inspector and timeline controls

### Remaining M11 work

- [ ] Waveform visualization for narration/music
- [ ] Transition/effect presets safe for Remotion
- [ ] Real audio playback/mixing for editor Music track
- [ ] Optional music asset picker/library integration
- [ ] Editor-specific loading/error/empty states QA
- [ ] Verify editor changes never mutate Storyboard source records
- [ ] Full browser QA across supported viewport sizes

**Acceptance:** a user can open a completed project in the standalone Editor,
make/save/refresh edits, and continue using the original Storyboard flow with
its original source data unchanged.

## M12 — Media Library & Upload Pipeline
**Status:** Not started

- [ ] `project_media` model and migrations
- [ ] Authenticated media API and ownership enforcement
- [ ] Upload video/image/audio/caption files
- [ ] File validation and upload progress/recovery
- [ ] Media library search/filter/grid
- [ ] Media metadata, thumbnails, and posters
- [ ] Editing proxies for large media
- [ ] Distinguish user uploads/generated narration/external cache/render intermediates
- [ ] Editor media picker
- [ ] Orphan cleanup
- [ ] `MEDIA_STORAGE_ROOT` storage abstraction

## M13 — Editor Rendering Integration & Reliability
**Status:** Not started

- [ ] Remotion consumes canonical editor timeline JSON
- [ ] Trim/split/reorder support in editor render
- [ ] Uploaded media support
- [ ] Caption/audio timing synchronization
- [ ] Editor render preflight
- [ ] Preserve current render stage telemetry, elapsed time, and ETA
- [ ] Render version/hash and stale-render protection
- [ ] Retry-safe rendering
- [ ] MP4/audio/duration/9:16 validation
- [ ] Keep storyboard rendering independently available
- [ ] Automated timeline-to-render tests

## M14 — AI Editing Assistant
**Status:** Not started

- [ ] Structured reversible editor operations
- [ ] Tighten scene / hooks / B-roll replacement / pacing suggestions
- [ ] Caption and narration regeneration suggestions
- [ ] Preview before apply
- [ ] One-step undoable application
- [ ] Reasoning display
- [ ] Never mutate source media directly
- [ ] Rate-limit AI edit actions

## M15 — Versions, Templates & Review Workflow
**Status:** Not started

- [ ] Project versions/snapshots
- [ ] Version history/restore
- [ ] Duplicate project
- [ ] Reusable templates
- [ ] Read-only share/review links
- [ ] Optional review comments
- [ ] Autosave conflict detection
- [ ] Activity/history view

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
- [ ] Authenticated endpoints enforce ownership
- [ ] Long-running operations expose meaningful stage/progress states
- [ ] Refresh/reconnect does not lose in-progress task state
- [ ] Rendered media remains playable and correctly timed
- [ ] New migrations are documented and verified against local MySQL
- [ ] Error states are actionable; no silent/infinite spinners
- [ ] Existing Signals → Research → Setup → Storyboard → Preview/Finalize remains regression-tested after next-level changes
- [ ] Opening the Advanced Editor does not change existing Storyboard/narration data

# Recommended execution order

```text
M10 Accounts/Auth
       ↓
M10A Public Discovery + Navigation + Theme
       ↓
M11 Advanced Editor Core (SEPARATE)
       ↓
M12 Media Library
       ↓
M13 Rendering + Reliability
       ↓
M14 AI Editing
       ↓
M15 Versions/Templates/Review
       ↓
M16 Publishing/Analytics

M9 Facebook production → DEFERRED / separate product decision
```

# Decisions log

- `2026-08-28` — Baseline M0–M8 remains complete; M9 Facebook production publishing is deferred.
- `2026-08-28` — Real accounts/authentication and a dedicated advanced video editor are the next-level platform direction.
- `2026-08-28` — **Advanced Video Editor is a standalone feature/workspace, not a new required step in the core creation flow.**
- `2026-08-28` — Editor may reuse current scenes, visuals, narration, word timestamps, captions, and Remotion capabilities as source data but must not mutate the source workflow.
- `2026-08-28` — Editor state is persisted independently from Storyboard data.
- `2026-08-28` — AI editing comes only after deterministic editor behavior and editor rendering are stable.
- `2026-08-28` — Facebook production integration remains excluded from the current implementation cycle.
- `2026-08-28` — Signals remains the public discovery landing page; Direct this Reel is authenticated.
- `2026-08-28` — Shared navigation uses responsive desktop/mobile account actions.
- `2026-08-28` — Persistent user-selectable light/dark theme is part of the frontend shell.
- `2026-08-28` — M11 first slice implemented with a dedicated `ProjectEditor` record, canonical timeline JSON, protected editor route, autosave, and non-destructive editing operations.
- `2026-08-28` — M11 timeline refinement added playhead playback/seeking, timeline zoom, snap modes, B-roll replacement, preview scrubbing, bounded undo/redo, and keyboard controls without changing Storyboard source data.
- `2026-08-28` — M11 richer editing refinement added drag move/trim, optional Music track, audio fades/volume, caption position/style/emphasis, overlay positioning, and touch-capable timeline interactions in the standalone editor.
