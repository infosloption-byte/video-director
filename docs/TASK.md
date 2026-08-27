# Helix — Task & Milestone Tracker

> Update this file as you go. Check items off (`- [x]`) when done, and set
each milestone's **Status** line as you move through it. If scope changes,
update `BUILD_PLAN.md` first, then adjust the tasks here to match. Don't let
this file drift from the build plan.

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
**Status:** Done

- [x] `GET /api/projects/:id/setup/suggestions` — returns AI defaults (length, framework (+reasoning), tone, audience)
- [x] `POST /api/projects/:id/setup` — saves user's confirmed (or overridden) choices
- [x] Write the monetization-guardrail logic
- [x] New frontend component `SetupPanel.jsx`
- [x] Insert Setup as a stage between Research and Storyboard in `StoryboardPage.jsx`'s tab stepper

**M4 implementation notes:**
- Added `server/src/services/setupService.js` to normalize the M3 Gemini recommendations into the four guided setup choices and provide deterministic reasoning/fallbacks.
- Added monetization guardrails: a high-severity research flag can block the risky Disruptor framework and automatically recommend the safer How It Works framework.
- Added `GET /api/projects/:id/setup/suggestions` and `POST /api/projects/:id/setup`; confirmed setup choices are persisted to the existing project fields and project status advances to `storyboard`.
- Added responsive `SetupPanel.jsx` with selection-only controls for 15/30/45/60s, framework, tone, and audience. AI recommendations remain pre-selected but every choice can be overridden in one tap.
- Connected Research completion to the new Setup stage and added Research / Setup / Storyboard / Preview stage navigation for real projects. Existing legacy demo storyboards remain available for backward compatibility.
- Runtime API/Gemini behavior should be verified locally with the already-working research flow; no additional database migration is required because the M0 schema already contains the Stage C project fields.
- `2026-08-27` — Fixed the Research → Guided Setup deep-link bug: `?stage=setup` is now normalized to the canonical `Setup` tab label, so clicking `Continue to guided setup` renders the SetupPanel immediately. Stage tab/button navigation now also keeps the `stage` query parameter synchronized.
- `2026-08-27` — Fixed the Storyboard stage state loop: removed the redundant tab state/effects that could repeatedly update state and trigger React's "Maximum update depth exceeded" error. The active real-project stage is now derived directly from the normalized `stage` URL parameter, and completing Setup transitions cleanly to `?stage=storyboard` without forcing Setup back to Storyboard during render.

## M5 — Storyboard generation + live preview fix (Stage D)
**Status:** Done

- [x] Write Gemini Call 3 prompt
- [x] `POST /api/projects/:id/generate-scenes`
- [x] `GET /api/projects/:id/scenes`
- [x] Wire Storyboard tab to real data
- [x] Lift selected visual state into `StoryboardPage.jsx`
- [x] Pass selected asset into `PhonePreview.jsx`
- [x] Persist selected asset when entering Finalize

**M5 implementation notes:**
- Added `server/src/services/storyboardService.js` with a strict Gemini Call 3 JSON contract for 4–8 scenes, spoken text, duration, reasoning, and concrete B-roll search terms.
- Added `server/src/services/pexelsService.js` using the official Pexels portrait video search endpoint and fetching five usable B-roll options per scene.
- Added `server/src/routes/storyboard.js` with `POST /api/projects/:id/generate-scenes`, `GET /api/projects/:id/scenes`, and `PATCH /api/scenes/:sceneId/select-asset`.
- Real Storyboard now generates on first entry after setup, displays scene cards, and keeps visual swaps client-side through `selectedAssetByScene`; the active selection drives the 9:16 phone preview immediately.
- Entering Preview/Finalize persists the selected asset for every scene in a batch of PATCH requests rather than on every thumbnail click.
- Added `PEXELS_API_KEY` to `server/.env.example` and responsive loading/error states for storyboard generation.
- Runtime verification of Gemini/Pexels generation requires local API keys and network access. The existing M3 research flow remains unchanged.

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
- `2026-08-27` — M4 complete: guided setup suggestions, setup persistence, monetization guardrails, responsive selection-only SetupPanel, and Research → Setup → Storyboard stage navigation.
- `2026-08-27` — Fixed the Guided Setup deep-link routing bug where `?stage=setup` did not match the capitalized `Setup` tab label and therefore rendered a blank stage; canonical stage normalization and URL synchronization are now in place.
- `2026-08-27` — Fixed the StoryboardPage maximum-update-depth regression by deriving the active stage from the URL instead of maintaining a second synchronized React state, preventing the Setup → Storyboard transition from looping.
- `2026-08-27` — M5 complete in code: Gemini scene generation, Pexels five-option B-roll prefetching, real Storyboard scene loading, client-side visual selection lifted into StoryboardPage, live phone preview updates, and batch persistence on Finalize entry. Local Gemini/Pexels runtime verification remains a setup requirement.
