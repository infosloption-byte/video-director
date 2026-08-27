# Helix — Task & Milestone Tracker

> Update this file as you go. Check items off (`- [x]`) when done, and set
> each milestone's **Status** line as you move through it. If scope changes,
> update `BUILD_PLAN.md` first, then adjust the tasks here to match.

**Status legend:** `Not started` · `In progress` · `Blocked` · `Done`

---

## M0 — Backend wiring
**Status:** Done

- [x] Scaffold Node.js backend (Express or Fastify) in `/server`
- [x] Set up MySQL connection + choose ORM/query builder (Prisma recommended)
- [x] Write initial migration for: `signals`, `projects`, `project_scenes`, `scene_assets`, `project_exports`
      — schema defined in `server/prisma/schema.prisma`; migration itself
      must be generated locally with `npm run prisma:migrate -- --name init`
      since it needs a live MySQL connection this environment doesn't have.
- [x] Seed `signals` table with 5–10 hand-written rows for local dev
      (`server/prisma/seed.js`, 6 rows; first two keep the `quantum-gps` /
      `solid-state` ids so the existing mocked storyboards still resolve
      until M3 wires real project creation)
- [x] `GET /api/signals` returns seeded rows (`server/src/routes/signals.js`,
      supports `?category=`)
- [x] Replace `src/data/signals.js` reads in `SignalsPage.jsx` with a real
      `fetch()` to `GET /api/signals` (proxied via `vite.config.js` →
      `http://localhost:4000`)
- [x] Add loading + error states to `SignalsPage.jsx` for the fetch
- [x] Confirm env var loading (`.env` + `dotenv`) for `DATABASE_URL`
      (`server/.env.example`, loaded via `dotenv/config` in `server.js`)

**Known gap carried forward:** `SignalCard`'s "Direct this Reel" button only
works for the two signals with matching mocked storyboards
(`quantum-gps`, `solid-state`); the other 4 seeded signals show the button
disabled, same as before. This clears itself in M3 when project creation
is real. `frontend/src/data/signals.js` still supplies `swatchSets` (visual
placeholders — Stage D/Pexels replaces these) and the client-side
`categories` list, `frameworks`, and `storyboards` mock, all untouched.

---

## M1 — Suggested signal feed (Stage A, part 1)
**Status:** Not started
**Sources locked in:** RSS + Hacker News API + arXiv API (all free)

- [ ] Build `rssScraper.js` (Nature, ScienceDaily, MIT Tech Review, IEEE Spectrum)
- [ ] Build `hackerNewsClient.js` (official API, no key — pull top/new stories, use points+comments as heat input)
- [ ] Build `arxivClient.js` (official API, no key — pull recent papers by category)
- [ ] Write the server-side heat-scoring formula combining all three (post frequency / HN points / paper recency — see BUILD_PLAN §6.1)
- [ ] Generate `why_reasoning` server-side from the actual score delta
- [ ] Tag each row with `source_type` and `source_reliability` on insert
- [ ] Write cron job (`node-cron`) to run all three scrapers every 4 hours
- [ ] Store merged, de-duplicated results into `signals` with `origin = 'suggested'`
- [ ] Verify `SignalsPage` renders real scraped signals end-to-end

---

## M2 — Search signals (Stage A, part 2)
**Status:** Not started
**Sources locked in:** combined cascade — arXiv/Semantic Scholar → Tavily → Brave Search (see BUILD_PLAN §6.2)

- [ ] Build `semanticScholarClient.js` (free, no key — paper search by keyword)
- [ ] Build `tavilyClient.js` (`TAVILY_API_KEY`, 1,000 free queries/mo)
- [ ] Build `braveSearchClient.js` (`BRAVE_API_KEY`, 2,000 free queries/mo)
- [ ] Build shared `sourceCascade.js`:
  - [ ] Run all three sources in parallel per query
  - [ ] Tag every result with its `source_reliability` tier (`peer_reviewed` / `ai_search` / `general_web`)
  - [ ] Dedupe by URL + near-duplicate title
  - [ ] Rank merged results: tier first, then recency/relevance within tier
- [ ] `GET /api/signals/search?q=` — calls `sourceCascade.js`, returns same shape as suggested signals
- [ ] Persist only the signal the user actually selects (not every search result)
- [ ] Add search input to `SignalsPage.jsx` (near the category pills)
- [ ] Wire search input to the new endpoint, reuse `SignalCard` with no changes
- [ ] Handle empty/no-result search state in the UI

---

## M3 — Research stage (Stage B)
**Status:** Not started
**Depends on:** `sourceCascade.js` from M2 (reused here, not rebuilt)

- [ ] Build `researchService.js`: fetch full source text, then call `sourceCascade.js` for cross-referencing lookups
- [ ] Ensure every supporting fact keeps its `source_reliability` tag through to the brief
- [ ] Write Gemini Call 1 prompt (research brief — see BUILD_PLAN §5) with strict JSON schema, including tiered `sources[]`
- [ ] `POST /api/projects { signalId }` creates project (`status = researching`) and kicks off the brief
- [ ] `GET /api/projects/:id/research` polls status/result
- [ ] Store `research_summary`, `research_sources` (with reliability tags), `monetization_flags` on `projects`
- [ ] New frontend component `ResearchProgress.jsx` — shows a short "reading source → cross-checking → brief ready" sequence
- [ ] Wire "Direct this Reel" click to `POST /api/projects`, then show `ResearchProgress` while polling

