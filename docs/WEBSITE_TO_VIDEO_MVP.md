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


## Batch 2A: report quality and concept-to-Setup handoff

Additive improvement to the current MVP: no schema migration, no standalone video pipeline, and no changes to Signals/Own Topic.

- Resolve the business name from a short og:site_name if available, otherwise the public domain. Show the cleaned original website headline separately.
- Improve saved reports at API read time. Old analyses do not require recrawling, and the original website passages and source URLs remain intact.
- Generate specific concept labels for sampled products/services and show hook, audience, focus, CTA and source pages before creation.
- Selecting Create Video still creates the existing owned Voxora project, with a ResearchSession/Source/Evidence/Claim graph marked business-published.
- Store source-specific researchSources.websiteMarketing metadata: brand, chosen concept, hook, focus, CTA, audience and supporting website pages.
- Open the existing /storyboard/:id?stage=setup route for subsequent setup, storyboard, narration, preview and MP4.
- Marketing storyboard creation and scene rewrites use this chosen campaign; normal Signals/Own Topic prompts remain unchanged.

### Validation

Backend: node --test test/websiteToVideo.test.js test/websiteToVideoMvp.test.js test/websiteBatch2A.test.js test/generationPerformanceMonitoring.test.js
Frontend: npm run test:unit && npm run build

After deployment, reopen the previously completed Coderra analysis. The main heading should now be Coderra instead of the repeated homepage headline. Select AISO or another sourced product concept, verify the existing Setup screen opens, then confirm the generated script stays focused on that concept. Claims remain business-published and must be reviewed before advertising.


## Batch 2B.1 — brand-grounded marketing visual production

Website marketing projects now use public site image candidates plus generated branded design cards. Normal Signals and Own Topic continue using Pexels. No schema migration.

- Website analysis now captures a brandKit containing the site name, public theme color where present, same-site PNG/JPEG/WebP candidates, page attribution, logo candidates and rights warnings.
- Previously completed reports derive brandKit on read without recrawling.
- Selected ideas copy brandKit into researchSources.websiteMarketing, with visualSourcePolicy=website_brand_first and allowStock=false.
- Generate Scenes creates one local 720x1280 PNG per website scene using FFmpeg text and shape layers and, when validated, a same-site product image. If that image is unusable, draw a branded layout without Pexels.
- Protected render-asset PNG files live under storage/render-assets/<projectId>/scenes/<sceneId>.png and are referenced in existing SceneAsset URL fields. Remotion renders these with Img; regular stock clips still use OffthreadVideo.
- scene.customization.sceneVisualPlan records the brand, source page, artwork mode, stockUsed=false, palette provenance and asset-rights warning.
- Scene rewrite and Regenerate Visuals keep the website brand-first policy, including for existing marketing storyboards.
- Website research UI shows image candidate counts and whether theme colors were observed or the neutral fallback palette is in use.

### Deliberate limits

This batch produces programmatically composed promotional still images, NOT AI-model-generated images or full browser screenshots. AI-image variants and safe isolated browser screenshot capture are future work. A public URL does not prove commercial usage rights; the customer must review claims and assets before publishing.

### Validation

Backend: node --test test/websiteToVideo.test.js test/websiteToVideoMvp.test.js test/websiteBatch2A.test.js test/websiteVideoProjectCreate.test.js test/websiteBrandVisuals.test.js test/generationPerformanceMonitoring.test.js
FFmpeg smoke (isolated API image): node scripts/smokeWebsiteBrandedVisual.js
Frontend: npm run test:unit and npm run build

After deployment, open the existing Coderra CommOps storyboard. Use Regenerate Visuals on a scene, confirm the branded still appears without stock, then verify the preview and rendered MP4 use the same image. Keep research, website analyses and both render queues idle during API redeployment.


## Batch 2B.2 — optional Gemini-generated brand scene artwork

**Purpose:** fix the doubled heading/CTA text seen in the OREL IT storyboard and add AI illustrations that follow the selected product/service rather than generic stock photography. Existing Signals/Own Topic and ordinary stock B-roll are not modified.

### Features

- Website marketing scene PNGs are text-free backgrounds. Remotion alone renders the real brand label and synchronized narration captions. No headings, CTA or pseudo-dashboard text is embedded in generated artwork.
- Explicit user action **Generate AI brand image** on each website scene, or **Generate AI visuals for all scenes** sequentially; existing narration and scene timing stay unchanged.
- Generation prompts derive from the selected campaign, brand palette, scene purpose, and cited public website facts. Embedded website instructions are untrusted. Prompt forbids invented product UI, awards, claims, prices, fake logos, text, and words, and reserves the lower 30% for captions.
- An approved same-site public product image may optionally be sent to Gemini as a visual reference. If no image is accessible, prompt-only generation still works. Users must verify commercial reuse rights.
- Image generation uses Google Gemini generateContent with responseModalities IMAGE and 9:16 imageConfig. Supported models are gemini-3.1-flash-lite-image (default) and gemini-3.1-flash-image. The earlier gemini-2.5-flash-image has been retired and must not be used.
- Provider returns inline image bytes, never arbitrary external URLs. Bytes are MIME/header-validated and limited to 8 MiB, probed for safe dimensions, then converted to local 720x1280 PNG by FFmpeg. Existing authenticated render-assets and Remotion Img playback remain intact.
- If generation is rate-limited, fails, or returns invalid imagery, Voxora creates a text-free branded local layout. `sceneVisualPlan.aiStatus = fallback` and a safe code explain this; no Pexels fallback.
- Generation is **OFF by default**, requires a valid backend GEMINI_API_KEY and a separate Lightsail opt-in, and records provider/model/duration telemetry without inventing spend.
- Billable image requests are rate-limited across all scenes for each account/IP (12 requests per 10 minutes by default). A single AI image is requested per scene; bulk UI calls the one-scene endpoint sequentially.

### Deployment and safety

The production API has `env_file: ./server/.env` and is configured via Compose interpolation using `.env.lightsail`. The Gemini key stays in `server/.env`; the enabling flag is in `.env.lightsail` and is passed explicitly to the API service:

```env
VOXORA_MARKETING_AI_IMAGES_ENABLED=true
VOXORA_MARKETING_IMAGE_MODEL=gemini-3.1-flash-lite-image
VOXORA_MARKETING_IMAGE_TIMEOUT_MS=45000
```

Do not put API keys in Vite/frontend variables or commit secrets. The default is `false`. This changes production billing behavior and should be enabled explicitly for a controlled test only. Any generated illustration must be reviewed before commercial publication; generated visuals are creative representations, not photographic evidence of the business's products.

Test in an isolated API container first:

```sh
node --test test/websiteToVideo.test.js test/websiteToVideoMvp.test.js test/websiteBatch2A.test.js test/websiteVideoProjectCreate.test.js test/websiteBrandVisuals.test.js test/websiteAiBrandImages.test.js test/generationPerformanceMonitoring.test.js
node scripts/smokeWebsiteBrandedVisual.js
node scripts/smokeWebsiteAiVisual.js
```

The AI smoke uses local mock output and makes **no paid provider calls**. Verify frontend `npm run test:unit` and the production build separately. Only merge/deploy with queues idle. Then verify brand artwork on OREL IT, the AI-enabled status endpoint and a single live Gemini scene before any full-storyboard image generation.
