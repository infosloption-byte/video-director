# Helix — Task & Milestone Tracker

> **Living tracker.** Update this file as work lands. `BUILD_PLAN.md` is the
> source of truth for product/architecture changes; reflect approved changes
> here without allowing the two documents to drift.

**Status legend:** `Not started` · `In progress` · `Blocked` · `Done` · `Deferred`

---

## Baseline — M0 through M8
**Status:** Done

M0–M8 are complete in the current baseline: backend wiring, suggested feed,
search, research, guided setup, storyboard/live preview, narration/captions,
Remotion rendering, and Finalize/export.

Existing implementation notes and historical hardening decisions remain
captured in repository history. The current release-quality checks are also
recorded in `docs/FINAL_QA.md`.

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

Goal: turn the current local-user application into a secure multi-user
workspace without breaking the existing research/video workflow.

- [x] Add `users` table with unique email, display name, password hash, verification state, timestamps
- [x] Add `auth_sessions` table with hashed session tokens and expiry
- [x] Sign-up page with validation and useful error states
- [x] Sign-in page with persistent secure session
- [x] Sign-out
- [x] `GET /api/auth/me`
- [x] Password-reset request + reset flow
- [x] Email verification flow with configurable delivery adapter
- [x] Account/profile settings
- [ ] Replace all production `local-user` assumptions with authenticated user identity
- [x] Authorize project, media, export, render, narration, storyboard, and editor endpoints by owner
- [x] Protect authenticated workspace routes in the frontend
- [ ] Rate limiting / abuse protection for Gemini, search, TTS, uploads, and render operations
- [x] Secure cookie/session configuration and CSRF strategy for authenticated browser requests
- [x] Auth migration keeps existing local-development workflow available behind explicit dev configuration
- [ ] Final cross-user verification with real multiple accounts

**Acceptance:** a user can create an account, sign in, refresh the browser,
see only their own projects, and safely sign out; another user cannot access
those project/media resources by changing an ID in the URL.

## M10A — Public Discovery Landing & Responsive Navigation
**Status:** In progress

Goal: make Signals the public, conversion-oriented entry point while keeping
content discovery open and all project-creating actions authenticated.

- [x] Signals page remains publicly viewable without login
- [x] Public visitors can search signals
- [x] Public visitors can filter signals by category
- [x] Landing hero explains the product and points visitors into signals
- [x] Signed-out visitors can see `Sign in` and `Create account` in the top bar
- [x] `Direct this Reel` requires authentication before creating a project
- [x] Auth prompt provides clear Sign in / Create account choices
- [x] Successful authentication returns the user to the public Signals page
- [x] Authenticated header shows user identity and workspace access
- [x] `My Research` navigation is available from authenticated pages
- [x] Three-dot account/navigation menu with Account, My Research, and Sign out
- [x] Responsive mobile navigation menu
- [x] Mobile header avoids horizontal overflow and preserves key actions
- [ ] Browser QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440
- [ ] Verify auth prompt + redirect flow in production-auth mode

**Acceptance:** an anonymous visitor can browse/search/filter Signals and
understand the product without an account; attempting to direct a Reel asks
the visitor to sign in or create an account; after successful auth, Helix
returns to Signals. Authenticated users see their name, My Research, and a
responsive navigation menu.

## M11 — Advanced Video Editor Core — **Separate Feature / Workspace**
**Status:** Not started

Goal: add a dedicated professional editing workspace that can reuse the
existing Storyboard, narration, captions, visual assets and Remotion
capabilities **without changing the existing Signals → Research → Setup →
Storyboard → Preview/Finalize flow**.

**Critical product rule:** the Advanced Video Editor is optional and
non-destructive. Opening the editor must not mutate the existing storyboard,
narration, timestamps, selected B-roll, or normal Preview/Finalize behavior.

