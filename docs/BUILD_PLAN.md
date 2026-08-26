# Helix — MVP Build Plan (React + Node.js + MySQL)

This plan turns the existing Helix UI (mocked in `src/data/signals.js`) into a
working product backed by real trending data, a real LLM pipeline, and a real
render/publish flow — using the stack you picked: **React** (frontend, already
built), **Node.js** (backend orchestration), **MySQL** (database).

It's organized so you can ship a usable v1 quickly, then layer in the more
expensive pieces (voice, rendering, publishing) once the core loop works.

---

## 1. What the UI already assumes (and why that matters)

The Helix frontend was built screen-first, so its component boundaries are
already a pretty accurate map of the API you need:

| Screen / interaction | What it needs from the backend |
|---|---|
| Signals page — card grid | A list of trending topics, each with a category, a `%` heat score, a 1-line summary, and a **"why this" reasoning string** |
| "Direct this Reel" click | Create a project for that signal, classify it into a **Framework** (Disruptor / How It Works / Skeptic / Countdown), return the reasoning |
| Storyboard → Framework tab | The chosen framework + reasoning + the 3 other candidates (for the "why not these" comparison) |
| Storyboard → Storyboard tab | An ordered list of scenes, each with `spoken_text`, duration, `why_line`, `why_picture`, and **5 pre-fetched B-roll options** |
| Swap visual (5 thumbnails) | **No backend call** — all 5 options are already fetched, swapping is a client-side array index change (this is already how `StepCard.jsx` works — keep it that way, it's correct) |
| Storyboard → Preview tab | Full transcript + runtime/cuts summary; "Publish pack" kicks off rendering |
| Video preview captions | Word-level timestamps so on-screen text highlights in sync with audio |

Nothing about the frontend needs to change structurally — you're replacing
`src/data/signals.js` with real `fetch()` calls and adding a couple of loading
/ error states. That's the cleanest path to v1.

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  REACT FRONTEND (existing Helix app)                            │
│  SignalsPage ──► StoryboardPage (Framework / Storyboard/Preview) │
│  fetch()/axios calls to the API below, no other changes needed  │
└──────────────────────────────┬──────────────────────────────────┘
                                │ REST (JSON)
                                ▼
┌────────────────────────────────────────────────────────────────┐
│  NODE.JS BACKEND  (Express or Fastify)                          │
│                                                                  │
│  routes/           signals.js, projects.js, scenes.js, render.js│
│  services/         rssScraper.js, trendsClient.js               │
│                     geminiService.js  (framework + scene JSON)  │
│                     pexelsService.js  (B-roll search)           │
│                     ttsService.js     (voice + word timestamps) │
│                     renderService.js  (Remotion job trigger)     │
│  jobs/             cron: scrapeSignals (every 4h)               │
│                     queue: renderQueue (BullMQ + Redis)          │
│  db/               MySQL via a query builder (Knex/Prisma)      │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┬─────────────────┐
                ▼               ▼               ▼                 ▼
          MySQL DB       Gemini API      Pexels API         TTS API
        (signals,       (framework +   (B-roll clips,    (ElevenLabs /
        projects,        scene JSON,    5 per scene)      OpenAI TTS —
        scenes,          reasoning)                       word timestamps)
        assets)
```

Rendering (Remotion) and publishing (Meta Graph API) are separated out as
**Phase 5/6** below — they're the most expensive/slow pieces, so the MVP
should prove the topic → framework → storyboard loop works and feels good
before you invest in them.

---

## 3. MySQL schema

```sql
-- Trending topics scraped from RSS / Google Trends
CREATE TABLE signals (
  id                CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  rank              INT NOT NULL,
  category          VARCHAR(40) NOT NULL,        -- PHYSICS / ENERGY / BIOTECH / HARDWARE...
  heat_pct          VARCHAR(12),                  -- "+380%" (display string)
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  why_reasoning     TEXT NOT NULL,                -- "Ranked #1: ... up 380% this week"
  source_name       VARCHAR(120),                 -- "Nature Physics"
  source_url        TEXT,
  raw_content       LONGTEXT,                      -- full scraped article text, fed to Gemini
  status            ENUM('new','used','archived') DEFAULT 'new',
  scraped_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- A user's in-progress or finished reel
CREATE TABLE projects (
  id                  CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id             CHAR(36) NOT NULL,
  signal_id           CHAR(36) NOT NULL,
  title               VARCHAR(255),
  selected_framework  VARCHAR(40),                -- disruptor / how_it_works / skeptic / countdown
  framework_reasoning TEXT,
  seo_caption         TEXT,
  duration_seconds    DECIMAL(5,1),
  cuts                INT,
  status              ENUM('framework','storyboard','preview','rendering','published') DEFAULT 'framework',
  render_url          TEXT,                       -- final MP4 once rendered
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (signal_id) REFERENCES signals(id)
);

-- Scene-by-scene script
CREATE TABLE project_scenes (
  id                CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id        CHAR(36) NOT NULL,
  scene_order       INT NOT NULL,
  title             VARCHAR(255),
  spoken_text       TEXT NOT NULL,
  duration_seconds  DECIMAL(4,1),
  why_line          TEXT,
  why_picture       TEXT,
  broll_search_term VARCHAR(160),
  audio_url         TEXT,                          -- set once TTS runs
  word_timestamps   JSON,                           -- [{word, start, end}, ...]
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- The 5 pre-fetched B-roll options per scene (client swaps between these, no re-fetch)
CREATE TABLE scene_assets (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  scene_id      CHAR(36) NOT NULL,
  video_url     TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  sort_order    INT NOT NULL,                       -- 0 = pre-selected default
  is_selected   BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (scene_id) REFERENCES project_scenes(id)
);
```

This maps 1:1 onto the frontend: `signals` → SignalsPage cards, `projects` +
`project_scenes` → the Framework/Storyboard tabs, `scene_assets` → the 5
swap-visual thumbnails per `StepCard`.

---

## 4. Node backend — endpoints for v1

```
GET   /api/signals?category=Physics        → list of today's signals (feeds SignalsPage)
POST  /api/projects        { signalId }     → creates project, runs framework classification, returns project + reasoning
GET   /api/projects/:id                     → project + selected framework + all candidate frameworks (for the compare view)
POST  /api/projects/:id/generate-scenes     → runs Gemini scene generation + Pexels fetch (5 options/scene), stores scene_assets
GET   /api/projects/:id/scenes              → scenes + assets (feeds Storyboard tab)
PATCH /api/scenes/:id/select-asset { assetId }  → marks the chosen asset (only fires if you want the pick persisted server-side; can stay client-only for MVP)
POST  /api/projects/:id/render              → (Phase 5) queues a Remotion render job
GET   /api/projects/:id/render-status        → (Phase 5) polling endpoint for job state
```

Keep the "swap visual" interaction **entirely client-side** exactly like
`StepCard.jsx` already does — only call `select-asset` (or skip it) when the
user actually hits "Preview & publish," to avoid a network round-trip on
every hover/click.

---

## 5. The Gemini prompt contract

Two calls per project, both forced into strict JSON so the "why" text is a
first-class field, not something you have to re-derive:

**Call 1 — framework classification** (fires on "Direct this Reel"):

```json
{
  "selected_framework": "how_it_works",
  "framework_reasoning": "The source details a step-by-step mechanical process — atom interferometry — which reads better as a mechanism explainer than a rivalry story.",
  "candidates_considered": ["disruptor", "how_it_works", "skeptic", "countdown"],
  "suggested_title": "How Quantum Sensors Actually Work"
}
```

**Call 2 — scene generation** (fires when the user opens the Storyboard tab,
or right after call 1 if you want it to feel instant):

```json
{
  "seo_caption": "Quantum sensors are changing navigation... #Quantum #TechNews",
  "scenes": [
    {
      "scene_order": 1,
      "title": "GPS is about to change",
      "spoken_text": "Everything you know about GPS is about to change.",
      "duration_seconds": 3.0,
      "why_line": "Negative-warning hook. One sentence, under 3 seconds, no hello.",
      "why_picture": "A satellite over Earth puts high-tech context on screen in the first 1.5 seconds.",
      "broll_search_term": "satellite orbit earth"
    }
  ]
}
```

Use **Gemini 1.5/2.0 Flash** for both — you want low latency here, not
maximum reasoning depth; the framework list is small and closed, and scene
generation is a structured extraction task, both of which flash-tier models
handle well.

Immediately after call 2 returns, the backend loops over
`scenes[].broll_search_term` and calls Pexels for 5 clips each, storing them
as `scene_assets` — this is the step that makes "swap visual" instant on the
frontend, because by the time the Storyboard tab renders, all 5 options per
scene already exist.

---

## 6. Phased roadmap

**Phase 0 — Wiring (2–3 days)**
- Stand up Express/Fastify app, connect to MySQL (Prisma or Knex — Prisma
  gives you migrations + a typed client, which is worth it here).
- Run the schema above as a migration.
- Replace `src/data/signals.js` reads in `SignalsPage.jsx` with a `fetch` to
  `GET /api/signals`; seed the table by hand with 5–10 rows first so the UI
  has something real to show before the scraper exists.

**Phase 1 — Real signal feed (3–5 days)**
- Cron job (`node-cron` or a scheduled Lambda-style worker) that pulls
  RSS from Nature, MIT Tech Review, ScienceDaily, and queries a trends source
  (Google Trends has no official free API — either scrape via a library like
  `google-trends-api`, or start with just RSS + a simple keyword-frequency
  heat score, and swap in a real trends signal later).
- Store results in `signals`, generate the `why_reasoning` string
  server-side from the actual delta ("up 380% this week") rather than from
  Gemini — this one's cheaper as a plain calculation.

**Phase 2 — Framework auto-selection (3–4 days)**
- Wire `POST /api/projects` to call Gemini with the framework-classification
  prompt above.
- Wire the Framework tab (`FrameworkPanel.jsx`) to real data instead of the
  static `frameworks` array — the 4 framework *descriptions* can stay static
  (they're just UI copy), only `selected_framework` + `framework_reasoning`
  need to come from the API.

**Phase 3 — Scene + B-roll generation (4–6 days)**
- Wire `POST /api/projects/:id/generate-scenes` to call Gemini, then Pexels.
- Wire the Storyboard tab to real `project_scenes` + `scene_assets` instead
  of the mocked `storyboards` object. Keep `StepCard.jsx`'s local `selected`
  state exactly as-is for the swap interaction.

**Phase 4 — Voice + synced captions (4–6 days)**
- Send each scene's `spoken_text` to a TTS API that returns word-level
  timestamps (ElevenLabs and OpenAI TTS both support this, or run Whisper
  over the generated audio to derive timestamps if you use a cheaper TTS).
- Store `audio_url` + `word_timestamps` on `project_scenes`.
- Upgrade `PhonePreview.jsx` from the current static caption to a real
  `<audio>`-driven highlight, using the timestamps to swap `is-said` /
  `is-pending` word classes in real time.

**Phase 5 — Rendering (1–2 weeks, the biggest lift)**
- Add Remotion to the project. Build a `<Composition>` that consumes a
  project's scenes (text, B-roll URL, audio URL, timestamps) and renders a
  9:16 MP4.
- Run renders through a queue (BullMQ + Redis) so the Node API stays
  responsive — `POST /render` enqueues, `GET /render-status` polls, and the
  Preview tab shows a progress state instead of blocking.
- Preview tab's "Publish pack" button becomes: queue render → poll status →
  show the "Reel pack published" success state you already built once the
  job completes.

**Phase 6 — Direct-to-Facebook publish (optional, after v1 is validated)**
- Meta Graph API video upload endpoint, using a long-lived Page access
  token. Gate this behind Phase 5 being solid — publishing a broken render
  is worse than not publishing automatically at all.

---

## 7. Environment variables you'll need

```
DATABASE_URL=mysql://user:pass@host:3306/helix
GEMINI_API_KEY=
PEXELS_API_KEY=
TTS_API_KEY=            # ElevenLabs or OpenAI
REDIS_URL=              # only needed once you add the render queue (Phase 5)
FACEBOOK_PAGE_TOKEN=    # only needed for Phase 6
```

## 8. Suggested backend folder structure

```
server/
  src/
    routes/
      signals.js
      projects.js
      scenes.js
      render.js
    services/
      rssScraper.js
      geminiService.js
      pexelsService.js
      ttsService.js
      renderService.js
    jobs/
      scrapeSignals.cron.js
      renderQueue.js
    db/
      schema.prisma        (or /migrations if using Knex)
      client.js
    app.js
  package.json
```

## 9. What to build first, concretely

If you want the shortest path to "this actually works with real data":
Phase 0 → Phase 1 → Phase 2 → Phase 3. That alone gets you from a trending
headline to a fully reasoned, AI-written, asset-matched storyboard on
screen — which is the actual hard, differentiated part of this product.
Voice sync and rendering (Phases 4–5) are more mechanical once the script/
asset pipeline is proven out.
