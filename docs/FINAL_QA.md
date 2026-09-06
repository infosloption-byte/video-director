# Helix — Final QA & Release Readiness

This document records the final hardening/QA pass after M0–M8 implementation. M9 Facebook publishing remains a development integration only and is intentionally deferred for a later product decision.

## Current implementation status

- M0–M8: implemented and marked Done in `TASK.md`.
- M9: development integration exists, but production Facebook publishing is intentionally deferred.
- M10–M15: implementation complete; browser/integration acceptance remains.
- M16: not started.
- M17: Deep Research Intelligence Engine implementation complete; runtime acceptance remains.
- Generated server files under `server/storage/` are ignored by Git and must remain local runtime data.

## M17 implementation QA coverage

The M17 implementation includes:

- Multi-lane research planning, targeted discovery, source reading, evidence extraction, and structured synthesis.
- Persisted research sessions, plans, sources, evidence, claims, verification, and conflict records.
- Exact source-relative evidence offsets/locators and claim-linked provenance.
- Separate source-authority and claim-confidence scoring.
- Deterministic contradiction detection plus optional model-assisted adjudication with fallback.
- Live research activity, confidence-backed finding cards, evidence inspection, and source comparison.
- Research corpus metrics and provenance dashboard.
- Protected corpus memory and grounded follow-up questions that explicitly report corpus gaps.
- Focused research reruns that create a new session while retaining prior corpus history.
- Brief regeneration from stored research without repeating external research.
- Direct persisted-corpus grounding for Storyboard generation, with unverified claims excluded from factual grounding.

Automated M17 regression coverage is present for representative science/technology/current-events/controversial briefs, unread sources, invalid provenance, reading failures, malformed model/provider fallback, contradiction adjudication, 8–15 finding enforcement, and source-relative evidence linkage.

## Static responsive audit

The current frontend has explicit responsive handling for the main surfaces:

| Area | Responsive behavior reviewed |
| --- | --- |
| Signals | Search stacks on very narrow screens; signal cards collapse to one column below tablet width; category pills wrap. |
| Research | Research title/progress row stacks below 640px; long text is allowed to wrap; finding/evidence panels collapse to single-column layouts on narrow screens. |
| Setup | Choice pills wrap; primary action becomes full width below 640px. |
| Storyboard | Two-column phone/content layout collapses below 900px; preview width scales down at 768/480/380px; tabs remain full width and compact. |
| Finalize | Summary becomes two columns below 800px; export cards become one column; render/progress headers stack. |
| My Research | Project cards collapse to one column below 820px; filter controls collapse below 620px; narrow card content wraps. |
| Shared header | Header height and spacing reduce on small screens; the Reel badge is hidden below 380px to preserve navigation space. |
| Research workspace | Finding cards, evidence inspector, source comparison, metrics, follow-up form, and conflict controls all collapse without horizontal overflow. |

## Required browser matrix

Run the full workflow at each viewport and confirm there is no horizontal page scrolling, clipped text, inaccessible controls, or oversized media.

`375 × 812`

`390 × 844`

`425 × 844`

`480 × 875`

`640 × 875`

`768 × 875`

`1024 × 768`

`1440 × 900`

## Workflow regression checklist

1. Signals loads from `/api/signals`.
2. Category filtering works.
3. Search returns results and empty-state handling works.
4. `Direct this Reel` creates a project and opens Research.
5. Research progresses through planning, discovery, reading, verification, synthesis, and Ready.
6. Live Research activity shows source discovery, reading, verification, and persistence events while the job is running.
7. Temporary API/proxy failures do not replace an active research job with a false terminal error.
8. Research failure stops the loading animation and polling cleanly.
9. Continue to Setup opens the Setup stage directly.
10. Setup selections persist and Storyboard opens without an update-depth loop.
11. Storyboard generation loads scenes and five visual choices per scene.
12. Storyboard generation receives the persisted research corpus and does not treat unverified claims as factual grounding.
13. Visual selection updates the phone preview immediately and persists on Finalize entry.
14. Narration generation stores MP3 files under `server/storage/audio/<projectId>/scenes/` and playback resolves those files.
15. Render requires narration for every scene before queueing.
16. Redis/BullMQ worker remains a dedicated process for long-running renders.
17. B-roll downloads are cached locally before Remotion encoding.
18. Render progress exposes overall percentage plus named stages and nested B-roll progress.
19. Render elapsed time and ETA remain visible during the job and survive page refreshes.
20. Remotion renders at the intended vertical 9:16 composition and preserves natural narration speed.
21. Completed MP4 URLs resolve to `server/storage/renders/<projectId>/reel.mp4`.
22. Finalize exposes MP4, SRT, script, and SEO outputs.
23. My Research lists prior projects, supports filtering, opens the saved workflow, and deletes projects with a modern confirmation dialog.
24. Shared navigation exposes My Research exactly once on each applicable page.
25. Native browser `alert()`/`confirm()` dialogs are not used by the current frontend flow.
26. Research follow-up answers show exact stored evidence when available and explicitly refuse to invent answers when the corpus has no relevant evidence.
27. Research conflict controls preserve unresolved cases or mark them adjudicated with a stored resolution.
28. Focused research reruns create a new versioned research session without deleting prior sessions.
29. Brief regeneration revalidates the stored corpus without external research.

## Local verification commands

From `frontend/`:

```powershell
npm install
npm run lint
npm run build
```

From `server/`:

```powershell
npm install
npm run dev
```

In a second terminal:

```powershell
cd C:\wamp\www\html\helix\server
npm run render:worker
```

For backend automated coverage:

```powershell
cd C:\wamp\www\html\helix\server
npm test
```

Redis/Memurai must be listening on `127.0.0.1:6379` for the render worker.

## M17 runtime acceptance

The implementation is committed, but these environment-dependent checks still require the local Windows/runtime environment:

- Successful live research against representative science, technology, current-events, and controversial topics.
- Gemini/provider behavior under real credentials and network conditions.
- Persisted research-session creation and multi-version focused reruns against the local MySQL database.
- Browser inspection of the Research workspace and responsive evidence panels at the full viewport matrix.
- End-to-end Signals → Research → Setup → Storyboard → Preview/Finalize regression after the M17 changes.

The GitHub commit status for the M17 completion commit currently reports no configured CI status checks, so automated runtime/build success has not been independently established by GitHub Actions.

## Known environment requirements

- MySQL database with the Prisma schema/migrations applied locally.
- Gemini API key/model configured.
- Pexels API key configured.
- ElevenLabs credentials configured for narration.
- Memurai/Redis available for BullMQ rendering.
- Remotion/Chromium dependencies installed in the server project.
- External provider/network access for live research, search, B-roll, and narration generation.

## Deliberately deferred

### Facebook production integration

The existing M9 implementation is retained as a development integration. Production OAuth, multi-user account management, Meta App Review, Business Verification, and the final publishing UX are intentionally deferred until the product direction for publishing is decided.

Do not expand M9 production scope during general QA unless explicitly requested.
