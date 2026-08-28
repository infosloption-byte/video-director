# Helix — Full Platform & Build Plan (React + Node.js + MySQL)

> **Living document.** This is the single source of truth for what the
> platform does and how it's built. When something changes mid-development,
> update this file first, then reflect the approved change in `TASK.md`.

---

## 1. The platform flow

The existing core creation flow remains unchanged:

```text
Signals → Research → Guided Setup → Storyboard → Finalize & Export
```

Search is the only content-discovery input that requires typing; all downstream
creative choices are selection-driven.

### Stage A — Public Signal Discovery

The Signals page is the public landing/discovery experience.

- Anonymous visitors may view suggested signals without signing in.
- Anonymous visitors may search the signal feed and filter it by category.
- The landing hero explains the product and directs visitors into the signal feed.
- The top bar shows **Sign in** and **Create account** for signed-out visitors.
- Clicking **Direct this Reel** is an authenticated action; it must never create a project for an anonymous visitor.
- The signed-out Direct action presents a modern Sign in / Create account choice.
- Successful authentication returns the user to the public Signals page.
- Authenticated visitors see their identity, My Research access, and account/navigation controls.
- The Signals landing and shared navigation must be responsive from 375px through 1440px.

Suggested feed and search continue to use the existing free-source strategy:
RSS sources, Hacker News API, arXiv, Semantic Scholar, Tavily, and Brave with
priority-ranked merging and deduplication.

### Stage B — Deep Research

Selecting a signal after authentication triggers the existing research stage.
Research remains automatic and progresses through source reading,
cross-checking, drafting, and ready states. The user-facing progress state must
remain informative rather than a blank spinner.

### Stage C — Guided Setup

Research feeds the existing selection-only setup: length, framework, tone, and
audience. No change is introduced by the public landing/navigation enhancement.

### Stage D — Storyboard Generation & Visual Selection

Storyboard generation and live visual selection remain unchanged. Existing
scenes, narration, word timestamps, captions, and B-roll selections remain the
source data for the current flow.

### Stage E — Finalize, Export & Download

The existing Finalize/Preview stage remains the canonical storyboard-output
flow, including staged render progress, nested B-roll telemetry, elapsed time,
ETA, MP4/SRT/script exports, and the current render worker.

### Stage F — Advanced Video Editor (planned, separate feature)

The Advanced Video Editor is an optional branch/workspace, not a new required
stage in the core Signals → Research → Setup → Storyboard → Finalize flow.

It reuses existing storyboard/narration/assets as source data while storing
independent editable timeline/version state. Opening or editing in the
Advanced Editor must never mutate the original Storyboard records.

Core editor scope includes multi-track 9:16 editing, frame-accurate playhead,
trim/split/move/reorder, B-roll replacement, captions, audio controls,
overlays, transitions, keyboard shortcuts, undo/redo, autosave, refresh
recovery, and a canonical timeline shared by editor preview and editor render.

### Stage G — Account & Workspace

Helix becomes multi-user through real authentication, secure sessions,
user-owned project/media resources, account settings, route protection, and
server-side ownership enforcement. Public Signals discovery remains available
without authentication.

### Stage H — Asset Library & Media Management

First-class user-owned uploads and reusable media for the Advanced Editor.

### Stage I — AI Editing Assistant

Optional AI operations act on the independent editor model and return reversible
changes rather than mutating rendered/source media directly.

### Stage J — Workspace Productivity & Collaboration

Versions, templates, review links, collaboration roles, and activity history.

### Stage K — Publishing & Analytics

Platform-neutral publishing abstraction and analytics. **Facebook production
publishing remains explicitly deferred**; the existing development integration
stays available for later product review.

---

## 2. Public landing & navigation architecture

The public product shell is intentionally designed around progressive access:

```text
Anonymous visitor
      │
      ├── Browse Signals
      ├── Search Signals
      ├── Filter Signals
      │
      └── Direct this Reel
              │
              ▼
      Sign in / Create account
              │
              ▼
         Return to Signals
              │
              ▼
        Direct this Reel
              │
              ▼
        Existing research flow
```

Shared header behavior:

- Signed out desktop: Helix logo + public actions + **Sign in** + **Create account**.
- Signed in desktop: Helix logo + **My Research** + user identity + page actions + three-dot menu.
- Three-dot menu contains My Research, Account settings, and Sign out.
- Mobile header collapses to the Helix logo + hamburger menu.
- Mobile menu exposes the same account/workspace actions without horizontal scrolling.
- Signals remains the primary public landing route; no login wall is added to the discovery feed.

The public Direct action must be guarded in the UI and the project-creation API
must still enforce authentication/ownership server-side.

---

