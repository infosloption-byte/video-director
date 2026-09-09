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
- [ ] Browser QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440 px
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
**Status:** Done — implementation complete; runtime acceptance remains

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
- [x] Research corpus reusable by Storyboard and future AI workflows

### Phase 4 — Interactive Research Workspace
- [x] Live source discovery stream
- [x] Source reading/evidence extraction activity
- [x] Live finding cards with confidence indicators
- [x] Click-through evidence inspection and source comparison
- [x] Contradiction/evidence resolution workspace
- [x] Research metrics/provenance dashboard
- [x] Targeted re-run without discarding existing corpus

### Phase 5 — Research Memory & Follow-up
- [x] Persist complete corpus independently of final brief
- [x] Corpus-grounded follow-up questions
- [x] Incremental research focused on knowledge gaps
- [x] Brief regeneration without repeating verified research
- [x] Pass verified claims/evidence directly into Storyboard generation

### M17 Quality Gates
- [ ] No unsupported factual claim presented as established
- [x] Major claims can be linked to source/evidence records when evidence exists
- [x] Conflicting evidence is explicitly represented rather than silently averaged
- [x] Source authority and claim confidence remain separate
- [x] Unreadable/inaccessible sources are marked unverified
- [x] Research depth regression coverage exists for science, technology, current-events, and controversial briefs
- [x] Regression tests cover deduplication, reading failures, malformed model output, provider failure, partial completion, and contradiction adjudication

## M17R — Research Workspace Refinement & Acceptance
**Status:** In progress

**Goal:** refine the Research page from a feature-complete research dashboard into a clear, trustworthy, responsive research workspace without adding unnecessary product complexity.

### Phase R1 — Information hierarchy & visual refinement
- [x] Establish a stronger page hierarchy: progress → executive brief → key findings → evidence → sources/review → creative/action
- [x] Reduce competing card treatments and excessive visual density
- [x] Make the executive summary the primary reading surface
- [x] Improve section headings, supporting labels, spacing rhythm, and scanability
- [x] Preserve the global non-editor page spacing rules; do not reintroduce unwanted outer page padding
- [x] Keep Advanced Video Editor layout behavior unchanged

### Phase R2 — Research progress & activity UX
- [x] Replace/augment the dense progress presentation with a clear research pipeline: planning → discovering → reading → verifying → resolving → synthesizing → ready
- [x] Clearly distinguish current activity from completed activity history
- [x] Improve loading, retry, failed-source, and partial-completion states
- [x] Surface useful progress context without overwhelming the user

### Phase R3 — Evidence & trust UX
- [x] Make finding confidence, evidence strength, and verification status immediately understandable
- [x] Improve evidence inspector hierarchy around claim → confidence → supporting passages → sources → conflicts
- [x] Make unread/unavailable/contradictory evidence visibly unverified
- [x] Improve source quality presentation across authority, evidence quality, relevance, recency, independence, and transparency
- [x] Ensure unsupported claims never visually read as established facts

### Phase R4 — Workspace actions & downstream flow
- [x] Make Ask Helix, follow-up, rerun, regenerate, and conflict-resolution actions clearer and less competing
- [x] Add/strengthen a primary “Continue to Storyboard” path after research acceptance
- [x] Preserve corpus-grounded behavior for Ask Helix, follow-ups, reruns, regeneration, and Storyboard handoff
- [x] Make the Research → Setup → Storyboard lineage explicit in the guided setup UI: the same persisted research corpus remains the factual foundation while setup controls presentation choices
- [x] Keep the Storyboard Research stage aligned with the dedicated Research report so both entry points expose the same persisted research details

### Phase R5 — Responsive & accessibility QA
- [ ] Validate Research at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440 px
- [ ] Remove horizontal overflow and inaccessible controls at compact widths
- [ ] Verify keyboard focus, button semantics, tab navigation, and screen-reader labels
- [ ] Review dark/light theme contrast and disabled/error states
- [x] Use the shared modern scrollbar treatment consistently

