# Helix — Full Platform & Build Plan (React + Node.js + MySQL)

> **Living document.** This is the single source of truth for what the
> platform does and how it's built. When something changes mid-development,
> update this file first, then reflect the change in `TASK.md`. Don't let the
> two drift apart.

---

## 1. The platform flow (what the product actually does)

Five stages, start to finish. Every stage is designed around the same rule:
**the user selects from well-reasoned options, they don't type.** Search is
the one exception — typing a topic is a selection input, not a content input.

```
STAGE A          STAGE B              STAGE C            STAGE D              STAGE E
Discover   ──►   Research   ──►   Guided Setup   ──►   Storyboard   ──►   Finalize & Export
signals          the signal        (a few taps)         + visuals          script, video,
(suggested                                              per scene          downloads
 or searched)                                           w/ live preview
```

### Stage A — Signal Discovery (suggested + searchable)

Two ways to land on a signal, same result shape, same UI grid. **Decided:**
start with free sources only for both.

1. **Suggested feed** — background cron scraper combining three free,
   official sources:
   - **RSS**: Nature, ScienceDaily, MIT Technology Review, IEEE Spectrum.
   - **Hacker News API** (official, no key required) — gives a genuine,
     audience-ranked "trending" signal (points/comments) for tech topics.
   - **arXiv API** (official, no key required) — fresh science papers,
     ranked by recency + category rather than popularity.
   All three are merged into one table and heat-scored server-side (see §6).
2. **Search** — the user types a topic/keyword into a search box on the
   Signals page. This is **not** a content-generation prompt — it's a filter
   into a live lookup, run as a **combined, priority-ranked cascade** across
   multiple sources rather than a single API (see §6 for the exact order and
   merge logic). Results are shaped identically to suggested-feed signals —
   same schema, same card component, no frontend branching needed.
   Results are ephemeral (not written to the daily `signals` table) unless
   the user actually selects one, at which point it's persisted so the rest
   of the pipeline has a stable row to hang a project off of.

**Gap fixed vs. the original plan:** the original plan only covered the
suggested feed, and its "Search source options" section had two dead
options — Bing Search APIs were fully retired in August 2025, and Google
Custom Search has been closed to new signups since 2024 and sunsets
entirely in 2027. Neither is safe to build on. §6 replaces both with a
concrete, currently-viable multi-source cascade.

### Stage B — Deep Research (automatic, triggered by signal selection)

When the user clicks "Direct this Reel," the platform does **not** jump
straight to a framework. It researches first, pulling from the **same
priority-ranked multi-source cascade as Stage A search** (§6) rather than a
single lookup — so the research brief is built on whichever combination of
sources actually has good coverage for that topic:

- Pulls the full source article/paper text (already scraped for suggested
  signals; fetched fresh for search-originated signals).
- Runs the cascade to cross-reference the core claim, gather 1–2 supporting
  facts or numbers, and catch anything that would need a citation — each
  supporting fact keeps a tag for which source it came from and that
  source's reliability tier, so the reasoning showed to the user (and fed
  to Gemini) can favor the most authoritative evidence when sources
  disagree.
- Produces a structured **research brief**: key facts, a plain-language
  mechanism summary, any monetization risk flags (see §7), and a
  recommended framework + script length + tone — all with reasoning
  attached, because everything downstream needs to explain itself.