## 3. Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│ REACT FRONTEND                                                     │
│                                                                     │
│ PUBLIC: Signals → Search / Filter → Direct gate                    │
│                                                                     │
│ CORE: Signals → Research → Setup → Storyboard → Finalize           │
│                                  │                                  │
│                                  └──► Advanced Editor (separate)    │
│                                                                     │
│ Auth/session + My Research + Account + Media Library               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ REST + authenticated session
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ NODE.JS BACKEND                                                    │
│ routes: signals, projects, research, setup, storyboard, narration, │
│         editor, media, auth, render, export, publish               │
│ services: source cascade, research, Gemini, Pexels, TTS, editor,  │
│           media, render, export, auth                              │
│ jobs: scrapeSignals, renderQueue                                   │
│ db: MySQL via Prisma                                               │
└──────────────┬───────────────────────┬──────────────────────────────┘
               │                       │
             MySQL                  Redis / BullMQ
                                       │
                                Remotion worker

             Local/Object Storage + external providers
```

M0–M9 remains the baseline. Next-level work must preserve the separation
between source Storyboard data, editor timeline state, source media, and
rendered outputs.

---

## 4. MySQL schema

Existing core tables:
- `signals`
- `projects`
- `project_scenes`
- `scene_assets`
- `project_exports`
- `users`
- `auth_sessions`
- `auth_tokens`

Planned next-level editor/media tables:

```sql
CREATE TABLE project_versions (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  version_no INT NOT NULL,
  timeline_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by CHAR(36) NOT NULL
);

