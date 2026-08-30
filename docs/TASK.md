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

### Implemented first slice

- [x] Add protected `/editor/:id` route
- [x] Add `AdvancedEditorPage.jsx` and responsive editor shell
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

### Implemented audio refinement

- [x] Real waveform visualization for playable narration/music clips
- [x] Waveform loading from authenticated project audio URLs
- [x] Cached decoded waveform peaks for repeat renders within the browser session
- [x] Timeline audio playback synchronized to the editor playhead
- [x] Active audio clip volume follows clip volume metadata
- [x] Fade-in/fade-out affect editor preview playback
- [x] Audio clips pause when the editor is paused
- [x] No-source music clips remain explicitly unavailable until a real media source is attached

### Implemented transition/effect refinement

- [x] Remotion-safe transition preset metadata on video clips
- [x] Fade, slide-left, slide-right, and zoom transition presets for clip in/out edges
- [x] Remotion-safe motion effect metadata on video clips
- [x] Slow zoom-in, slow zoom-out, pan-left, and pan-right effect presets
- [x] Effect intensity control
- [x] Transition duration controls bounded to safe editor ranges
- [x] Live browser preview of selected video transition/effect state
- [x] Transition/effect changes participate in autosave and bounded undo/redo
- [x] Existing timelines without transition/effect metadata remain valid

### Implemented external media integration

- [x] External music search via Jamendo
- [x] External music import into project-owned Media Library
- [x] Editor media picker can attach imported audio to the independent Music track

### Acceptance QA remaining

- [ ] Editor-specific loading/error/empty states QA
- [ ] Verify editor changes never mutate Storyboard source records
- [ ] Full browser QA across supported viewport sizes

**Acceptance:** a user can open a completed project in the standalone Editor,
make/save/refresh edits, and continue using the original Storyboard flow with
its original source data unchanged.

## M12 — Media Library & Upload Pipeline
**Status:** Done

- [x] `project_media` model and migrations
- [x] Authenticated media API and ownership enforcement
- [x] Upload video/image/audio/caption files
- [x] File validation and upload progress/recovery
- [x] Media library search/filter/grid
- [x] Media metadata, thumbnails, and posters
- [x] Editing proxies for large media
- [x] Distinguish user uploads/generated narration/external cache/render intermediates
- [x] Editor media picker
- [x] Orphan cleanup
- [x] `MEDIA_STORAGE_ROOT` storage abstraction

### Implemented M12 media-library foundation

- [x] Project-owned `ProjectMedia` records are separate from Storyboard and editor source state
- [x] Pexels video search can import reusable external assets into the project library
- [x] Uploads stream to project-owned runtime storage instead of being committed to the repository
- [x] Upload size limits are enforced per media type
- [x] Upload MIME types, extensions, and common file signatures are validated server-side
- [x] Uploads use temporary files and cleanup on cancellation/validation/database failures
- [x] Browser reports upload progress and supports cancellation
- [x] Uploaded audiovisual metadata is derived in-browser and persisted server-side
- [x] Browser generates PNG thumbnails/posters for uploaded images and videos
- [x] Uploaded thumbnails are validated, stored under the owning project, and served through authenticated routes
- [x] Removing an uploaded asset removes both its source file and stored thumbnail
- [x] Manual/dry-run orphan cleanup commands remove unreferenced media and stale `.uploading-*` files
- [x] Large uploaded videos can be transcoded to editor-friendly 720px-wide proxies with ffmpeg
- [x] Proxy processing persists `processing` / `ready` / `failed` state and resumes after server restart
- [x] Project media picker can add ready library video/audio assets to the independent editor timeline
- [x] Proxy/original/thumbnail cleanup covers derived media and temporary processing files

**Acceptance:** uploaded/imported project media can be stored, inspected, previewed,
reused by the standalone editor, and safely cleaned without mutating Storyboard
source records.

## M13 — Editor Rendering Integration & Reliability
**Status:** Done — implementation/reliability complete; runtime acceptance QA remains

### Implemented first M13 rendering slice

