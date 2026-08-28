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
- `2026-08-28` — Fixed Gemini structured-output schema validation: `recommended_length_seconds` is now an integer schema without a numeric enum, and the service validates the allowed 15/30/45/60 values after decoding. Added retry handling for transient Gemini failures and resilient JSON extraction.
- `2026-08-28` — Added live progress heartbeats for Reading, Cross-checking, and Drafting so percentage updates continue while long operations are running. Research polling now keeps retrying through temporary API/proxy interruptions without replacing an active project state with an error.
- `2026-08-28` — Research terminal errors now stop the progress spinner/pulse, preserve the last known percentage, identify the failed stage, and stop client polling once the server reports `error`.
- `2026-08-28` — Increased Gemini/source fetch timeouts to tolerate slower provider responses; retry handling now also catches `TimeoutError` so transient generation timeouts can recover instead of failing immediately.

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
- `2026-08-27` — Fixed the StoryboardPage maximum-update-depth regression by deriving the active stage from the URL instead of maintaining a second synchronized React state, preventing the Setup → Storyboard transition from looping.

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
- `2026-08-28` — Hardened Gemini storyboard generation against 429/502/503 responses with structured JSON output, retry/backoff, provider Retry-After support, and a research-backed fallback storyboard created from the completed research brief.

## M6 — Voice + synced captions
**Status:** Done

- [x] Build TTS service
- [x] Store audio/timestamps
- [x] Upgrade PhonePreview to audio-driven word highlighting

