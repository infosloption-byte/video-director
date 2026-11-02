# Website to Video — MVP (feature branch)

## Scope

This is a new *entry point*, not a replacement for Signals or Own Topic.
Workflow: **URL → bounded website discovery → source-linked report →
suggested video concepts → Research/Setup → Storyboard → Narration → Render**.

Sidebar entry: **Website to Video**. Authenticated routes:
- Frontend: `/website-to-video`, `/website-to-video/:id`
- Backend: `POST /api/website-analyses`, `GET /api/website-analyses`,
  `GET /api/website-analyses/:id`, `POST /api/website-analyses/:id/retry`,
  `POST /api/website-analyses/:id/videos` with body `{ "ideaId": "service-explainer" }`.

The API creates an analysis with 202 Accepted and returns an ID immediately.
The browser polls to show progress. Completed findings are stored in
`website_analyses.report` (a user-owned JSON snapshot), so users can
return later without re-crawling. One website report can produce several
**different** video projects, one per recommended concept.

## Extraction

Only public, static HTML pages on the supplied host and its www equivalent.
Attempts public `/robots.txt`, then optional `/sitemap.xml`, homepage and
internal links. Caps: **20 readable pages**, up to 55 attempted URLs,
600 KB response, 10 second individual request timeout, 145 second
overall crawl limit, five fresh analyses/user/rolling 24 h. Lists inaccessible
pages as warnings; does not claim complete site coverage.

Extracts page titles, descriptions, headings, content highlights,
published prices, promotion snippets, business emails, phones,
social links and image *references*. Each page and video concept links
back to its source. Product/service classification uses page names,
paths and headings as MVP heuristics; a page may be misclassified.
Price and offer details are **not independently verified**.

Website content and linked media are untrusted. Never publish invented
promotions, customer results, testimonials or claims. Source images are
not automatically licensed to use in exported advertisements.

### Security constraints

- Accept only public HTTP(S) FQDN, standard ports, no credentials or raw IP.
- DNS A/AAAA must all be public; pin outbound TCP connection to the
  validated IP to mitigate DNS rebinding.
- Same-host or www-canonical redirects only; reject cross-domain,
  private network, unsupported schemes, URL credential injection and
  HTTPS downgrade redirects.
- Bounded page size, request time and crawl breadth; skip admin/login/cart
  routes and binary assets.
- Respect published robots exclusions. Under RFC 9309, a 4xx response to
  robots.txt means the rules are unavailable; the MVP may read public pages
  and flags this limitation for 401/403 and other non-404/410 cases.
  A 429 rate-limit is treated conservatively as blocked, as are 5xx,
  network, DNS and TLS failures. An explicit Disallow rule is respected.
- Authenticated, email-verified creation, account-scoped saved reports,
  rate limiting and rolling daily quota.
- Prisma `website_analyses.user_id` cascades on account deletion.
- Website text is not trusted as instructions to the AI; marketing
  storyboard prompt grounds claims only in saved website evidence.

## Existing pipeline reuse

Selecting a recommended video creates a **normal Voxora Project** with
a `WEBSITE_MARKETING` signal, researchSummary, researchSources and
a persisted ResearchSession/Source/Evidence/Claim graph. The user moves
to the existing `/research/:projectId` → Setup → Storyboard workflow.
No new renderer is introduced and GPU EC2 containers are untouched.

Business-published evidence is marked `website_sourced`, **not**
independently verified. The marketing storyboard and AI scene rewrite
have business-specific instructions; the science-reel fallback is
disabled for this project type to avoid fabricated promotional text.

## Testing

PR includes a dedicated GitHub Actions workflow:
- `cd server && npx prisma validate`
- `cd server && node --test test/websiteToVideoMvp.test.js test/generationPerformanceMonitoring.test.js`
- `cd frontend && npm run test:unit && npm run build`

### Production rollout (AFTER review and merge only)

1. Check both render queues and active research flags are zero.
2. Confirm no new generation requests will start while redeploying.
3. Back up MySQL (`mysqldump`, gzip, verify file).
4. Pull merged `main` onto Lightsail and build API + frontend images.
5. Deploy `api frontend` with existing Lightsail Compose; entrypoint applies
   additive migration `20261102190000_website_to_video_mvp`.
6. Confirm `/api/health`, previous Signals and Own Topic, and new
   `/website-to-video` page. Then test against a small public site.
7. Verify video creation creates a persisted research graph, setup works,
   storyboard uses marketing-specific script, and audio/video rendering
   follows the unchanged existing pipeline.

Do not deploy until CI has passed and production workers are idle.

## MVP limitations / subsequent enhancements

- HTML parsing is deliberately lightweight. Some script-rendered
  websites, complex e-commerce collections or dynamic pricing will not
  be completely extracted; surface partial results instead of guessing.
- Recommendations are deterministic evidence-based templates; actual
  marketing scripts use Voxora's existing Gemini storyboard generation.
  A later enhancement can add AI-aided site taxonomy and an owner-approved
  brand kit, after the source-grounding and crawler safety baseline is tested.
- The report does not crawl competitors or estimate market performance.
- No external advertising analytics or automated publication is added.
- No changes to Lightsail→GPU rendering location in this branch.