- [ ] Add `EditorPage.jsx` and a clear entry point such as **Edit video** from an existing completed project
- [ ] Opening a project in Editor creates/opens an independent editor timeline/version
- [ ] Keep original Storyboard scene data as the baseline/source for the normal workflow
- [ ] Add 9:16 editor workspace with preview, timeline, toolbar, and inspector
- [ ] Create canonical editor timeline JSON/EDL model
- [ ] Video track for scene/B-roll clips
- [ ] Narration/audio track with waveform-ready metadata
- [ ] Caption/text track with editable timing/content
- [ ] Overlay track for text/graphics
- [ ] Optional music track
- [ ] Frame-accurate playhead and current-time display
- [ ] Timeline zoom and horizontal scrolling
- [ ] Snap to scene boundaries/playhead/grid
- [ ] Select, move, trim, split, duplicate, delete, and reorder clips
- [ ] Replace selected B-roll using existing scene assets
- [ ] Adjust clip duration without mutating original media files or Storyboard data
- [ ] Add editor-only media references without altering existing Storyboard assets
- [ ] Caption wording/timing/style/position/emphasis controls
- [ ] Audio volume, mute, basic fades, and clip replacement controls
- [ ] Basic transition presets/effects that are safe for Remotion rendering
- [ ] Keyboard shortcuts for play/pause, split, delete, undo, redo, frame stepping
- [ ] Undo/redo stack with bounded history
- [ ] Autosave with debounce and dirty-state indicator
- [ ] Restore editor state after refresh
- [ ] Preview and later editor-rendering both use the same canonical editor timeline
- [ ] No implicit "apply editor changes back to Storyboard" behavior

**Acceptance:** a user can open an existing completed storyboard in the
separate Editor, make edits, save and refresh without losing them, while the
original Storyboard/narration flow remains unchanged. Editor changes are
visible only in the Editor until a future explicit product decision adds an
apply/sync operation.

## M12 — Media Library & Upload Pipeline
**Status:** Not started

Goal: make user-owned media a first-class reusable asset layer for the editor.

- [ ] Add `project_media` model and migrations
- [ ] Add `/media` API with authenticated ownership
- [ ] Upload video/image/audio/caption files
- [ ] File-type and file-size validation
- [ ] Upload progress UI and resumable/error recovery where practical
- [ ] Media library grid/list with search and filters
- [ ] Metadata: filename, type, size, duration, dimensions, source, created date
- [ ] Generate thumbnails/posters for visual media
- [ ] Generate lightweight editing proxies when source media is large
- [ ] Distinguish user uploads, generated narration, downloaded B-roll, and derived render intermediates
- [ ] Add media picker to Editor
- [ ] Prevent cross-user media access
- [ ] Cleanup orphaned uploads/cached B-roll/render intermediates
- [ ] Storage abstraction behind `MEDIA_STORAGE_ROOT` so local filesystem can later become object storage

**Acceptance:** users can upload their own media, find it later from the
library, add it to an editor timeline, and safely delete it without affecting
another user's content.

## M13 — Editor Rendering Integration & Reliability
**Status:** Not started

Goal: make the separate editor timeline the source of truth for editor
renders while preserving the existing storyboard render path.

- [ ] Extend Remotion composition to consume canonical editor timeline JSON
- [ ] Support editor trim/split/reorder operations in render output
- [ ] Support selected clip replacement and uploaded media
- [ ] Preserve natural narration speed unless the editor explicitly requests a supported speed change
- [ ] Synchronize captions with edited audio/timeline positions
- [ ] Add render preflight for unsupported/missing editor assets
- [ ] Keep current detailed render stages, nested B-roll progress, elapsed time, and ETA
- [ ] Add render version/hash so the UI can identify which editor state produced an MP4
- [ ] Prevent stale renders from being shown as the current editor version
- [ ] Add retry-safe rendering for transient worker/provider failures
- [ ] Verify produced MP4 duration, audio presence, playable H.264/AAC output, and 9:16 dimensions
- [ ] Keep storyboard rendering independently available
- [ ] Add automated backend tests for timeline-to-render conversion

**Acceptance:** changing the Editor timeline changes only the editor render;
the existing storyboard render/source remains untouched, and the rendered
video matches the saved editor timeline exactly.

## M14 — AI Editing Assistant
**Status:** Not started

Goal: use Gemini to suggest reversible edits to the independent editor model,
never directly rewrite the base Storyboard records.

- [ ] Add structured editor-operation schema
- [ ] `Tighten this scene`
- [ ] `Generate 3 hooks`
- [ ] `Swap weak B-roll`
- [ ] `Improve pacing`
- [ ] `Re-time / regenerate captions`
- [ ] `Regenerate narration after text edits`
- [ ] Suggest word emphasis/caption styling
- [ ] Suggest dead-space removal and scene reordering
- [ ] Preview proposed operations before applying
- [ ] Apply changes as one undoable transaction
- [ ] Show reasoning for AI suggestions
- [ ] Never directly delete/overwrite source media
- [ ] Rate-limit AI editing actions

