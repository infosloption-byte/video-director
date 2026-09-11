# Helix — Task & Milestone Tracker

> Living tracker. `BUILD_PLAN.md` remains the source of truth for product/architecture changes.

**Status legend:** `Not started` · `In progress` · `Blocked` · `Done` · `Deferred`

## Baseline — M0 through M8
**Status:** Done

Backend wiring, Signals/search, Research, Setup, Storyboard/live preview, narration/captions, rendering, and Finalize/export are complete.

## M9 — Direct-to-Facebook publish
**Status:** Deferred (development integration only)
- [x] Meta development integration, publish endpoint, and Finalize gate
- [ ] Production OAuth / multi-user publishing
- [ ] Meta App Review / Business Verification
- [ ] Production publishing UX

## M10 — Accounts & Authentication
**Status:** Done — acceptance QA remains
- [x] Users/session/token tables, auth flows, ownership protection, secure cookie/session/CSRF strategy, development fallback isolation, rate limiting
- [ ] Final cross-user verification with multiple real accounts

## M10A — Public Discovery, Responsive Navigation & Theme System
**Status:** Done — browser QA remains
- [x] Public Signals landing/search/filter and auth-gated Direct action
- [x] Authenticated navigation, My Research, mobile menu, persistent light/dark theme
- [ ] Browser QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440 px
- [ ] Production-auth verification / remaining hard-coded color audit

## M11–M15 — Advanced Editor, Media, Rendering, AI Editing, Versions & Review
**Status:** Done — browser/runtime acceptance remains
- [x] Separate Advanced Video Editor and independent editor persistence
- [x] Media library/upload pipeline and rendering reliability
- [x] AI editing assistant with reversible operations
- [x] Versions/templates/public review/activity/ownership workflows
- [ ] Representative browser/integration/runtime regressions

## M16 — Platform Publishing Abstraction & Analytics
**Status:** Not started
- [ ] Platform-neutral publish manifest
- [ ] Publish job/history model and generic destination adapter
- [ ] Publish status/retry handling
- [ ] Export metadata, basic analytics, publishing history

## M17 — Deep Research Intelligence Engine
**Status:** Done — runtime acceptance remains
- [x] Multi-lane planning, targeted source discovery, source reading, evidence-backed synthesis
- [x] Persistent research graph: sessions, plans, sources, evidence, claims, verification, conflicts
- [x] Provenance/evidence indexes, contradiction detection and adjudication
- [x] Research memory, corpus-grounded follow-up, focused research, Storyboard grounding
- [ ] Representative runtime verification / remaining quality gates

## M17R — Research Workspace Refinement & Acceptance
**Status:** In progress
- [x] Research hierarchy, executive brief, evidence/trust UX, spacing refinement
- [x] Research pipeline/activity UX and modern scrollbar
- [x] Ask Helix/rerun/regenerate/Storyboard actions and Research → Setup → Storyboard lineage
- [x] Signals page topic-research panel spacing refinement
- [x] Signals desk pagination with server-side page size support
- [x] Signals desk sorting and filter-panel controls with application-styled selectors
- [x] Fixed-height signal cards with scrollable long descriptions/WHY details
- [ ] Responsive QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440 px
- [ ] Accessibility, overflow, theme contrast, representative runtime acceptance

## M18 — User-Directed Research Conversation
**Status:** In progress

**Goal:** let users start from their own topic, explore conversationally, then explicitly build the full evidence-backed research brief from the accumulated conversation before continuing into Research → Setup → Storyboard. This is an interaction layer over the existing deep-research mechanism, not a separate research engine.

### Phase 1 — Signals entry & conversation workspace
- [x] Add “Research your own topic” entry alongside Signals
- [x] Protected `/research/new` topic entry
- [x] Protected `/research-conversation/:id` workspace
- [x] Responsive chat composer, message history, source/evidence indicators
- [x] Container-only chat scrolling so live activity cannot move the whole browser page
- [x] Intelligent auto-scroll that preserves the user's reading position
- [x] Keep Workspace navigation visible on the conversation route instead of switching to Recent research
- [x] Automatically answer the initial topic in the same conversation after opening it
- [x] Show a real in-flight thinking state while the conversation AI request is actually running
- [x] Replace Ask Helix with Stop during an active AI request and restore Ask Helix after cancellation/completion
- [ ] Browser QA for desktop/tablet/mobile conversation layout

### Phase 2 — Conversation-first research lifecycle
- [x] Create the conversation project without automatically launching deep research
- [x] Allow Helix exploration before the evidence pass
- [x] Persist user and Helix exploration messages
- [x] Clearly mark pre-brief responses as exploratory/not verified research
- [x] Add explicit “Build research brief” action
- [x] Scan accumulated conversation context when starting the deep-research pass
- [x] Reuse the existing `researchSignal` mechanism for the full evidence pass
- [x] Keep live discovery/reading/verification/synthesis activity in the same chat
- [x] Insert the completed evidence-backed research response into conversation history
- [x] Make conversation generation server-cancellable through the existing research cancellation path

