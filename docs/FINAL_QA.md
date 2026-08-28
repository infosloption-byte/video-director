# Helix — Final QA & Release Readiness

This document records the final hardening/QA pass after M0–M8 implementation. M9 Facebook publishing remains a development integration only and is intentionally deferred for a later product decision.

## Current implementation status

- M0–M8: implemented and marked Done in `TASK.md`.
- M9: development integration exists, but production Facebook publishing is intentionally deferred.
- Generated server files under `server/storage/` are ignored by Git and must remain local runtime data.

## Static responsive audit

The current frontend has explicit responsive handling for the main surfaces:

| Area | Responsive behavior reviewed |
| --- | --- |
| Signals | Search stacks on very narrow screens; signal cards collapse to one column below tablet width; category pills wrap. |
| Research | Research title/progress row stacks below 640px; long text is allowed to wrap. |
| Setup | Choice pills wrap; primary action becomes full width below 640px. |
| Storyboard | Two-column phone/content layout collapses below 900px; preview width scales down at 768/480/380px; tabs remain full width and compact. |
| Finalize | Summary becomes two columns below 800px; export cards become one column; render/progress headers stack. |
| My Research | Project cards collapse to one column below 820px; filter controls collapse below 620px; narrow card content wraps. |
| Shared header | Header height and spacing reduce on small screens; the Reel badge is hidden below 380px to preserve navigation space. |

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
5. Research progress advances through Reading → Cross-checking → Drafting → Ready.
6. Temporary API/proxy failures do not replace an active research job with a false terminal error.
7. Research failure stops the loading animation and polling cleanly.
8. Continue to Setup opens the Setup stage directly.
9. Setup selections persist and Storyboard opens without an update-depth loop.
10. Storyboard generation loads scenes and five visual choices per scene.
11. Visual selection updates the phone preview immediately and persists on Finalize entry.
12. Narration generation stores MP3 files under `server/storage/audio/<projectId>/scenes/` and playback resolves those files.
13. Render requires narration for every scene before queueing.
14. Redis/BullMQ worker remains a dedicated process for long-running renders.
15. B-roll downloads are cached locally before Remotion encoding.
16. Render progress exposes overall percentage plus named stages and nested B-roll progress.
17. Render elapsed time and ETA remain visible during the job and survive page refreshes.
18. Remotion renders at the intended vertical 9:16 composition and preserves natural narration speed.
19. Completed MP4 URLs resolve to `server/storage/renders/<projectId>/reel.mp4`.
20. Finalize exposes MP4, SRT, script, and SEO outputs.
21. My Research lists prior projects, supports filtering, opens the saved workflow, and deletes projects with a modern confirmation dialog.
22. Shared navigation exposes My Research exactly once on each applicable page.
23. Native browser `alert()`/`confirm()` dialogs are not used by the current frontend flow.

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

Redis/Memurai must be listening on `127.0.0.1:6379` for the render worker.

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