**Acceptance:** every AI edit is previewable, explainable, reversible, and
stored as normal editor operations.

## M15 — Versions, Templates & Review Workflow
**Status:** Not started

Goal: make Helix useful as a repeatable creative workspace instead of a
one-shot generator.

- [ ] `project_versions` persistence
- [ ] Named/manual snapshots and automatic important-state snapshots
- [ ] Version history panel
- [ ] Restore a previous version
- [ ] Duplicate project
- [ ] Save project as reusable template
- [ ] Start a new project from a template
- [ ] Read-only share/review links
- [ ] Review comments/notes on scenes or timeline regions (optional first pass)
- [ ] Autosave conflict detection using version numbers / optimistic concurrency
- [ ] Activity/history view for major project changes

**Acceptance:** users can safely experiment, restore earlier work, and reuse a
successful project structure.

## M16 — Platform Publishing Abstraction & Analytics
**Status:** Not started

Goal: separate publishing from editor internals and make delivery extensible.

- [ ] Create platform-neutral publish manifest from finalized project
- [ ] Publish job/history model separate from render jobs
- [ ] Generic destination adapter interface
- [ ] Publish status, retries, and failure reasons
- [ ] Export-ready metadata package per project
- [ ] Basic analytics storage for platforms that provide performance metadata
- [ ] Publishing activity/history in My Research

**Explicit exclusion:** Facebook production OAuth and multi-user Meta
publishing remain deferred under M9 until separately approved.

---

# Cross-milestone quality gates

These apply to every future milestone before marking it Done:

- [ ] `npm run lint` → zero warnings and zero errors
- [ ] `npm run build` succeeds
- [ ] Responsive QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440
- [ ] No horizontal overflow or inaccessible controls
- [ ] Destructive actions use the modern Helix confirmation dialog
- [ ] No generated content committed under `server/storage/`
- [ ] Authenticated endpoints enforce ownership once M10 is active
- [ ] Long-running operations expose meaningful stage/progress states
- [ ] Refresh/reconnect does not lose an in-progress task state
- [ ] Rendered media remains playable and correctly timed
- [ ] New migrations are documented and verified against local MySQL
- [ ] Error states are actionable; no silent/infinite spinners
- [ ] Existing Signals → Research → Setup → Storyboard → Preview/Finalize flow remains regression-tested after Editor changes
- [ ] Opening the Advanced Editor does not change existing Storyboard/narration data

# Recommended execution order

```text
M10 Accounts/Auth
       ↓
M10A Public Discovery + Responsive Navigation
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

- `2026-08-28` — Baseline M0–M8 remains complete; M9 Facebook publishing is intentionally deferred beyond development integration.
- `2026-08-28` — Approved next-level direction: add real user accounts/authentication and a dedicated advanced video editor on top of the existing Storyboard/narration/render capabilities.
- `2026-08-28` — **Critical separation decision:** Advanced Video Editor is a standalone feature/workspace, not a replacement for or additional required step in Signals → Research → Setup → Storyboard → Preview/Finalize.
- `2026-08-28` — Editor may reuse current scenes, selected visuals, generated narration, word timestamps, captions, and Remotion capabilities as source data, but opening the editor must not mutate those source records.
- `2026-08-28` — Editor edits are stored independently in an editor timeline/version model; there is no implicit apply-back-to-Storyboard action.
- `2026-08-28` — The existing core workflow must remain operational with zero editor data, and every next-level milestone must preserve that compatibility.
- `2026-08-28` — Add reusable media-library layer before expanding editor/AI functionality so user uploads and generated/external assets share ownership and lifecycle rules.
- `2026-08-28` — AI editing is planned after the deterministic editor and render integration are stable; AI returns reversible editor operations instead of directly mutating rendered media.
- `2026-08-28` — Facebook production integration remains excluded from the next implementation cycle pending a separate publishing/product decision.
- `2026-08-28` — Approved public product-shell direction: Signals is the anonymous landing/discovery page; browsing, searching, and filtering are public, while Direct this Reel is an authenticated action.
- `2026-08-28` — Signed-out users receive an explicit Sign in / Create account choice before a project is created; successful authentication returns them to Signals.
- `2026-08-28` — Shared navigation must expose account/workspace actions without overcrowding desktop layouts and must collapse into a mobile menu at narrow widths.
