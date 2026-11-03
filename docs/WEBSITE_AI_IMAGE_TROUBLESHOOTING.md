# Website to Video: Gemini image generation diagnosis

This page is for operators debugging Website to Video storyboard imagery. A PNG returning HTTP 200, or a healthy API/Redis/MySQL container, **does not prove** that an AI image was generated.

## Which button actually calls Gemini?

**Important:** New Website-to-Video storyboards initially get one **free local FFmpeg starter placeholder** per scene. These are not Gemini images, even when Gemini is enabled. The storyboard now shows an explicit count of verified Gemini AI images versus placeholders.

- **Refresh local brand layout**, **Refresh local brand layout (not AI)** and **Replace all stock with branded visuals** generate *text-free local FFmpeg branded layouts*. These are useful no-provider fallbacks, not AI imagery.
- **Generate AI brand image** explicitly requests one potentially billable Gemini image for one scene.
- **Generate AI visuals for all scenes** asks for confirmation before sequential billable requests and skips already-successful AI scenes; failed explicit requests retain previous artwork.
- All marketing scene cards now show **Gemini AI-generated illustration**, **local FFmpeg branded layout**, or **AI image not generated** with a safe fallback reason. The scene editor shows the same provenance.

The original narration, scene duration and ordering remain unchanged by image regeneration. Do not interpret AI concept art as a factual screenshot, a verified business claim, or a license to reuse third-party marks.

## Production configuration

From `/opt/apps/voxora`, in **`.env.lightsail`**:

```dotenv
VOXORA_MARKETING_AI_IMAGES_ENABLED=true
VOXORA_MARKETING_IMAGE_MODEL=gemini-3.1-flash-lite-image
```