### Phase R6 — Runtime acceptance
- [ ] Test representative science, technology, current-events, and controversial research topics
- [ ] Verify live activity polling reaches terminal state cleanly
- [ ] Verify exact evidence/source inspection after refresh
- [ ] Verify contradiction resolution and confidence updates
- [ ] Verify Ask Helix answers only from persisted research corpus and clearly marks unsupported answers
- [ ] Verify focused rerun retains prior corpus and regeneration does not repeat external research unnecessarily
- [ ] Verify Storyboard receives only readable, non-unverified research grounding
- [x] Add automated acceptance contracts for corpus-only Ask Helix behavior, Storyboard grounding filters, rerun/regeneration retention, research memory/metrics/conflict APIs, and polling terminal-state guards
- [x] Add branch CI workflow for server tests plus frontend lint/build; live/browser runtime acceptance remains intentionally unmarked until a real runtime run is available

**Refinement order:** R1 → R2 → R3 → R4 → R5 → R6.

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
- [ ] M17 runtime representative-topic regression

## Current execution focus
```text
1. M17 runtime acceptance across representative topics
                         ↓
2. M17R Research Workspace refinement
                         ↓
3. Cross-milestone lint/build/browser QA
                         ↓
4. Synchronize BUILD_PLAN.md / FINAL_QA.md
                         ↓
5. Start M16 Publishing/Analytics when approved

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
- `2026-09-06` — M17 persisted research corpus is reusable by Storyboard generation and the AI editor; a protected corpus endpoint exposes normalized sources, passages, claims, verification, and conflicts.
- `2026-09-06` — M17 interactive research activity now streams plan/search/source-reading/verification events into the Research workspace while the job is running, with a bounded activity history retained in the in-memory research job.
- `2026-09-06` — M17 finding cards now expose confidence indicators and open a source/evidence inspection workspace with exact passages, source metrics, and two-source comparison.
- `2026-09-06` — M17 research memory now persists the complete normalized corpus, supports corpus-grounded follow-up questions, focused reruns that retain prior sessions, and brief regeneration without repeating external research.
- `2026-09-06` — M17 research conflict review and provenance metrics are exposed in the Research workspace with protected APIs.
- `2026-09-07` — M17R Research Workspace Refinement added as the next focused workstream. Refinement prioritizes information hierarchy, progress/activity clarity, evidence trust UX, downstream actions, responsive/accessibility QA, and runtime acceptance before M16.
- `2026-09-08` — M17R R2 compacted the live research pipeline and activity history so progress remains visible without dominating the workspace.
- `2026-09-08` — M17R R3 strengthened finding trust hierarchy, separated verification confidence from model confidence/evidence strength, made unread sources explicitly non-evidence, and exposed six source-quality dimensions in the evidence inspector.
- `2026-09-08` — M17R R4 clarified accepted-report actions, added a primary Continue to Storyboard path, exposed focused rerun and brief regeneration controls, and added persisted unresolved-conflict review controls.
- `2026-09-08` — M17R downstream handoff UX now explicitly explains that Setup does not replace or regenerate research: the Storyboard is generated from the same persisted project research corpus, while length/framework/tone/audience control presentation.
- `2026-09-09` — M17R aligned the Storyboard `stage=research` view with the dedicated Research report, removed the guided setup panel width cap, and gave Ask Helix an explicit opaque surface so research details and assistant interactions remain readable across both entry points.
- `2026-09-09` — M17R R1 visual refinement pass strengthened Research report hierarchy, promoted the executive brief reading surface, reduced visual competition between cards, improved responsive section behavior, and added a shared modern scrollbar treatment without changing the Advanced Video Editor layout.

**Implementation reference:** use NotebookLM-style source grounding/inspectability and modern Deep Research patterns for iterative planning, discovery, reading, cross-checking, and progress visibility. Do not copy proprietary UI or behavior directly.
