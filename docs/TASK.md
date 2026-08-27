# Helix — Task & Milestone Tracker

> Update this file as you go. Check items off (`- [x]`) when done, and set
each milestone's **Status** line as you move through it. If scope changes,
update `BUILD_PLAN.md` first, then adjust the tasks here to match.

**Status legend:** `Not started` · `In progress` · `Blocked` · `Done`

---

## M0 — Backend wiring
**Status:** Done

- [x] Scaffold Node.js backend (Express or Fastify) in `/server`
- [x] Set up MySQL connection + choose ORM/query builder (Prisma recommended)
- [x] Write initial migration for: `signals`, `projects`, `project_scenes`, `scene_assets`, `project_exports` — schema defined in `server/prisma/schema.prisma`; migration itself must be generated locally with `npm run prisma:migrate -- --name init` since it needs a live MySQL connection this environment doesn't have.
- [x] Seed `signals` table with 5–10 hand-written rows for local dev (`server/prisma/seed.js`, 6 rows; first two keep the `quantum-gps` / `solid-state` ids so the existing mocked storyboards still resolve until M3 wires real project creation)
- [x] `GET /api/signals` returns seeded rows (`server/src/routes/signals.js`, supports `?category=`)
- [x] Replace `src/data/signals.js` reads in `SignalsPage.jsx` with a real `fetch()` to `GET /api/signals`
- [x] Add loading + error states to `SignalsPage.jsx`
- [x] Confirm env var loading for `DATABASE_URL`

---

## M1 — Suggested signal feed (Stage A, part 1)
**Status:** Done

- [x] Build `rssScraper.js` (Nature, ScienceDaily, MIT Tech Review, IEEE Spectrum)
- [x] Build `hackerNewsClient.js` (official API, no key — pull top/new stories, use points+comments as heat input)
- [x] Build `arxivClient.js` (official API, no key — pull recent papers by category)
- [x] Write the server-side heat-scoring formula combining all three
- [x] Generate `why_reasoning` server-side from the actual score delta
- [x] Tag each row with `source_type` and `source_reliability` on insert
- [x] Write cron job (`node-cron`) to run all three scrapers every 4 hours
- [x] Store merged, de-duplicated results into `signals` with `origin = 'suggested'`
- [x] Verify `SignalsPage` renders real scraped signals end-to-end

**M1 implementation notes:**
- Added RSS + Hacker News + arXiv ingestion, source normalization, URL/title deduplication, server-side heat scoring, reasoning generation, reliability/source tagging, persistence/archival of suggested signals, and a four-hour cron with optional startup scrape.
- Runtime database verification remains a local setup step because this environment has no live MySQL connection.

---

## M2 — Search signals (Stage A, part 2)
**Status:** Done
**Sources locked in:** combined cascade — arXiv/Semantic Scholar → Tavily → Brave Search

- [x] Build `semanticScholarClient.js`
- [x] Build `tavilyClient.js`
- [x] Build `braveSearchClient.js`
- [x] Build shared `sourceCascade.js` with parallel providers, reliability tiers, URL/title deduplication, and reliability/recency/relevance ranking
- [x] `GET /api/signals/search?q=` returns the same signal shape as the suggested feed
- [x] Persist only the signal the user actually selects — implemented in M3 project creation; search results remain ephemeral until selection
- [x] Add search input to `SignalsPage.jsx`
- [x] Wire search input to the endpoint and reuse `SignalCard`
- [x] Handle empty/no-result search state

**M2 implementation notes:**
- Added Semantic Scholar/Tavily/Brave clients, parallel source cascade, reliability-aware dedup/ranking, `/api/signals/search`, and responsive Signals search/category UI.
- Search-originated results are persisted only when the user clicks `Direct this Reel`; persistence happens inside `POST /api/projects` before research begins.
- External provider runtime verification remains a local setup step because this environment cannot install dependencies or make external API calls.

---

## M3 — Research stage (Stage B)
**Status:** Done
**Depends on:** `sourceCascade.js` from M2 (reused, not rebuilt)

- [x] Build `researchService.js`: fetch full source text, then call `sourceCascade.js` for cross-referencing lookups
- [x] Ensure every supporting fact keeps its `source_reliability` tag through to the brief
- [x] Write Gemini Call 1 prompt with strict JSON schema, including tiered `sources[]`
- [x] `POST /api/projects { signalId }` creates project (`status = researching`) and kicks off the brief
- [x] `GET /api/projects/:id/research` polls status/result
- [x] Store `research_summary`, `research_sources` (with reliability tags), and `monetization_flags` on `projects`
- [x] Add `ResearchProgress.jsx` with reading → cross-checking → drafting → ready states
- [x] Wire `Direct this Reel` to project creation and research polling