Keep `GEMINI_API_KEY` in `server/.env` (the API container's `env_file`), **not** in the frontend, screenshots or shared issue logs. The model key must have access and quota for image generation. Turning on a feature flag alone does not verify it.

To check model accessibility **without requesting or paying for image generation**, after deployment run:

```bash
sudo docker exec voxora-api-1 node scripts/checkMarketingImageModel.js
```

A response such as `{"ok":true,"code":"MODEL_ACCESSIBLE","model":"gemini-3.1-flash-lite-image"}` means the API key can access the Models API entry. It **does not** guarantee an available image quota, a successful generated image, or visual quality. Error codes such as `IMAGE_AUTH_FAILED` or `IMAGE_MODEL_UNAVAILABLE` should be resolved before attempting a paid image.

For higher-quality imagery, an operator may explicitly choose `VOXORA_MARKETING_IMAGE_MODEL=gemini-3.1-flash-image` in `.env.lightsail` and recreate the API. This model can cost more; do not silently change customer billing.

After merging and deploying the approved code, recreate the API to apply changed environment variables (without disturbing the DB or Redis):

```bash
cd /opt/apps/voxora
sudo docker compose -p voxora --env-file .env.lightsail \
  -f docker-compose.lightsail.yml up -d --no-deps --no-build --force-recreate api
```

Inspect only safe, non-secret environment values:

```bash
sudo docker exec voxora-api-1 sh -c \
  'echo "AI enabled: ${VOXORA_MARKETING_AI_IMAGES_ENABLED:-false}; model: ${VOXORA_MARKETING_IMAGE_MODEL:-default}"; if [ -n "$GEMINI_API_KEY" ]; then echo "Gemini key present"; else echo "Gemini key missing"; fi'
```

## The image model has no free API tier

As of November 2026, Google lists **no free API tier** for
`gemini-3.1-flash-lite-image` (the default Voxora image model).
A configured key and a successful `checkMarketingImageModel.js` result do not
prove that the project has paid generation quota: the Model lookup can succeed
even when `generateContent` returns HTTP 429.

Before retrying, select the **same Google Cloud project** that owns the key in:
- [Google AI Studio Billing](https://aistudio.google.com/) — verify paid API tier,
  sufficient credits, and no project spend cap or account restriction.
- [Google AI Studio Rate Limits](https://aistudio.google.com/rate-limit) —
  check the model's RPM, RPD and image quota for that project.

If the provider returns a structured 429 error, Voxora now exposes only a
sanitized `quotaReason`: `FREE_TIER_ZERO`, `DAILY_LIMIT`,
`MINUTE_LIMIT`, `SPEND_LIMIT` or `UNKNOWN`, plus an optional
`retryAfterSeconds`. Do not paste your Google API key or an unredacted
provider response into chat or issue trackers. Zero free-tier quota cannot
be solved by immediate retries or by creating a second key for the same project.
Never switch to a more expensive image model automatically.

## Lowest-risk live verification

1. With production background operations idle, open an existing **Website to Video** storyboard and one scene's **Customize scene** editor.
2. Click **Generate AI brand image** (not Refresh local brand layout), confirm the paid request, and wait for its result.
3. Check the scene's visual provenance. **Gemini AI-generated illustration** means the model output was validated, converted to the authenticated PNG and persisted. If an explicit paid request fails, the API returns a classified error and preserves the existing scene artwork (no silent replacement). Previously saved fallback artwork remains visibly labeled.
4. Check the fallback codes without exposing the key or raw provider response:

```bash
sudo docker logs --since=15m voxora-api-1 2>&1 | \
  grep -E '\[marketing-image\]|storyboard.website_ai_image|Scene visual regeneration failed'
```

| Code | Meaning / next investigation |
| --- | --- |
| `IMAGE_AUTH_FAILED` | API key invalid or key lacks image-model access (401/403). |
| `IMAGE_MODEL_UNAVAILABLE` | Model unsupported for account or unavailable on endpoint (404/invalid selection). |
| `IMAGE_PROVIDER_REJECTED` | Provider rejected the request (400); review supported API request shape. |
| `IMAGE_RATE_LIMITED` | Quota/rate limit (429); check billing and usage before more calls. |
| `IMAGE_TIMEOUT` | Provider request exceeded time budget. |
| `IMAGE_NO_OUTPUT` | Provider responded but returned no usable image part. |
| `IMAGE_INVALID_RESPONSE` / `IMAGE_INVALID_OUTPUT` | Unexpected provider format or image bytes. |
| `BAD_IMAGE_DIMENSIONS` | Image dimensions failed validation. |
| `BAD_IMAGE_ASPECT_RATIO` | Image is not sufficiently close to portrait 9:16; no aggressive crop accepted. |
| `BAD_IMAGE_OUTPUT` | FFmpeg output failed basic PNG signature/size checks. |
| `IMAGE_PROVIDER_ERROR` / `IMAGE_GENERATION_UNAVAILABLE` | Provider/server or conversion issue; review sanitized logs and FFmpeg availability. |

Avoid full-storyboard AI generation until one paid per-scene test shows **Gemini AI-generated illustration**. Gemini may charge for a request even when conversion or persistence fails.

## Non-billable regression tests

```bash
npm --prefix frontend run test:unit
npm --prefix frontend run build
node --test server/test/websiteAiBrandImages.test.js
```

Unit tests use an injected fake provider and never call live Gemini. This change requires no Prisma migration. Release through the pull request and do not recreate production API/frontend services until the tests and change review are complete.

## Scene relevance and image-quality safeguards

- If a concept has multiple approved source pages, the scene title, narration and visual search text are used to match the correct product/service page; an unrelated product image is no longer chosen solely by scene position when the subject can be identified.
- Gemini uses a common brand palette and visual treatment but different deterministic compositions for hook, feature and closing scenes. Prompts use facts from the selected approved product page rather than indiscriminately mixing facts across products. The image prompt now requires a recognizable service-relevant subject, realistic materials, natural environment and photographic depth, explicitly rejecting placeholder rectangles, flat gradients and template cards.
- Public-site logo files are not sent as Gemini visual reference images. This does not waive the customer's responsibility to review rights for separately used source imagery.
- The generated source image must have supported dimensions and a portrait aspect ratio approximately matching 9:16. The converted output must be a nontrivial PNG file. Explicit paid scene requests now return a safe error code and **preserve the previous scene artwork** on failure; existing fallback-mode callers can still opt into labeled local branded artwork.
- For bulk AI generation, a shared authorization/model/quota/request rejection stops remaining paid requests instead of repeatedly attempting scenes. The already completed scenes remain saved.
- These safeguards verify input relevance rules, technical image validity and failure behavior, **not** artistic quality or factual accuracy. Review the first real produced scene on the website, in the storyboard, and in a rendered preview before using bulk generation.
