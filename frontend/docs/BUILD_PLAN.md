# Helix — Full Platform & Build Plan (React + Node.js + MySQL)

> **Living document.** This is the single source of truth for what the
> platform does and how it's built. When something changes mid-development,
> update this file first, then reflect the change in `TASK.md`. Don't let
> the two drift apart.

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
entirely in 2027. Neither is safe to build on now. §6 replaces both with a
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

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  REACT FRONTEND                                                       │
│  SignalsPage (suggested grid + search) ─► StoryboardPage:              │
│      00 Research (progress)  ─►  01 Setup  ─►  02 Storyboard  ─►  03 Finalize │
└──────────────────────────────┬────────────────────────────────────────┘
                                │ REST (JSON)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  NODE.JS BACKEND  (Express or Fastify)                                │
│                                                                        │
│  routes/    signals.js  (list + search)                              │
│             projects.js (create, research, setup, scenes, export)     │
│             render.js                                                 │
│  services/  rssScraper.js, hackerNewsClient.js, arxivClient.js         │
│             sourceCascade.js    (shared search+research merge/rank)   │
│             braveSearchClient.js, tavilyClient.js, semanticScholarClient.js │
│             researchService.js  (research brief: facts + reasoning)   │
│             geminiService.js    (framework/setup suggestions + scenes)│
│             pexelsService.js    (B-roll search, 5/scene)              │
│             ttsService.js       (voice + word timestamps)             │
│             renderService.js    (Remotion job trigger)                 │
│             exportService.js    (mp4/srt/txt bundling)                │
│  jobs/      cron: scrapeSignals (every 4h)                            │
│             queue: renderQueue (BullMQ + Redis)                        │
│  db/        MySQL via Prisma or Knex                                   │
└──────────────────────────────┬────────────────────────────────────────┘
                                │
     ┌───────────┬──────────────┼──────────────┬───────────────┬─────────┐
     ▼           ▼              ▼              ▼               ▼         ▼
  MySQL     Gemini API      Source cascade:    Pexels API      TTS API   Remotion
 (signals,  (research,      arXiv/Semantic     (B-roll,        (voice +  render
 projects,   setup          Scholar → Tavily   5/scene)        word      worker
 scenes,     suggestions,   → Brave Search                     timestamps)
 assets,     scenes)        (priority cascade,
 exports)                    §6)
