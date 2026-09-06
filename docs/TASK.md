# Helix — Task & Milestone Tracker

> Living tracker. `BUILD_PLAN.md` remains the source of truth for product/architecture changes.

**Status legend:** `Not started` · `In progress` · `Blocked` · `Done` · `Deferred`

## Baseline — M0 through M8
**Status:** Done

Backend wiring, signal feed/search, research, guided setup, storyboard/live preview, narration/captions, Remotion rendering, and Finalize/export are complete.

## M9 — Direct-to-Facebook publish
**Status:** Deferred (development integration only)

- [x] Meta development integration, publish endpoint, and Finalize gate
- [ ] Production OAuth / multi-user publishing
- [ ] Meta App Review / Business Verification
- [ ] Production publishing UX

**Decision:** do not expand Facebook production work until separately approved.

## M10 — Accounts & Authentication
**Status:** Done — implementation complete; acceptance QA remains

- [x] Users/session/token tables and Prisma migration
- [x] Sign-up/sign-in/sign-out, persistent sessions, password reset, verification
- [x] Profile/settings and authenticated workspace routes
- [x] Ownership protection for project/media/render/export resources
- [x] Secure cookie/session and CSRF strategy
- [x] Development auth fallback explicitly isolated
- [x] Production authentication requirement
- [x] Rate limiting for expensive provider operations
- [ ] Final cross-user verification with multiple real accounts

## M10A — Public Discovery, Responsive Navigation & Theme System
**Status:** Done — implementation complete; browser QA remains

- [x] Public Signals landing/search/filter and auth-gated Direct this Reel
- [x] Authenticated greeting/My Research/account menu/mobile navigation
- [x] Persistent light/dark theme and theme toggles
- [x] Sign-in/sign-up UX and safe redirects
- [ ] Browser QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440
- [ ] Production-auth verification
- [ ] Remaining hard-coded color audit

## M11 — Advanced Video Editor Core — Separate Workspace
**Status:** Done — implementation complete; acceptance QA remains

- [x] Protected `/editor/:id` route and responsive editor shell
- [x] Independent ProjectEditor persistence/versioned APIs
- [x] Non-destructive Storyboard initialization
- [x] 9:16 preview, multi-track timeline, select/move/trim/split/delete/reorder
- [x] Captions, overlays, music, waveform/audio playback
- [x] Zoom/ruler/snap/scrub/keyboard controls and bounded undo/redo
- [x] Touch controls, Remotion-safe effects/transitions, Jamendo integration
- [x] My Research entry and ownership protection
- [ ] Loading/error/empty-state QA
- [ ] Verify Storyboard source immutability
- [ ] Full browser viewport QA

## M12 — Media Library & Upload Pipeline
**Status:** Done — implementation complete; runtime acceptance QA remains

- [x] Project-owned media model/APIs, upload validation/progress/storage/cleanup
- [x] Search/filter/grid/metadata/thumbnails/posters
- [x] Pexels imports, 720px proxies, restart recovery
- [x] Editor picker, orphan/temporary/derived cleanup, ownership enforcement
- [ ] Representative runtime upload validation

## M13 — Editor Rendering Integration & Reliability
**Status:** Done — implementation/reliability complete; runtime acceptance QA remains

- [x] Canonical ProjectEditor timeline consumed by HelixEditorReel
- [x] Timing/audio/caption/overlay/transition/effect support
- [x] Authenticated media resolution, preflight, ownership/state validation
- [x] Render telemetry, version/hash/url/error metadata, stale-render protection
- [x] Retry-safe queue, ffprobe validation, worker recovery, automated coverage
- [ ] Real browser timeline parity
- [ ] Uploaded/local media playback in worker
- [ ] Caption/audio synchronization
- [ ] Full real-MP4 render regression

## M14 — AI Editing Assistant
**Status:** Done — implementation complete; browser/runtime acceptance QA remains