- [x] Remotion consumes canonical `ProjectEditor.timeline` JSON
- [x] Dedicated `HelixEditorReel` composition is separate from existing `HelixReel`
- [x] Editor video clips render with trim/offset/duration timing
- [x] Editor timeline audio clips render with volume/fade timing
- [x] Caption and overlay clips render from canonical timeline timing
- [x] Transition/effect presets are consumed by the Remotion editor composition
- [x] Uploaded/project media resolves through an authenticated render-media endpoint
- [x] Large-media proxies are preferred by the render-media resolver when available
- [x] Editor render preflight validates timeline and referenced media ownership/state
- [x] Editor render stage telemetry exposes preflight/bundle/composition/rendering/finalizing progress
- [x] Editor render stores version/hash/url/error metadata independently from Storyboard rendering
- [x] Stale-render protection discards a render when the editor changes during rendering
- [x] Retry-safe editor render queue with deterministic version/hash job IDs
- [x] Rendered MP4 is validated with ffprobe for 1080x1920, positive duration, and required audio
- [x] Dedicated editor render progress screen and `/editor/:id/render` workflow
- [x] Existing Storyboard `HelixReel` rendering remains independently available

### M13 automated/reliability work completed

- [x] Browser-style trim/split/reorder timeline fixtures validate against render preflight
- [x] Automated Remotion timing/metadata regression coverage
- [x] Automated caption/audio canonical frame mapping coverage
- [x] Automated authenticated render-media/proxy resolver coverage
- [x] Automated render-route contract coverage
- [x] Automated project/editor render ownership coverage
- [x] Render cancellation for queued storyboard renders
- [x] Render cancellation for queued editor renders
- [x] Retry/backoff for transient storyboard renders
- [x] Retry-aware terminal failure handling for storyboard renders
- [x] Retry-aware terminal failure handling for editor renders
- [x] Worker lock/stall recovery configuration

### Remaining M13 runtime validation

- [ ] Verify trim/split/reorder parity against real editor timelines with browser-generated fixtures
- [ ] Verify uploaded media playback from local storage in Remotion worker
- [ ] Verify caption/audio synchronization against representative projects
- [ ] Full render regression QA with real MP4 output

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
- [x] Authenticated endpoints enforce ownership (automated ownership tests pass)
- [x] Long-running operations expose meaningful stage/progress states
- [x] Refresh/reconnect does not lose persisted editor/render state
- [ ] Rendered media remains playable and correctly timed against real MP4 output
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
- `2026-08-28` — M11 richer editor refinement added drag move/trim, optional Music track, audio fades/volume, caption position/style/emphasis, overlay positioning, and touch-capable timeline interactions in the standalone editor.
- `2026-08-29` — M11 audio refinement added decoded waveform visualization and synchronized editor audio playback without changing Storyboard source records.
- `2026-08-29` — M11 transition/effect refinement added bounded Remotion-safe clip transition metadata and deterministic motion presets with live browser preview, autosave, and undo/redo support.
- `2026-08-29` — M12 media library foundation added project-owned media records, authenticated media APIs, Pexels imports, dependency-free streamed uploads, server validation, browser metadata extraction, PNG image/video thumbnails, authenticated media playback, and orphan cleanup.
- `2026-08-29` — M12 large-media processing added persistent ffmpeg proxies, restart-safe processing, proxy-aware media playback, and project editor media picking without mutating Storyboard source data.
- `2026-08-29` — M13 editor rendering uses a separate `HelixEditorReel` and render queue so canonical `ProjectEditor.timeline` renders independently of the existing Storyboard render pipeline. Render metadata is version/hash scoped and stale renders are discarded.
- `2026-08-30` — M10 rate limiting and production authentication hardening were implemented; remaining M10 work is acceptance verification with multiple real accounts.
- `2026-08-30` — M11 external music integration was implemented through Jamendo search/import and the project Media Library/editor picker.
- `2026-08-30` — M13 reliability work added deterministic regression fixtures, route/ownership tests, safe queued render cancellation, retry/backoff, and retry-aware terminal state handling.
- `2026-08-30` — M13 composition metadata regression test was made line-ending agnostic so Windows CRLF source files do not cause a false test failure.