This is shown to the user as a short progress state ("Reading the source...
Cross-checking claims... Drafting the brief") rather than a blank spinner,
so the wait itself demonstrates the "we did real work" value prop.

**Gap fixed vs. the original plan:** the original plan folded research and
framework classification into one Gemini call fired directly off the
source's raw scraped text. That's fine for a single clean article, but it
skips real research (cross-referencing, supplementary facts) and skips the
step where the user is asked anything at all. Research is now its own stage
with its own output, feeding Stage C.

### Stage C — Guided Setup (a handful of taps, not a form)

Once the research brief exists, the user is asked a short set of
selection-only questions, each pre-filled with the platform's best pick and
a one-line reason — exactly like the framework badge already works:

| Question | UI pattern | Default behavior |
|---|---|---|
| **Script length** | Pill row: 15s / 30s / 45s / 60s | Pre-selected based on how much the research brief actually supports — a thin source shouldn't be stretched to 60s |
| **Script template (framework)** | The 4 framework cards (already built in `FrameworkPanel.jsx`) | Pre-selected to whichever framework is both the best narrative fit **and** clears the monetization guardrails (§7) — if the best narrative fit is risky, the platform picks the next-best safe option and says so |
| **Tone** | Pill row: Energetic / Calm & authoritative / Conversational | Pre-selected from the research brief's content type (a breakthrough reads energetic, a mechanism explainer reads calm) |
| **Audience level** | Pill row: General public / Enthusiast | Pre-selected general public unless the source is already aimed at specialists |

Every default is changeable in one tap — nothing here requires typing. This
is a **new stage that didn't exist in the original plan at all.**

### Stage D — Storyboard Generation & Visual Selection

With research + setup answers locked in, the platform generates the full
scene-by-scene storyboard (unchanged from the original plan's Gemini scene
call, now parameterized by the Stage C answers) and pre-fetches 5 B-roll
options per scene.

The important fix here, vs. what's currently built:

- **Every visual pick must drive the left-side video preview live.**
  Clicking any of the 5 thumbnails on a scene should immediately update the
  phone preview frame if that scene is the active one. Today,
  `StepCard.jsx` tracks its `selected` swatch in **local state**, invisible
  to `PhonePreview.jsx`, which only ever reads the scene's default `thumb`.
  **This is a real gap and needs a state-lifting fix**: the selected asset
  index per scene needs to live in `StoryboardPage` (e.g.
  `selectedAssetByScene: { [sceneId]: assetIndex }`), passed down to both
  `StepCard` (to control the swatch) and `PhonePreview` (to render the pick
  for the active scene). See `TASK.md` → M4.

### Stage E — Finalize, Export & Download

The old "Preview tab" becomes the finalize stage: full transcript, runtime
summary, and now, concretely, the outputs the user actually needs:

- **Download final video (MP4)** once rendering (Phase 5) is done.
- **Download captions (.srt)** for anyone who wants to edit in another tool.
- **Copy the SEO caption** (already generated by Gemini) with one click.
- **Download script as plain text**, for repurposing to other platforms.
- (Later, optional) **Publish directly to the connected Facebook Page.**

**Gap fixed vs. the original plan:** the original plan's Preview tab only
had a "Publish pack" button with no concrete list of what gets exported or
in what formats. That's now explicit.

### Stage F — Advanced Video Editor (planned next-level experience)

After Storyboard/voice generation, the user can open a dedicated **Editor**
for fine-grained creative control. The editor does not destroy the
Storyboard flow; it consumes the same scene/narration/assets data and stores
an editable timeline/decision list that the renderer can consume later.

Core editor scope:
- Multi-track 9:16 timeline with video, narration/audio, captions/text, and overlays.
- Frame-accurate playhead with zoom, snapping, scene boundaries, and keyboard shortcuts.
- Trim, split, move, duplicate, delete, reorder, and duration adjustment for clips.
- Replace/swap B-roll from existing scene assets without regenerating the storyboard.
- Add uploaded media and reusable media-library assets.
- Caption editing: text, timing, style presets, position, emphasis/highlight behavior.
- Audio controls: volume, mute, fades, per-clip replacement, narration regeneration entry point.
- Basic transitions and visual overlays that are render-safe in Remotion.
- Persistent undo/redo, autosave, dirty-state protection, and recovery after refresh.
- Live preview uses the same canonical timeline state as the final renderer to avoid preview/render divergence.
- Render/export uses the existing Remotion worker with the editor timeline as its source of truth.

**Architecture decision:** the editor is primarily an **editing model + preview UI**;
source media is not destructively modified in the browser. Store an immutable
media asset plus an editable timeline JSON/EDL-like structure, and let the
existing Remotion renderer materialize the final MP4.

### Stage G — Account & Workspace (planned next-level foundation)

Helix becomes multi-user. Authentication is a platform foundation rather than
just a screen:
- Sign up, sign in, sign out, persistent session, password reset, and email verification.
- User profile/account settings and secure project ownership checks.
- Every project, media asset, render, and export is scoped to the authenticated user.
- Remove the temporary `local-user` identity from production APIs.
- Route guards for authenticated workspace screens while keeping public signal discovery configurable.
- Secure server-side authorization on every project-scoped endpoint.
- Rate limits and abuse protection for expensive AI/TTS/render actions.

### Stage H — Asset Library & Media Management (planned)

A reusable media layer should sit underneath the Editor:
- User uploads for video, image, audio, and subtitle assets.
- Per-user media library with search, filters, metadata, duration, dimensions, size, and processing state.
- Distinguish generated narration, downloaded B-roll, user media, and externally sourced assets.
- Thumbnail/poster generation and lightweight proxies for responsive editing.
- Cleanup policies for orphaned media and expired render intermediates.
- Storage abstraction so local filesystem can later move to S3-compatible/object storage without changing editor semantics.

### Stage I — AI Editing Assistant (planned)

Once the deterministic editor works, add optional AI actions that operate on
the editor model rather than directly mutating rendered video:
- "Tighten this scene" — shorten spoken text and timing while preserving the selected framework.
- "Swap weak B-roll" — search/recommend better visuals for the selected scene.
- "Generate 3 hooks" — alternate opening scenes while preserving the research brief.
- "Re-time captions" / regenerate narration after text edits.
- Auto-highlight important words and recommend caption emphasis.
- Suggest pacing improvements, dead-space removal, and scene ordering changes.
- All AI edits are proposed as reversible changes, never silently destructive.

### Stage J — Workspace Productivity & Collaboration (planned)

After accounts/editor are stable:
- Project duplication/templates.
- Version history/snapshots and restore.
- Autosave conflict handling.
- Shareable read-only review links.
- Optional team/workspace roles (owner/editor/viewer).
- Activity history for project changes.

### Stage K — Publishing & Analytics (planned, Facebook production deferred)

Separate publishing from editing so integrations can evolve independently:
- Platform-neutral publish/export manifest.
- Additional publishing targets can be added without coupling to the editor.
- Per-publish status/history and failure recovery.
- Basic project performance metadata when external platforms provide it.

**Facebook production publishing remains explicitly deferred.** The existing
M9 development integration stays available for later review, but no production
OAuth/account architecture will be built until the publishing direction is
confirmed.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  REACT FRONTEND                                                          │
│  Signals → Research → Setup → Storyboard → Finalize                      │
│                           │                                               │
│                           └──────► Advanced Editor                        │
│                                    timeline / preview / media / captions  │
│                                                                          │
│  Auth/session + My Research + Media Library + Account                    │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ REST (JSON) + authenticated session
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  NODE.JS BACKEND                                                         │
│  routes/ signals, projects, research, setup, storyboard, narration,     │
│          editor, media, auth, render, export, publish                    │
│  services/ source cascade, research, Gemini, Pexels, TTS, editor model, │
│            media processing, render, export                              │
│  jobs/ scrapeSignals, renderQueue                                        │
│  db/ MySQL via Prisma                                                    │
└──────────────┬───────────────────────┬───────────────────────────────────┘
               │                       │
       ┌───────┴────────┐      ┌───────┴─────────┐
       ▼                ▼      ▼                 ▼
     MySQL           Redis   Local/Object     External providers
                              Storage           Gemini/Pexels/TTS
                               ▲
                               │
                         Editor media assets
```

The current M0–M9 architecture remains the baseline. New milestones must
preserve the separation between: data model, editable timeline state,
external source media, and rendered outputs.

---

## 3. MySQL schema

The existing tables remain the foundation. Planned next-level changes should
extend them rather than storing editor state only in the browser.

Existing core tables:
- `signals`
- `projects`
- `project_scenes`
- `scene_assets`
- `project_exports`

Planned additions/changes:

### Users / sessions

```sql
CREATE TABLE users (
  id                 CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  email              VARCHAR(255) NOT NULL UNIQUE,
  password_hash      VARCHAR(255) NULL,
  email_verified_at  TIMESTAMP NULL,
  display_name       VARCHAR(120) NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE auth_sessions (
  id           CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id      CHAR(36) NOT NULL,
  token_hash   CHAR(64) NOT NULL UNIQUE,
  expires_at   TIMESTAMP NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Project ownership / editor model

```sql
ALTER TABLE projects
  ADD CONSTRAINT fk_projects_user
  FOREIGN KEY (user_id) REFERENCES users(id);

CREATE TABLE project_versions (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id    CHAR(36) NOT NULL,
  version_no    INT NOT NULL,
  timeline_json JSON NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by    CHAR(36) NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE project_media (
  id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id         CHAR(36) NOT NULL,
  project_id      CHAR(36) NULL,
  kind            ENUM('video','image','audio','caption','generated','external_cache') NOT NULL,
  storage_key     TEXT NOT NULL,
  source_url      TEXT NULL,
  filename        VARCHAR(255),
  mime_type       VARCHAR(120),
  byte_size       BIGINT NULL,
  duration_seconds DECIMAL(8,3) NULL,
  width           INT NULL,
  height          INT NULL,
  status          ENUM('uploading','processing','ready','failed','deleted') DEFAULT 'uploading',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE project_editors (
  project_id       CHAR(36) PRIMARY KEY,
  version_id       CHAR(36) NOT NULL,
  timeline_json    JSON NOT NULL,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (version_id) REFERENCES project_versions(id)
);
```

Implementation note: do not create these tables until M10/M11 is ready and
local Prisma/MySQL migration testing is available. Existing M0–M9 schema
behavior must remain backwards-compatible.

---

## 4. Node backend — existing and planned endpoints

Existing endpoints remain as documented below. Planned next-level endpoints:

```text
# Auth
POST   /api/auth/signup
POST   /api/auth/signin
POST   /api/auth/signout
GET    /api/auth/me
POST   /api/auth/verify-email
POST   /api/auth/forgot-password
POST   /api/auth/reset-password

# Editor
GET    /api/projects/:id/editor
PUT    /api/projects/:id/editor
POST   /api/projects/:id/editor/versions
GET    /api/projects/:id/editor/versions
POST   /api/projects/:id/editor/restore/:versionId
POST   /api/projects/:id/editor/render

# Media
GET    /api/media
POST   /api/media/upload
GET    /api/media/:id
DELETE /api/media/:id
POST   /api/media/:id/process
```

Editor writes should be authenticated and version-aware. Autosave should be
idempotent. The client should debounce saves and the server should reject
stale writes using a version number rather than silently overwriting newer
edits.

---

## 5. The Gemini prompt contract

Three calls remain the existing content-generation contract. Future AI editing
calls must operate on the editor timeline as structured input and return
reversible edit operations, for example:

```json
{
  "operations": [
    { "type": "trim_scene", "scene_id": "...", "new_end": 4.2 },
    { "type": "replace_asset", "scene_id": "...", "asset_id": "..." },
    { "type": "update_caption_style", "scene_id": "...", "preset": "emphasis" }
  ],
  "reasoning": "..."
}
```

Do not allow future AI features to directly mutate or delete source media.

---

## 6. Source strategy — suggested feed, search, and research (all free-tier, priority-ranked)

**Decisions locked in:** suggested feed = free official sources only; search
and research both use a **combined cascade** across free/low-cost sources,
merged and ranked by reliability rather than picked from a single provider.
Two dead ends worth flagging so nobody re-discovers them: Bing Search APIs
were retired in August 2025, and Google Custom Search is closed to new
signups and sunsets in 2027 — neither belongs in this stack.

### 6.1 Suggested feed sources (Stage A, background)

| Source | Cost | Role |
|---|---|---|
| RSS — Nature, ScienceDaily, MIT Tech Review, IEEE Spectrum | Free | Primary article content |
| Hacker News API (official) | Free | Real audience-ranked trending signal for tech topics (points/comments as heat) |
| arXiv API (official) | Free | Fresh papers, ranked by recency + category |

Merge all three into `signals`, tag each row's `source_type` and compute
`heat_score` server-side (post frequency / HN points / paper recency —
there's no single free "trend %" number, so this is a formula you own, not
an API you call).

### 6.2 Search & research source cascade (Stage A search + Stage B research)

Both stages hit the **same cascade**, in this order, and merge/dedupe the
results rather than picking one winner:

| Priority | Source | Cost | Why this position |
|---|---|---|---|
| 1 (most reliable) | **arXiv + Semantic Scholar search** | Free | Peer-reviewed or preprint science — the highest-trust tier when the query is paper-shaped |
| 2 | **Tavily** | 1,000 free queries/mo, then $30/4,000 | AI-optimized, pre-cleaned results — best for feeding Gemini a research brief without extra parsing |
| 3 | **Brave Search API** | 2,000 free queries/mo, then $3/5,000 | Broadest general web + news coverage, cheapest fallback for anything the first two don't cover |

**Merge logic:**
1. Run all three in parallel (or short-circuit 2 and 3 if tier 1 alone
   returns a strong match — worth an early optimization once real usage
   data exists, not before).
2. Tag every result with its source tier (`peer_reviewed` / `ai_search` /
   `general_web`).
3. Dedupe by URL and near-duplicate title.
4. Rank combined results by tier first, then recency/relevance within tier —
   so a peer-reviewed source always outranks a general web hit on the same
   claim, exactly matching "priority for reliable data."
5. Every fact pulled into a research brief keeps its source tier attached,
   so `research_sources` (see §3) can show the user which claims are backed by a
   paper vs. a general article.

This cascade is what both `GET /api/signals/search` and
`researchService.js` call internally — one shared `sourceCascade.js`
module, not two separate implementations.

---

## 7. Monetization guardrails (feeds the Stage C framework suggestion)

Facebook/Meta monetization eligibility generally penalizes:

- Reused/unoriginal content without added value (transformative edits only).
- Misleading or unverifiable claims stated as fact — especially medical or
  health claims.
- Sensationalized "clickbait" framing not supported by the source.
- Third-party IP use without rights (music, footage, logos/watermarks).

The research brief's `monetization_flags` array should call out any of
these risks found in the source or implied by the "best" narrative framework
for the topic. When the top-fit framework carries a flag, Stage C's default
suggestion should fall back to the next-best framework and say so in the
reasoning — the same "why this" transparency pattern used everywhere else.

---

## 8. Frontend changes needed (mapped to gaps)

Current implementation areas remain as already built. New frontend work is:

| Component | Planned next-level change |
|---|---|
| `SignalsPage.jsx` | Keep current search/filter behavior; add authenticated workspace entry when M10 lands |
| `MyResearchPage.jsx` | Add account-aware project ownership, sorting, filters, and optional thumbnails when media metadata exists |
| `StoryboardPage.jsx` | Add explicit **Edit video** entry into the new editor while preserving the storyboard stage |
| New: `EditorPage.jsx` | Advanced editor shell: preview, timeline, tracks, clip controls, inspector, undo/redo, autosave, render handoff |
| New: `EditorTimeline.jsx` | Multi-track timeline with snapping, zoom, playhead, selection, trim/split/move |
| New: `EditorInspector.jsx` | Selected clip/scene/audio/caption controls |
| New: `MediaLibraryPage.jsx` | User/project media browser and upload surface |
| New: `AuthPage.jsx` / auth components | Sign up/sign in/reset/verification flows |
| `FinalizePanel.jsx` | Render/export editor timeline; keep staged render progress and elapsed/ETA |
| `PhonePreview.jsx` | Reuse editor preview primitives where possible to avoid preview/render divergence |

---

## 9. Phased roadmap

Completed baseline remains:

1. **Phase 0 — Wiring**
2. **Phase 1 — Suggested signal feed**
3. **Phase 2 — Search signals**
4. **Phase 3 — Research stage**
5. **Phase 4 — Setup stage**
6. **Phase 5 — Storyboard + live preview**
7. **Phase 6 — Voice + synced captions**
8. **Phase 7 — Rendering**
9. **Phase 8 — Finalize & export**
10. **Phase 9 — Direct-to-Facebook development integration** — production explicitly deferred.

Next-level roadmap:

11. **Phase 10 — Accounts & authentication**
12. **Phase 11 — Advanced video editor core**
13. **Phase 12 — Media library & upload pipeline**
14. **Phase 13 — Editor rendering integration + reliability**
15. **Phase 14 — AI editing assistant**
16. **Phase 15 — Versions, templates & review workflow**
17. **Phase 16 — Platform publishing abstraction + analytics**

Recommended implementation order:

```text
M10 Auth
   ↓
M11 Editor data model + core editor UI
   ↓
M12 Media library/uploads
   ↓
M13 Editor → Remotion render integration + stability
   ↓
M14 AI editing assistant
   ↓
M15 Versions/templates/review
   ↓
M16 Publishing abstraction + analytics
        ↘ M9 Facebook production (later, separate decision)
```

### Why this order

Authentication should come before the editor becomes a real workspace so
project/media ownership is designed correctly rather than retrofitted.
The editor should come before AI editing so the AI can manipulate a stable,
reversible timeline model. Media uploads should become a first-class asset
layer before the editor grows beyond Pexels/external assets. Rendering
integration then makes the editor's preview and final output trustworthy
before adding more automation.

---

## 10. Environment variables

Current variables remain. Planned next-level additions:

```text
DATABASE_URL=mysql://user:pass@host:3306/helix
GEMINI_API_KEY=
TAVILY_API_KEY=
BRAVE_API_KEY=
PEXELS_API_KEY=
TTS_API_KEY=
REDIS_URL=
REMOTION_BASE_URL=
FACEBOOK_PAGE_TOKEN=     # development integration only; production deferred
SESSION_SECRET=
APP_BASE_URL=
MEDIA_STORAGE_ROOT=      # local development storage abstraction
MEDIA_MAX_UPLOAD_MB=256
```

Production secret/session storage must not live in source control.

---

## 11. Backend folder structure

The existing folders remain. Planned additions:

```text
server/
  prisma/
    schema.prisma
    seed.js
  src/
    routes/
      signals.js
      projects.js
      render.js
      auth.js              # M10
      editor.js            # M11
      media.js             # M12
    services/
      rssScraper.js
      hackerNewsClient.js
      arxivClient.js
      semanticScholarClient.js
      tavilyClient.js
      braveSearchClient.js
      sourceCascade.js
      researchService.js
      geminiService.js
      pexelsService.js
      ttsService.js
      renderService.js
      exportService.js
      authService.js       # M10
      editorService.js     # M11
      mediaService.js      # M12
    jobs/
      scrapeSignals.cron.js
      renderQueue.js
    db/
      client.js
    app.js
    server.js
```

Frontend planned additions:

```text
frontend/src/
  pages/
    SignalsPage.jsx
    ResearchPage.jsx
    StoryboardPage.jsx
    MyResearchPage.jsx
    EditorPage.jsx
    AuthPage.jsx
    MediaLibraryPage.jsx
  components/
    editor/
      EditorTimeline.jsx
      EditorPreview.jsx
      EditorInspector.jsx
      EditorToolbar.jsx
      EditorMediaLibrary.jsx
      EditorCaptionTrack.jsx
      EditorAudioTrack.jsx
    auth/
      AuthProvider.jsx
      ProtectedRoute.jsx
```

---

## 12. Release-quality gates for the next level

Every new milestone must pass these gates before it is marked done:

- `frontend`: `npm run lint` and `npm run build` succeed with zero warnings/errors.
- Responsive QA at `375, 390, 425, 480, 640, 768, 1024, 1440`.
- Authenticated API authorization tests for every project/media endpoint.
- No generated media committed to Git; `server/storage/` remains runtime-only.
- Rendered output must be playable, correctly timed, and use the same editor timeline as preview.
- Expensive provider/render failures must surface as actionable UI states, not silent infinite loading.
- Autosave must recover after refresh without losing confirmed edits.
- Destructive operations require the existing modern dialog pattern.
- M9 Facebook production work is excluded from these gates until separately approved.

---

## 13. Product decisions for the next implementation cycle

**Approved now:**
- Build accounts/authentication.
- Build a dedicated advanced video editor on top of the existing storyboard/narration/render pipeline.
- Build a reusable media layer so user uploads and generated assets share one model.
- Preserve Remotion as the source of truth for final rendering.
- Preserve the current research → setup → storyboard → finalize flow; the editor is an advanced branch from Storyboard/Finalize, not a replacement.

**Recommended but not yet implementation-approved:**
- AI editing assistant.
- Version history/templates/review workflow.
- Platform-neutral publishing abstraction and analytics.

**Explicitly deferred:**
- Facebook production OAuth, multi-user Meta publishing, App Review, and final publishing UX.