- [x] Protected AI editor workspace and structured suggestion endpoint
- [x] Reversible trim/move/split/delete/caption/volume/overlay/B-roll/narration operations
- [x] Preview validation, version-safe apply, undo, reasoning summaries
- [x] Storyboard/media immutability, locked narration protection, deterministic overlay IDs
- [x] Instruction/operation bounds, rate limiting, activity records, automated acceptance coverage
- [ ] Real browser suggest → preview → apply → undo
- [ ] Storyboard preservation and rate-limit runtime verification

## M15 — Versions, Templates & Review Workflow
**Status:** Done — implementation complete; browser/integration acceptance QA remains

- [x] Version snapshots/history/restore and optimistic conflict protection
- [x] Project duplication with scene/asset/timeline remapping
- [x] Reusable templates, ownership, safe apply/remapping
- [x] Public review links, expiry/revocation/listing, reviewer comments/resolution
- [x] Activity/history and project ownership enforcement
- [x] Productivity/review UI and automated acceptance coverage
- [ ] Browser/integration verification
- [ ] Concurrent-session conflict verification
- [ ] Representative duplication/public-review QA
- [ ] Responsive/mobile QA

## M16 — Platform Publishing Abstraction & Analytics
**Status:** Not started

- [ ] Platform-neutral publish manifest
- [ ] Publish job/history model and generic destination adapter
- [ ] Publish status/retry handling
- [ ] Export metadata and basic analytics
- [ ] Publishing history in My Research

**Explicit exclusion:** Facebook production OAuth/multi-user Meta publishing remains deferred under M9.

## M17 — Deep Research Intelligence Engine — New Product Capability
**Status:** In progress — Phase 2 core and passage/adjudication refinement implemented; runtime verification remains

**Product goal:** replace basic “search → summarize” with a source-grounded deep research workflow that plans research, discovers diverse sources, reads source content, extracts evidence, verifies claims, surfaces contradictions, scores reliability, and produces a detailed research intelligence brief for downstream video creation.

### Phase 1 — Research Engine Foundation
- [x] Dedicated deep research orchestration service
- [x] Multi-lane planning: definition, mechanism, evidence, data, counter-evidence, recent developments
- [x] Targeted multi-query discovery, deduplication, quality-prioritized reading
- [x] Actual source reading with bounded extraction/read-status tracking
- [x] Evidence corpus supplied to synthesis rather than search metadata alone
- [x] Structured brief: executive summary, mechanism, findings, data, disagreements, gaps, reliability, safe/unsafe claims, creative opportunities
- [x] Detailed Research progress and brief UI

### Phase 2 — Verification & Evidence Graph
- [x] First-class persisted ResearchSession / ResearchPlan / ResearchSource / ResearchEvidence / ResearchClaim / ResearchVerification / ResearchConflict records
- [x] Claim → source and claim → evidence relationships with fallback provenance mapping
- [x] Independent-domain corroboration and separate authority/relevance/evidence-quality/recency/independence/transparency scores
- [x] Source read/accessibility status and explicit unread/unavailable handling
- [x] Claim confidence and traceability persisted separately from source authority
- [x] Research graph API protected by project ownership
- [x] Research Brief provenance UI with claim/source/evidence inspection
- [x] Evidence-index attachment for major findings
- [x] Deterministic contradiction detection and evidence adjudication foundation
- [x] Exact passage extraction with source-relative offsets and claim-linked evidence indexes
- [x] Model-assisted contradiction adjudication with deterministic fallback and explicit method/status
- [ ] Runtime verification with representative research topics

### Phase 3 — Professional Research Brief
- [x] Persistent research graph foundation
- [x] Executive summary, evidence boundaries, what happened / why it matters / how it works
- [x] Key findings, important numbers, conflicts, gaps, source-quality/reliability, safe/unsafe claims, creative angle
- [x] Enforce 8–15 evidence-backed findings at synthesis schema level
- [x] Improve exact passage extraction and provenance quality
- [ ] Research corpus reusable by Storyboard and future AI workflows

### Phase 4 — Interactive Research Workspace
- [ ] Live source discovery stream
- [ ] Source reading/evidence extraction activity
- [ ] Live finding cards with confidence indicators
- [ ] Click-through evidence inspection and source comparison
- [ ] Contradiction/evidence resolution workspace
- [ ] Research metrics/provenance dashboard
- [ ] Targeted re-run without discarding existing corpus