### Phase 3 — Brief handoff
- [x] Build the brief from the conversation workspace
- [x] Continue to Setup/Storyboard after the persisted corpus is ready
- [x] Preserve the accumulated conversation alongside the brief/corpus
- [ ] Promote conversation questions/direction into an explicit downstream brief section
- [ ] Verify Setup consumes the same corpus without unnecessary duplicate research
- [ ] Verify Storyboard receives only verified/readable conversation-backed evidence

### Phase 4 — Trust & acceptance
- [x] Separate exploratory conversation from verified research
- [x] Keep post-research Ask Helix corpus-grounded
- [x] Persist conversation across refresh/reconnect
- [x] Support unsupported post-research questions with focused research
- [ ] Representative runtime QA across science, technology, current events, and controversial topics
- [ ] Ownership, rate-limit, and failure-recovery runtime verification
- [ ] End-to-end browser regression: conversation → brief → Setup → Storyboard

**Implementation rule:** user-topic research and Signals-origin research converge on the same persisted research corpus. The pre-brief conversation is an exploration/scoping layer and must not become an ungrounded factual research engine.

## Cross-milestone quality gates
- [ ] `npm run lint` — zero warnings/errors
- [ ] `npm run build` succeeds
- [ ] Responsive QA at 375 / 390 / 425 / 480 / 640 / 768 / 1024 / 1440
- [ ] No horizontal overflow/inaccessible controls
- [ ] New migrations verified against local MySQL
- [ ] Actionable error states
- [ ] Signals → Research → Setup → Storyboard → Preview/Finalize regression tested
- [ ] M17 runtime representative-topic regression
- [ ] M18 research conversation end-to-end regression

## Current execution focus
```text
1. M18 conversation-first research lifecycle + browser QA
                         ↓
2. M17 runtime acceptance across representative topics
                         ↓
3. M17R responsive/accessibility/runtime QA
                         ↓
4. Cross-milestone lint/build/browser regression
                         ↓
5. Synchronize BUILD_PLAN.md / FINAL_QA.md
                         ↓
6. Start M16 Publishing/Analytics when approved

M9 Facebook production → DEFERRED / separate product decision
```

## Decisions log
- `2026-09-10` — Standardized dropdown UX across the platform with one accessible, Helix-styled SelectMenu component; native browser dropdowns were removed from the audited frontend surfaces.
- `2026-09-10` — Ownership boundary audit: User owns Project and all project-scoped descendants transitively; Signal remains shared and is never user-owned or globally consumed. Project deletion now uses authenticated session identity rather than request-supplied user IDs.
- `2026-09-10` — Signals are shared topic records, not single-user consumables: Projects bind a user to a Signal, and the same Signal can be reused by many users/projects. Public discovery excludes search-origin topic records and archives only stale suggested feed rows.
- `2026-09-10` — Signal filter selectors use custom Helix-styled menus instead of browser-default dropdown controls.
- `2026-09-10` — Research Conversation is conversation-first: user explores with Helix, then explicitly starts the full deep-research pass from accumulated conversation context.
- `2026-09-10` — Pre-brief conversation guidance is exploratory/not verified; verified factual answers remain downstream of persisted research evidence.
- `2026-09-10` — Completed deep-research results are inserted into the conversation history.
- `2026-09-10` — Research activity scrolling is container-bound and must not force whole-page scrolling.
- `2026-09-10` — Signals desk only exposes fresh suggested rows; user-directed/search-origin research signals remain out of public discovery.
- `2026-09-10` — Refined Signals sort and page-size selectors to match the Helix surface instead of browser-default controls.
- `2026-09-10` — Fixed the conversation entry lifecycle so the initial topic receives a real Helix response instead of leaving the chat visually idle until a second question is sent.
- `2026-09-10` — Fixed the authenticated conversation sidebar to retain Workspace links (Research, Storyboard, Advanced Editor) rather than switching to Recent research.
- `2026-09-10` — Conversation AI calls now expose an actual in-flight thinking state, support Stop/cancellation, and return the composer to Ask Helix after completion or cancellation.
- `2026-09-10` — Signals desk now uses server-side pagination with configurable 6/12/24/48 page sizes and server/client sorting controls inside a dedicated filter panel.
- `2026-09-10` — Signal cards use a stable visual height while long descriptions and WHY details scroll inside their own regions, preventing one verbose signal from stretching the entire feed.

- [x] Platform dropdowns now use the shared Helix SelectMenu instead of browser-native `<select>` controls (Signals, My Research, Editor, Advanced Editor)

- [x] Reworked Signals filter panel hierarchy so Topic filters and Display controls have distinct, balanced sections with responsive stacking

- [x] Signals grid uses 1 column on mobile, 2 on tablet, 3 on desktop, and 4 on wide desktop (>1024px)

- [x] Mobile/tablet sidebar menu toggle now opens and closes reliably, and long account names wrap within the sidebar footer

- [x] Mobile/tablet sidebar header collapse control now closes the open drawer instead of mutating desktop collapsed state or account-footer layout

- [x] Research conversation messages preserve the first character and use explicit normal text rendering/overflow rules to prevent visual clipping