CREATE TABLE project_media (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  project_id CHAR(36) NULL,
  kind ENUM('video','image','audio','caption','generated','external_cache') NOT NULL,
  storage_key TEXT NOT NULL,
  source_url TEXT NULL,
  filename VARCHAR(255),
  mime_type VARCHAR(120),
  byte_size BIGINT NULL,
  duration_seconds DECIMAL(8,3) NULL,
  width INT NULL,
  height INT NULL,
  status ENUM('uploading','processing','ready','failed','deleted') DEFAULT 'uploading',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_editors (
  project_id CHAR(36) PRIMARY KEY,
  version_id CHAR(36) NOT NULL,
  timeline_json JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

Implementation must remain backwards-compatible with the M0–M9 schema.

---

## 5. Backend endpoints

Existing auth endpoints:

```text
POST /api/auth/signup
POST /api/auth/signin
POST /api/auth/signout
GET  /api/auth/me
POST /api/auth/verify-email
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

Planned editor/media endpoints:

```text
GET    /api/projects/:id/editor
PUT    /api/projects/:id/editor
POST   /api/projects/:id/editor/versions
GET    /api/projects/:id/editor/versions
POST   /api/projects/:id/editor/restore/:versionId
POST   /api/projects/:id/editor/render
GET    /api/media
POST   /api/media/upload
GET    /api/media/:id
DELETE /api/media/:id
POST   /api/media/:id/process
```

Project creation and every project-scoped resource remains authenticated and
owner-scoped. Editor autosave is version-aware and must reject stale writes.

---

## 6. Source strategy

Suggested signal feed continues to use free official sources:

| Source | Role |
|---|---|
| Nature / ScienceDaily / MIT Technology Review / IEEE Spectrum RSS | Primary science/tech signals |
| Hacker News API | Audience-ranked technology heat |
| arXiv API | Fresh science papers |

Search and research use the existing combined cascade:

1. arXiv + Semantic Scholar
2. Tavily
3. Brave Search API

Merge/dedupe results, preserve reliability tier, and rank by source tier,
recency, and relevance.

---

## 7. Gemini contract & AI editing

Existing research/setup/storyboard contracts remain unchanged.
Future AI editing calls must return structured, reversible operations:

```json
{
  "operations": [
    { "type": "trim_scene", "scene_id": "...", "new_end": 4.2 },
    { "type": "replace_asset", "scene_id": "...", "asset_id": "..." }
  ],
  "reasoning": "..."
}
```

AI must not directly delete or overwrite source media.

---

## 8. Frontend changes

| Area | Change |
|---|---|
| `SignalsPage.jsx` | Public landing hero + public search/filter + auth-gated Direct action |
| `Header.jsx` | Signed-out auth CTAs, signed-in identity, My Research, three-dot menu, mobile menu |
| `SignalCard.jsx` | Authentication gate before project creation |
| `MyResearchPage.jsx` | Authenticated project history and filters |
| `StoryboardPage.jsx` | Existing flow unchanged; later adds explicit editor entry |
| `EditorPage.jsx` | Separate advanced editing workspace |
| `EditorTimeline.jsx` | Multi-track timeline |
| `EditorInspector.jsx` | Clip/scene/audio/caption controls |
| `MediaLibraryPage.jsx` | User/project media browser and uploads |
| `FinalizePanel.jsx` | Existing renderer + staged progress/elapsed/ETA; later supports editor renders |

All new navigation and landing changes must remain responsive at
`375, 390, 425, 480, 640, 768, 1024, 1440`.

---

## 9. Roadmap

Completed baseline:

1. Phase 0 — Wiring
2. Phase 1 — Suggested signal feed
3. Phase 2 — Search signals
4. Phase 3 — Research stage
5. Phase 4 — Setup stage
6. Phase 5 — Storyboard + live preview
7. Phase 6 — Voice + synced captions
8. Phase 7 — Rendering
9. Phase 8 — Finalize + export
10. Phase 9 — Direct-to-Facebook development integration; production deferred

Next-level roadmap:

11. Phase 10 — Accounts & authentication
12. **Phase 10A — Public discovery landing & responsive navigation**
13. Phase 11 — Advanced video editor core (separate workspace)
14. Phase 12 — Media library & upload pipeline
15. Phase 13 — Editor rendering integration + reliability
16. Phase 14 — AI editing assistant
17. Phase 15 — Versions, templates & review workflow
18. Phase 16 — Platform publishing abstraction + analytics

Recommended order:

```text
M10 Auth
   ↓
M10A Public Discovery + Navigation
   ↓
M11 Advanced Editor Core (SEPARATE)
   ↓
M12 Media Library
   ↓
M13 Editor Rendering + Reliability
   ↓
M14 AI Editing
   ↓
M15 Versions/Templates/Review
   ↓
M16 Publishing/Analytics

M9 Facebook production → DEFERRED / separate product decision
```

---

## 10. Environment variables

Authentication/development configuration:

```text
DATABASE_URL=
PORT=4000
REDIS_URL=redis://127.0.0.1:6379
REMOTION_BASE_URL=http://127.0.0.1:4000
AUTH_REQUIRED=false
DEV_AUTH_FALLBACK=true
AUTH_PUBLIC_URL=http://localhost:5173
AUTH_ALLOWED_ORIGINS=http://localhost:5173
COOKIE_SECURE=false
COOKIE_SAMESITE=Lax
```

Provider secrets remain environment-only and must never be committed.

---

## 11. Folder structure

```text
server/
  prisma/
    schema.prisma
    migrations/
  src/
    routes/
      signals.js
      projects.js
      auth.js
      editor.js          # M11
      media.js           # M12
      render.js
      export.js
    services/
      sourceCascade.js
      researchService.js
      geminiService.js
      pexelsService.js
      ttsService.js
      editorService.js   # M11
      mediaService.js    # M12
      renderService.js
      exportService.js
      authService.js
    middleware/
      auth.js
      ownership.js
      storageOwnership.js
      csrf.js

frontend/src/
  pages/
    SignalsPage.jsx
    ResearchPage.jsx
    StoryboardPage.jsx
    MyResearchPage.jsx
    EditorPage.jsx
    MediaLibraryPage.jsx
  components/
    Header.jsx
    SignalCard.jsx
    AuthChoiceDialog.jsx
    editor/
    auth/
```

---

## 12. Release-quality gates

Every milestone must pass:

- `npm run lint` with zero warnings/errors
- `npm run build` succeeds
- Responsive QA at `375, 390, 425, 480, 640, 768, 1024, 1440`
- No horizontal overflow or inaccessible controls
- Destructive actions use the modern Helix dialog
- `server/storage/` remains runtime-only
- Authenticated endpoints enforce ownership
- Long-running operations expose meaningful stage/progress states
- Refresh/reconnect does not lose in-progress task state
- Rendered media remains playable and correctly timed
- Errors are actionable; no silent/infinite spinners
- Existing Signals → Research → Setup → Storyboard → Preview/Finalize is regression-tested after next-level changes
- Advanced Editor remains optional and non-destructive to Storyboard/narration data
- Public Signals discovery remains usable without login

---

## 13. Product decisions

**Approved:**
- Public Signals landing/discovery without authentication.
- Public search and category filters.
- Authentication required only when the visitor takes a project-creating Direct action.
- Successful sign in/sign up returns the user to Signals.
- Shared responsive navigation with authenticated identity, My Research, three-dot account menu, and mobile menu.
- Real accounts/authentication.
- Separate Advanced Video Editor that reuses current content but stores independent editor state.

**Explicitly deferred:**
- Facebook production OAuth, multi-user Meta publishing, App Review, and final publishing UX.

**Critical separation rule:** the public landing/navigation enhancement and the
Advanced Editor must not turn the existing Signals → Research → Setup →
Storyboard → Preview/Finalize flow into a different required flow.