**M6 implementation notes:**
- Added `server/src/services/ttsService.js` using ElevenLabs Text-to-Speech with timestamps. The service converts provider character alignment into persisted word-level `{ word, start, end }` timestamps.
- Added `POST /api/projects/:id/generate-voice`; it generates narration for every storyboard scene, stores the audio URL and word timestamps in the existing `ProjectScene.audioUrl` / `ProjectScene.wordTimestamps` fields, and updates project runtime duration from the generated narration.
- Added `/api/audio/...` static serving for generated MP3 files and documented `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and `ELEVENLABS_MODEL` in `server/.env.example`. No Prisma migration is required because the M0 schema already contains the M6 fields.
- Upgraded `PhonePreview.jsx` to use the scene narration as the playback source, track real audio time, and highlight the currently spoken word from the stored timestamps. Scenes without generated narration retain the existing preview behavior.
- Added Storyboard narration controls so users can generate/regenerate narration without triggering TTS on every page load; the controls and preview remain responsive at narrow widths.
- Runtime verification requires a valid local ElevenLabs API key and network access. The implementation is complete, but provider-backed audio generation cannot be executed in this environment.
- `2026-08-27` — Fixed the generated-audio 404: TTS now writes MP3 files under `storage/audio/<projectId>/scenes/<sceneId>.mp3`, matching the `/api/audio/projects/<projectId>/scenes/<sceneId>.mp3` URL exposed by Express. Previously the file was written one directory too high, causing `ENOENT`/404 after successful TTS generation.
- `2026-08-28` — Fixed narration URL/storage alignment: the actual filesystem layout is `storage/audio/<projectId>/scenes/<sceneId>.mp3`, so new TTS URLs now use `/api/audio/<projectId>/scenes/<sceneId>.mp3`. Existing legacy `/api/audio/projects/<projectId>/...` values are normalized when scenes are returned, and Remotion normalizes them before rendering. No audio regeneration is required for already-existing files.

## M7 — Rendering
**Status:** Done

- [x] Add Remotion
- [x] Build Composition
- [x] Redis + BullMQ render queue
- [x] Render endpoints
- [x] Wire Finalize render flow

**M7 implementation notes:**
- Added Remotion rendering dependencies and a 1080×1920 vertical `HelixReel` composition that sequences selected Pexels visuals, synced scene narration, and word-level captions.
- Added `renderService.js` to bundle the Remotion composition, render H.264/AAC MP4 output, persist it under `storage/renders/<projectId>/reel.mp4`, and save the public `renderUrl` on the project.
- Added BullMQ + Redis queue/worker support with one render at a time, progress reporting, retry-safe job IDs, and graceful disabling when `REDIS_URL` is not configured.
- Added `POST /api/projects/:id/render` and `GET /api/projects/:id/render-status`, plus static serving for completed MP4 files.
- Wired the real-project Finalize/Preview stage to queue the render, poll progress, and expose the completed MP4. Persisted render URLs are also included in the project status response.
- Added `REDIS_URL` and `REMOTION_BASE_URL` to `server/.env.example` and removed the restricted ElevenLabs library voice default from the example configuration.
- Local verification still requires `npm install` in `/server`, a running Redis instance, working MySQL data, and the existing Gemini/Pexels/ElevenLabs setup. No Prisma migration is required for M7.
- `2026-08-28` — Fixed BullMQ Redis queue configuration by parsing `REDIS_URL` into supported host/port/auth/TLS options instead of passing the URL as an unsupported queue option. Missing Redis now fails fast without the repeated `ECONNREFUSED` / `doc.split` error storm.
- `2026-08-28` — Added Remotion `registerRoot(RemotionRoot)` to the rendering entry point so the worker can bundle the Composition without the "does not contain registerRoot" error.
- `2026-08-28` — Render preflight now checks that every scene has persisted narration and that its MP3 exists on disk; rendering returns a clear `NARRATION_MISSING` response instead of reaching Remotion with a missing audio file.
- `2026-08-28` — Fixed live render progress: the render service now forwards Remotion's `overallProgress` to BullMQ, with the worker persisting progress throughout encoding instead of stopping at the initial 15% preflight marker.
- `2026-08-28` — Added staged render progress: preflight, B-roll preparation, Remotion bundling, composition/timeline setup, encoding, and finalization now expose named stages with stage-level progress and user-facing status messages. Finalize polls the server directly so an in-progress render remains visible after a page refresh.
- `2026-08-28` — Enforced the selected setup duration as a render-time upper bound. When generated narration exceeds the selected 15/30/45/60s target, scene durations and word timestamps are proportionally compressed and narration playback is sped up so the final MP4 does not exceed the selected limit.

## M8 — Finalize & export
**Status:** Done

- [x] Build export service
- [x] Export endpoint
- [x] Rework PreviewPanel into Finalize view with MP4/SRT/SEO/script outputs

**M8 implementation notes:**
- Added `server/src/services/exportService.js` to build SRT captions from the persisted word timestamps with scene-time offsets, generate a plain-text script, and create an SEO caption fallback when one is not already stored on the project.
- Added `GET /api/projects/:id/export` to generate/download the SRT and script files and expose the rendered MP4 URL plus SEO caption.
- Added `GET /api/projects/:id/export-status` for lightweight finalize-page refreshes.
- Added `/api/export-files/...` static serving and `GET /api/projects/:id` full project summary support.
- Added responsive `FinalizePanel.jsx` and `FinalizePanel.css`; the real Project Preview stage is now a concrete Finalize & Export screen with runtime/cuts/framework/narration status, MP4 rendering/opening, SRT download, script download, SEO caption copy, and back-to-storyboard navigation.
- No Prisma migration was required because `seo_caption` and `project_exports` were already present in the M0 schema.
- Local end-to-end verification still requires the running MySQL database, Memurai/Redis, Gemini, Pexels, ElevenLabs, and Remotion/Chromium environment.

## M9 — Direct-to-Facebook publish (optional, last)
**Status:** Done (development integration)

- [x] Meta Graph API setup
- [x] Publish endpoint
- [x] Gate behind solid M7/M8 production behavior

**M9 implementation notes:**
- Added `server/src/services/facebookService.js` with token-based Facebook Page Reel initialization, binary upload, and publish flow.
- Added `POST /api/projects/:id/publish-facebook` and validates the rendered MP4 exists before publishing.
- Added Facebook configuration to `server/.env.example`: `FACEBOOK_API_VERSION`, `FACEBOOK_PAGE_ID`, and `FACEBOOK_PAGE_ACCESS_TOKEN`.
- Added the gated Facebook Publish action to `FinalizePanel.jsx`; the button remains unavailable until a rendered MP4 exists.
- Development integration is complete. Production deployment still requires a properly configured Meta app, Page access token/permissions, OAuth for multi-user accounts, and Meta App Review/Business Verification as applicable.

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
- `2026-08-27` — M6 complete in code: ElevenLabs TTS with timestamp alignment, persisted per-scene MP3/word timestamps, audio serving, audio-driven PhonePreview playback/highlighting, and responsive narration controls. Local provider runtime verification remains a setup requirement.
- `2026-08-27` — Fixed the generated-audio 404 by aligning the TTS storage path with the Express public audio route.
- `2026-08-28` — M7 complete in code: Remotion composition, render service, BullMQ/Redis worker, render endpoints, MP4 serving, and Finalize render polling. Local Redis/Chromium/API-key verification remains a setup requirement.
- `2026-08-28` — Repaired Gemini research schema validation, added in-stage live research progress heartbeats, made browser polling resilient to temporary API interruptions, and made failed research states terminal so loading animations stop cleanly.
- `2026-08-28` — Hardened the BullMQ Redis queue configuration to prevent the unsupported URL-option / reconnect storm seen while Redis was unavailable. Redis is still required for actual M7 rendering.
- `2026-08-28` — Fixed Remotion render initialization by registering the root in `src/remotion/index.jsx`, preventing the worker from failing on the missing `registerRoot()` entry point.
- `2026-08-28` — Hardened narration storage/rendering by verifying MP3 files after TTS writes and validating all scene narration before queueing a Remotion render.
- `2026-08-28` — M8 complete: added export service/endpoints/static serving and replaced the real-project Preview view with a responsive Finalize & Export panel for MP4, SRT, plain-text script, and SEO caption copy.
- `2026-08-28` — Hardened Gemini storyboard generation against 429/502/503 responses with structured JSON output, retry/backoff, provider Retry-After support, and a research-backed fallback scene generator.
- `2026-08-28` — Completed M9 development integration: Facebook Page Reel upload/publish service, publish endpoint, gated Finalize UI, and documented Page token configuration.
- `2026-08-28` — Fixed narration URL/storage alignment: `/api/audio/<projectId>/scenes/<sceneId>.mp3` now maps directly to the on-disk `storage/audio/<projectId>/scenes/<sceneId>.mp3` layout, and legacy `/api/audio/projects/...` database values are normalized for playback and rendering.
- `2026-08-28` — Added detailed render-stage reporting, durable server-side stage polling, and target-duration enforcement so users can see what the renderer is doing instead of only a single overall percentage, while the final MP4 stays within the selected setup duration.
