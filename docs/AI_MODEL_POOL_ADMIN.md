# Voxora Platform AI Model Pool — Phase 1C (Admin only)

This adds `/admin/model-pool` and the admin model selection view inside `/admin/pipelines`. It does **not** change the customer workspace execution flow. Production still uses **Voxora Classic**, and `PIPELINE_WORKSPACE_ROLLOUT` must remain unset.

## Admin functions
- Register cloud models: **Google Gemini**, **OpenAI API** (for GPT / ChatGPT-family models), **xAI Grok**, and **OpenRouter** (access to supported third-party model slugs through one API). Model ID is supplied by the administrator; availability depends on the provider account.
- Register **self-hosted OpenAI-compatible chat API** models, with an explicit origin allowed by the server operator. GPU inference gateways with other protocols require future provider adapters.
- Declare capabilities independently: research, storyboard, visuals/video, speech.
- Configure provider key or token through Admin; credentials are encrypted at rest with AES-256-GCM. Admin endpoints never return the plaintext or ciphertext.
- Run **live, billable structured-output tests** for research and storyboard. Independent test history, latency and pass/fail status, and revision-based invalidation of previous successful tests.
- Capabilities are **not** inferred merely from a model's label. Only an enabled model with a current passing relevant capability test appears in that pipeline stage's pool selector.
- Visual/video and TTS verification are **not yet implemented**. These capabilities remain declared but unverified/unselectable.
- Admin pipeline draft saves may reference verified model IDs; **publishing model-assigned definitions is intentionally blocked** until the actual execution adapter exists. Stage contract sandbox remains a simulation, not a full media-generation test.
- Admin sidebar: desktop minimize/expand button, local preference persistence, mobile navigation unaffected.

## Mandatory security configuration

Set a stable 32-byte encryption key in **server/.env**, only on the API host, before registering encrypted credentials:

```bash
openssl rand -hex 32
# Copy the result to:
# AI_POOL_ENCRYPTION_KEY=<the generated 64-character hex string>
```

**Do not store this key in Git, paste it into chat, or expose it through a frontend environment variable.** Keep it backed up in an appropriate secret manager. Losing or changing this key without re-encrypting records renders stored provider credentials unusable.

Existing environment keys are supported when a stored key is absent:
`GEMINI_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`.
The Model Pool does **not** modify the application's existing Gemini environment setting. There is no global provider switch yet.

For self-hosted models, the operator must explicitly allow the service origin in `server/.env`:

```dotenv
AI_POOL_ALLOWED_ORIGINS=https://gpu.example.net,https://other-gpu.example.net:8443
```

Only absolute origins without paths, credentials, query parameters or fragments are allowed. Cloud URLs are fixed, never administered. By default hosted inference **requires HTTPS**. For a trusted private network only, `AI_POOL_ALLOW_INSECURE_HTTP=true` permits HTTP **only to explicitly allowlisted origins**. Requests reject redirects and use a 12-second timeout. Review network egress rules; allowlist DNS domains should be controlled by trusted operators.

The API does not return model responses, tokens, provider error bodies, or secret values in capability reports. Model tests may incur provider charges and should only be initiated intentionally.

## Live capability probes

- **research**: structured JSON response with a non-empty `summary`.
- **storyboard**: structured JSON response with a `scenes[]` array containing narration and visual prompts.
- Providers: OpenAI, xAI and **OpenRouter** use chat-completion-compatible endpoints; Google uses Gemini `generateContent`; self-hosted must expose an OpenAI-compatible `/v1/chat/completions` API.
- OpenRouter uses the fixed endpoint `https://openrouter.ai/api/v1/chat/completions`. Register it as **Cloud API → OpenRouter**, enter a model slug such as `openai/gpt-4o-mini`, and provide a separately encrypted OpenRouter API key or set `OPENROUTER_API_KEY` in `server/.env`. Model selection does **not** guarantee OpenRouter account eligibility or a successful capability test.
- These tests validate basic connectivity and response shape, **not** real-source fact checking, research depth, production performance, copyright, consent, voice quality, GPU capacity, video duration, or provider cost commitments.

## Database and API

Migration: `20261027230000_ai_model_pool`. Creates `ai_pool_models` and `ai_pool_capability_tests`; existing project and render data is unchanged.

All endpoints are protected through `/api/platform-admin` `requireAuth` and `requirePlatformAdmin`:
- `GET /model-pool`: sanitized pool inventory with current verified capabilities and test metadata.
- `POST /model-pool`: register model.
- `PUT /model-pool/:modelId`: modify or disable model, bump revision; previous tests become stale.
- `POST /model-pool/:modelId/test/:capability`: run explicitly triggered live capability test and persist the result.
- `GET /pipelines/catalog`: now includes eligible pool models.
- Pipeline draft update/validation accepts `modelId` only for supported, verified stage capabilities. Publishing and workspace activation remain restricted.

Admin audits identify the model and configuration change **without including credentials**.

## Release validation

Before merge/deployment, run:
```bash
cd server && npx prisma validate && npm run prisma:generate && npm test
cd ../frontend && npm run lint && npm run test:unit && npm run build
```

After backing up MySQL, deploy to staging and verify:
1. Classic active and existing customer functionality unchanged.
2. Add a Gemini model using its existing environment credential; verify API key is never returned.
3. Run one live research test (provider charges may apply); verify pass and stage eligibility.
4. Run one live storyboard test, verify stage eligibility. If a provider/model does not support chat-completion-compatible output, tests may fail until a dedicated adapter is implemented.
5. Register a hosted model using an allowlisted origin. Disallowed origins must be rejected.
6. Change model ID or key; previous passes become stale and the model disappears from the draft pipeline choices until re-tested.
7. Create draft pipeline, choose eligible model; save and run contract simulation. Publishing must **still** be blocked.
8. Verify normal users receive 403 from all model pool routes.
9. Verify sidebar collapse state on desktop and mobile layout.
10. Confirm AI Model Pool API key ciphertext is never exposed via GET, and database backups are access restricted.

**No normal workspace behavior should change as part of this release.**

## OpenRouter verification after deployment

1. Sign in to `/admin/model-pool`, choose **Add AI model → Cloud API → OpenRouter**.
2. Name the model and enter its exact OpenRouter model identifier (for example, `openai/gpt-4o-mini`); choose research and storyboard capabilities.
3. Supply an OpenRouter API key in the encrypted credential field, or keep the field empty if `OPENROUTER_API_KEY` is already configured in `server/.env`.
4. Run each live capability test explicitly (provider billing may apply). Confirm the tested capability appears in the matching `/admin/pipelines` draft selector.
5. Verify invalid API keys fail safely, credential values are never returned in API responses, and non-admin users receive 403.
6. Keep Voxora Classic active and `PIPELINE_WORKSPACE_ROLLOUT` disabled. Model Pool choices remain admin-only until execution adapters are ready.

No Prisma migration is needed for this provider: the existing model pool stores providers as a string identifier.