```

---

## 3. MySQL schema

```sql
-- Trending topics — both cron-scraped (suggested) and search-originated
CREATE TABLE signals (
  id                CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  origin            ENUM('suggested','search') DEFAULT 'suggested',
  source_type       ENUM('rss','hacker_news','arxiv','semantic_scholar','tavily','brave') NOT NULL,
  source_reliability ENUM('peer_reviewed','ai_search','general_web') NOT NULL,
  search_query      VARCHAR(255) NULL,             -- set when origin = 'search'
  rank              INT NULL,                       -- only meaningful for suggested feed ordering
  category          VARCHAR(40) NOT NULL,
  heat_pct          VARCHAR(12),
  heat_score        DECIMAL(6,2) NULL,              -- raw numeric score behind heat_pct
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  why_reasoning     TEXT NOT NULL,
  source_name       VARCHAR(120),
  source_url        TEXT,
  raw_content       LONGTEXT,
  status            ENUM('new','used','archived') DEFAULT 'new',
  scraped_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- A user's in-progress or finished reel
CREATE TABLE projects (
  id                  CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id             CHAR(36) NOT NULL,
  signal_id           CHAR(36) NOT NULL,
  title               VARCHAR(255),

  -- Stage B: research output
  research_summary    TEXT,
  research_sources    JSON,                         -- [{title,url,note,source_reliability}, ...]
  monetization_flags  JSON,                         -- [{issue, severity}, ...]

  -- Stage C: setup answers (each with the AI's suggested default retained for "why" display)
  script_length_seconds  INT,
  suggested_length_seconds INT,
  selected_framework      VARCHAR(40),
  framework_reasoning     TEXT,
  suggested_framework     VARCHAR(40),               -- may differ if user overrode it
  tone                    VARCHAR(30),
  suggested_tone          VARCHAR(30),
  audience_level          VARCHAR(20),

  seo_caption         TEXT,
  duration_seconds    DECIMAL(5,1),
  cuts                INT,
  status              ENUM('researching','setup','storyboard','finalize','rendering','published')
                        DEFAULT 'researching',
  render_url          TEXT,
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
  audio_url         TEXT,
  word_timestamps   JSON,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- The 5 pre-fetched B-roll options per scene
CREATE TABLE scene_assets (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  scene_id      CHAR(36) NOT NULL,
  video_url     TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  sort_order    INT NOT NULL,
  is_selected   BOOLEAN DEFAULT FALSE,               -- persisted pick, written when user reaches Finalize
  FOREIGN KEY (scene_id) REFERENCES project_scenes(id)
);

-- Final downloadable outputs for a project
CREATE TABLE project_exports (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id    CHAR(36) NOT NULL,
  kind          ENUM('mp4','srt','script_txt') NOT NULL,
  file_url      TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

---

## 4. Node backend — endpoints

```
# Stage A — Discovery
GET   /api/signals?category=Physics              → suggested feed (cron-scraped)
GET   /api/signals/search?q=quantum+sensors       → live search-originated signals (same shape as above)

# Stage B — Research
POST  /api/projects            { signalId }       → creates project (status=researching), kicks off research brief
GET   /api/projects/:id/research                  → poll research status + brief once ready

# Stage C — Setup
GET   /api/projects/:id/setup/suggestions          → AI-suggested defaults: length, framework (+reasoning), tone, audience
POST  /api/projects/:id/setup   { length, framework, tone, audienceLevel } → saves the user's (possibly overridden) choices

# Stage D — Storyboard
POST  /api/projects/:id/generate-scenes            → Gemini scene generation + Pexels fetch (5 options/scene)
GET   /api/projects/:id/scenes                      → scenes + assets
PATCH /api/scenes/:id/select-asset  { assetId }     → persists the chosen visual (called on Finalize entry, not on every click)

# Stage E — Finalize & Export
GET   /api/projects/:id                             → full project summary (for the Finalize transcript view)
POST  /api/projects/:id/render                       → (Phase 5) queues Remotion render job
GET   /api/projects/:id/render-status                → polling endpoint
GET   /api/projects/:id/export                       → returns { mp4Url, srtUrl, scriptTxtUrl, seoCaption } once ready
```

Keep "swap visual" **entirely client-side** during Stage D — all 5 options
per scene are already fetched, so cycling through them is just an array
index change. Only call `PATCH /api/scenes/:id/select-asset` once, in a
batch, when the user moves from Storyboard into Finalize — no network call
per click.

---

## 5. The Gemini prompt contract

Three calls now, each mapped to a stage:

**Call 1 — Research brief** (Stage B, fires on signal selection):

```json
{
  "key_facts": [
    "A UK Royal Navy field trial validated the sensor outside lab conditions.",
    "Precision comes from measuring acceleration via atom interferometry."
  ],
  "mechanism_summary": "Cold atoms are split by lasers; their interference pattern reveals motion precisely enough to replace satellite fixes.",
  "monetization_flags": [],
  "suggested_length_seconds": 34,
  "suggested_framework": "how_it_works",
  "suggested_framework_reasoning": "The source is mechanism-heavy and well-cited, which favors an explainer over a rivalry angle.",
  "suggested_tone": "calm_authoritative",
  "sources": [
    { "title": "Nature Physics field trial report", "url": "...", "source_reliability": "peer_reviewed" },
    { "title": "Supporting coverage via search cascade", "url": "...", "source_reliability": "ai_search" }
  ]
}
```

Each source in `sources` carries the reliability tier assigned by the
cascade in §6, so when two sources disagree on a claim, the prompt (and the
UI's "why this" text) can explicitly favor the peer-reviewed one.

**Call 2 — Setup suggestions** can reuse Call 1's output directly (it's
already shaped for the Stage C question defaults) — no second round trip
needed unless the user changes the underlying signal.

**Call 3 — Scene generation** (Stage D, fires once Stage C is confirmed):

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

This call is now parameterized by the confirmed `script_length_seconds`,
`selected_framework`, and `tone` from Stage C — the prompt should include
those explicitly rather than re-deriving them.

Use **Gemini Flash-tier models** for all three calls — low latency matters
more than maximum reasoning depth here.

---

## 6. Source strategy — suggested feed, search, and research (all free-tier, priority-ranked)

**Decisions locked in:** suggested feed = free official sources only; search
and research both use a **combined cascade** across free/low-cost sources,
merged and ranked by reliability rather than picked from a single provider.
Two dead ends worth flagging so nobody re-discovers them the hard way: Bing
Search APIs were retired in August 2025, and Google Custom Search is closed
to new signups and sunsets in 2027 — neither belongs in this stack.

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
   so `research_sources` (see §3) can show the user which claims are
   backed by a paper vs. a general article.

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

| Component | Change |
|---|---|
| `SignalsPage.jsx` | Add a search input above/beside the filter pills; wire to `GET /api/signals/search` |
| `StoryboardPage.jsx` | Add two stages before the existing tabs: **Research** (progress state) and **Setup** (guided questions); tab stepper becomes 5 steps |
| New: `ResearchProgress.jsx` | Shows the research brief being assembled (source read → cross-check → brief ready) |
| New: `SetupPanel.jsx` | Pill-based question flow for length/framework/tone/audience, each pre-filled with the AI default + one-line reasoning |
| `StepCard.jsx` | **Lift `selected` swatch state up** to `StoryboardPage` so `PhonePreview` can render the actual chosen asset per scene, not just the default `thumb` |
| `PhonePreview.jsx` | Accept the lifted `selectedAssetByScene` state and render the chosen asset for the active scene |
| `PreviewPanel.jsx` → rename intent to **Finalize** | Add Download MP4 / Download SRT / Copy caption / Download script actions once export data exists |

---

## 9. Phased roadmap

Each phase below has a matching, checkable milestone in `TASK.md` — use that
file day-to-day; use this section for the big-picture order of operations.

1. **Phase 0 — Wiring**: Express/Fastify + MySQL migration + connect
   `SignalsPage` to a real (seeded) `GET /api/signals`.
2. **Phase 1 — Suggested signal feed**: cron scraper (RSS + trend source).
3. **Phase 2 — Search signals**: search endpoint + `SignalsPage` search box.
4. **Phase 3 — Research stage**: `researchService.js` + Gemini Call 1 +
   `ResearchProgress.jsx`.
5. **Phase 4 — Setup stage**: `SetupPanel.jsx` + suggestions endpoint.
6. **Phase 5 — Storyboard + live preview fix**: Gemini Call 3 + Pexels +
   the `StepCard`/`PhonePreview` state-lifting fix.
7. **Phase 6 — Voice + synced captions**: TTS + word timestamps.
8. **Phase 7 — Rendering**: Remotion + render queue.
9. **Phase 8 — Finalize & export**: MP4/SRT/script downloads, caption copy.
10. **Phase 9 — Direct-to-Facebook publish** (optional, last).

---

## 10. Environment variables

```
DATABASE_URL=mysql://user:pass@host:3306/helix
GEMINI_API_KEY=
TAVILY_API_KEY=          # Stage A search + Stage B research, tier 2 of the cascade
BRAVE_API_KEY=           # Stage A search + Stage B research, tier 3 (fallback) of the cascade
                         # arXiv + Semantic Scholar (tier 1) need no key — public endpoints
PEXELS_API_KEY=
TTS_API_KEY=             # ElevenLabs or OpenAI
REDIS_URL=               # render queue, Phase 8
FACEBOOK_PAGE_TOKEN=     # Phase 9 only
```

## 11. Suggested backend folder structure

```
server/
  src/
    routes/
      signals.js        (list + search)
      projects.js        (create, research, setup, scenes, export)
      render.js
    services/
      rssScraper.js
      hackerNewsClient.js
      arxivClient.js
      semanticScholarClient.js
      tavilyClient.js
      braveSearchClient.js
      sourceCascade.js      (shared merge/rank logic for search + research)
      researchService.js    (Stage B brief, calls sourceCascade.js)
      geminiService.js       (setup suggestions + scene generation)
      pexelsService.js
      ttsService.js
      renderService.js
      exportService.js      (Stage E bundling)
    jobs/
      scrapeSignals.cron.js
      renderQueue.js
    db/
      schema.prisma
      client.js
    app.js
  package.json
```