### Phase 5 — Research Memory & Follow-up
- [ ] Persist complete corpus independently of final brief
- [ ] Corpus-grounded follow-up questions
- [ ] Incremental research focused on knowledge gaps
- [ ] Brief regeneration without repeating verified research
- [ ] Pass verified claims/evidence directly into Storyboard generation

### M17 Quality Gates
- [ ] No unsupported factual claim presented as established
- [x] Major claims can be linked to source/evidence records when evidence exists
- [x] Conflicting evidence is explicitly represented rather than silently averaged
- [x] Source authority and claim confidence remain separate
- [x] Unreadable/inaccessible sources are marked unverified
- [ ] Research depth validated across science, technology, current events, and controversial claims
- [ ] Regression tests for deduplication, reading failures, malformed model output, provider failure, partial completion

## Cross-milestone quality gates
- [ ] `npm run lint` — zero warnings/errors
- [ ] `npm run build` succeeds
- [ ] Responsive QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440
- [ ] No horizontal overflow/inaccessible controls
- [ ] Destructive actions use modern Helix confirmation dialog
- [ ] No generated content committed under `server/storage/`
- [x] Authenticated endpoints enforce ownership
- [x] Long-running operations expose meaningful progress states
- [x] Refresh/reconnect preserves persisted editor/render state
- [ ] Real rendered media remains playable/correctly timed
- [ ] New migrations verified against local MySQL
- [ ] Error states are actionable
- [ ] Core Signals → Research → Setup → Storyboard → Preview/Finalize regression tested
- [ ] Advanced Editor preserves Storyboard/narration data
- [ ] M14 end-to-end browser regression
- [ ] M15 end-to-end browser regression
- [ ] M17 representative-topic regression

## Current execution focus
```text
1. M17 runtime verification across representative topics
                         ↓
2. M17 corpus persistence/reuse by Storyboard + AI workflows
                         ↓
3. M17 interactive research workspace
                         ↓
4. M17 research memory + follow-up
                         ↓
5. Synchronize BUILD_PLAN.md / FINAL_QA.md
                         ↓
6. Start M16 Publishing/Analytics when approved

M9 Facebook production → DEFERRED / separate product decision
```

## Decisions log
- `2026-08-28` — Baseline M0–M8 remains complete; M9 Facebook production publishing is deferred.
- `2026-08-28` — Real accounts/authentication and a dedicated advanced video editor are the next-level platform direction.
- `2026-08-28` — Advanced Video Editor is a standalone feature/workspace, not a required core-flow step.
- `2026-08-28` — Editor may reuse current scenes, visuals, narration, timestamps, captions, and Remotion capabilities but must not mutate source workflow data.
- `2026-08-28` — Editor state is persisted independently from Storyboard data.
- `2026-08-29` — M13 editor rendering/reliability implementation completed; real-media runtime validation remains.
- `2026-08-30` — M14 AI editor assistant and M15 versions/templates/review workflow implemented with ownership and acceptance coverage.
- `2026-09-05` — M14 and M15 marked Done — implementation complete; browser/runtime acceptance remains; M16 remains not started.
- `2026-09-06` — M17 Deep Research Intelligence Engine approved and started. Phase 1 uses targeted multi-lane discovery, actual source reading, evidence-aware synthesis, richer reliability metadata, and a detailed research workspace/brief.
- `2026-09-06` — M17 Phase 2 evidence graph persistence, claim provenance, verification dimensions, and deterministic conflict adjudication foundation implemented. Next work is exact passage-level evidence and stronger adjudication.
- `2026-09-06` — M17 exact source-relative passage extraction, 8–15 finding synthesis constraints, and model-assisted contradiction adjudication were implemented with deterministic fallback and explicit provenance.

**Implementation reference:** use NotebookLM-style source grounding/inspectability and modern Deep Research patterns for iterative planning, discovery, reading, cross-checking, and progress visibility. Do not copy proprietary UI or behavior directly.