---

## M4 — Guided setup stage (Stage C)
**Status:** Not started

- [ ] `GET /api/projects/:id/setup/suggestions` — returns AI defaults (length, framework, tone, audience) + reasoning, reusing the research brief
- [ ] `POST /api/projects/:id/setup` — saves user's confirmed (or overridden) choices
- [ ] Write the monetization-guardrail logic: if top-fit framework has a flag, fall back to next-best safe option and say why (BUILD_PLAN §7)
- [ ] New frontend component `SetupPanel.jsx`:
  - [ ] Script length pill row (15/30/45/60s), pre-selected
  - [ ] Framework cards (reuse `FrameworkPanel.jsx` styling), pre-selected + reasoning
  - [ ] Tone pill row, pre-selected
  - [ ] Audience level pill row, pre-selected
  - [ ] "Continue to storyboard" action → `POST /api/projects/:id/setup`
- [ ] Insert Setup as a stage between Research and Storyboard in `StoryboardPage.jsx`'s tab stepper

---

## M5 — Storyboard generation + live preview fix (Stage D)
**Status:** Not started

- [ ] Write Gemini Call 3 prompt (scene generation), parameterized by confirmed length/framework/tone from M4
- [ ] `POST /api/projects/:id/generate-scenes` — runs Gemini, then `pexelsService.js` for 5 B-roll options/scene
- [ ] `GET /api/projects/:id/scenes` — returns scenes + assets
- [ ] Wire `StoryboardPage.jsx`'s Storyboard tab to real data (replace mocked `storyboards` object)
- [ ] **Fix the live-preview gap:** lift `selected` swatch state out of `StepCard.jsx` into `StoryboardPage.jsx` as `selectedAssetByScene`
- [ ] Pass `selectedAssetByScene` into `PhonePreview.jsx` so it renders the actually-chosen asset for the active scene, not just the default `thumb`
- [ ] `PATCH /api/scenes/:id/select-asset` — batch-called once when the user moves into Finalize (not per click)

---

## M6 — Voice + synced captions
**Status:** Not started

- [ ] Build `ttsService.js` (ElevenLabs or OpenAI TTS), request word-level timestamps
- [ ] Store `audio_url` + `word_timestamps` on `project_scenes`
- [ ] Upgrade `PhonePreview.jsx` from static caption to real `<audio>`-driven word highlighting

---

## M7 — Rendering
**Status:** Not started

- [ ] Add Remotion to the project
- [ ] Build a `<Composition>` consuming a project's scenes (text, chosen B-roll, audio, timestamps)
- [ ] Set up Redis + BullMQ render queue
- [ ] `POST /api/projects/:id/render` — enqueues job
- [ ] `GET /api/projects/:id/render-status` — polling endpoint
- [ ] Wire Finalize stage's "Publish pack" button to queue → poll → success state

---

## M8 — Finalize & export (Stage E)
**Status:** Not started

- [ ] Build `exportService.js` — bundles final MP4 URL, generates `.srt` from `word_timestamps`, generates plain-text script
- [ ] `GET /api/projects/:id/export` — returns `{ mp4Url, srtUrl, scriptTxtUrl, seoCaption }`
- [ ] Rework `PreviewPanel.jsx` into the Finalize view:
  - [ ] Download MP4 button
  - [ ] Download captions (.srt) button
  - [ ] Copy SEO caption button
  - [ ] Download script (.txt) button

---

## M9 — Direct-to-Facebook publish (optional, last)
**Status:** Not started

- [ ] Set up Meta Graph API app + long-lived Page access token
- [ ] Build publish endpoint for direct video upload
- [ ] Gate this behind M7/M8 being solid in production use

---

## Notes / decisions log

_Use this space to record any decision that changes the plan, with a date,_
_so the reasoning isn't lost. Example:_

- `2026-08-26` — Confirmed 4-stage guided setup (length/framework/tone/audience) instead of framework-only; updated BUILD_PLAN §1 Stage C and added M4.
- `2026-08-27` — Locked source strategy: suggested feed = RSS + Hacker News API + arXiv (all free); search & research share one priority-ranked cascade = arXiv/Semantic Scholar → Tavily → Brave Search, ranked so peer-reviewed sources always outrank general web on the same claim. Bing Search API and Google Custom Search ruled out (retired/sunsetting). Updated BUILD_PLAN §1, §3, §6 and TASK M1–M3.
- `2026-08-27` — M0 complete: `/server` scaffolded (Express + Prisma/MySQL),
  all 5 tables modeled in `schema.prisma`, `signals` seeded with 6 rows,
  `GET /api/signals` live, `SignalsPage.jsx` fetches real data with
  loading/error states. Repo is now split into `frontend/` + `server/` at
  the root. Migration + seed still need to be run locally against a real
  MySQL instance (see `server/README.md`) — not runnable in the sandbox
  that produced this change.