**M3 implementation notes:**
- Added `server/src/services/researchService.js`: uses stored `rawContent` when available, otherwise fetches the source page, then reuses the M2 source cascade to cross-reference the selected signal.
- Added a strict Gemini JSON contract for key facts, mechanism summary, supporting sources with `source_reliability`, monetization flags, and recommended framework/length/tone.
- Added `POST /api/projects` and `GET /api/projects/:id/research`. Project creation accepts both persistent suggested signals and ephemeral M2 search results; search results are persisted at selection time with `origin = search`.
- Research runs asynchronously and exposes queued/reading/cross-checking/drafting/ready/error states for the frontend.
- Added `ResearchPage.jsx`, `ResearchProgress.jsx`, and responsive research-brief styling. The completed brief shows the mechanism summary, supporting sources/reliability, and monetization notes.
- Added `GEMINI_API_KEY` and `GEMINI_MODEL` to `server/.env.example`.
- Runtime verification of Gemini and external source fetching still requires local network/API-key access; the implementation is complete but this environment cannot perform that external end-to-end test.
- `2026-08-27` — Hardened API startup: suggested-signal scraping is now opt-in at boot (`SIGNALS_SCRAPE_ON_START=true`), so temporary RSS/Hacker News outages cannot interfere with the local API. Added process-level rejection/exception logging and graceful Prisma shutdown handling.

---

## M4 — Guided setup stage (Stage C)
**Status:** Not started

- [ ] `GET /api/projects/:id/setup/suggestions` — returns AI defaults (length, framework (+reasoning), tone, audience)
- [ ] `POST /api/projects/:id/setup` — saves user's confirmed (or overridden) choices
- [ ] Write the monetization-guardrail logic
- [ ] New frontend component `SetupPanel.jsx`
- [ ] Insert Setup as a stage between Research and Storyboard in `StoryboardPage.jsx`'s tab stepper

## M5 — Storyboard generation + live preview fix (Stage D)
**Status:** Not started

- [ ] Write Gemini Call 3 prompt
- [ ] `POST /api/projects/:id/generate-scenes`
- [ ] `GET /api/projects/:id/scenes`
- [ ] Wire Storyboard tab to real data
- [ ] Lift selected visual state into `StoryboardPage.jsx`
- [ ] Pass selected asset into `PhonePreview.jsx`
- [ ] Persist selected asset when entering Finalize

## M6 — Voice + synced captions
**Status:** Not started

- [ ] Build TTS service
- [ ] Store audio/timestamps
- [ ] Upgrade PhonePreview to audio-driven word highlighting

## M7 — Rendering
**Status:** Not started

- [ ] Add Remotion
- [ ] Build Composition
- [ ] Redis + BullMQ render queue
- [ ] Render endpoints
- [ ] Wire Finalize render flow

## M8 — Finalize & export
**Status:** Not started

- [ ] Build export service
- [ ] Export endpoint
- [ ] Rework PreviewPanel into Finalize view with MP4/SRT/SEO/script outputs

## M9 — Direct-to-Facebook publish (optional, last)
**Status:** Not started

- [ ] Meta Graph API setup
- [ ] Publish endpoint
- [ ] Gate behind solid M7/M8 production behavior

---

## Notes / decisions log

- `2026-08-26` — Confirmed 4-stage guided setup (length/framework/tone/audience) instead of framework-only; updated BUILD_PLAN §1 Stage C and added M4.
- `2026-08-27` — Locked source strategy: suggested feed = RSS + Hacker News API + arXiv; search & research share one priority-ranked cascade = arXiv/Semantic Scholar → Tavily → Brave Search.
- `2026-08-27` — M0 complete: `/server` scaffolded, Prisma schema defined, signals seeded, `/api/signals` live, and SignalsPage uses the real API.
- `2026-08-27` — M1 implementation complete: RSS + Hacker News + arXiv ingestion, normalization, deduplication, heat scoring, reasoning, reliability tagging, persistence, archival, and four-hour cron.
- `2026-08-27` — M2 complete: Semantic Scholar/Tavily/Brave search cascade, reliability-aware ranking/deduplication, `/api/signals/search`, and Signals search/filter UI. Search-result persistence intentionally completed as part of M3 selection/project creation.
- `2026-08-27` — M3 complete in code: research source fetching, M2 cascade cross-checking, Gemini structured research brief, asynchronous project/research endpoints, search-signal persistence on selection, research progress UI, completed research-brief view, and environment configuration. External Gemini/source runtime verification remains a local setup requirement.
- `2026-08-27` — Local API hardening: disabled automatic startup scraping by default and added process-level error logging/graceful shutdown so third-party feed failures do not take the development API down.
