# Testing Voxora while GPU TTS is not configured

The GPU service is not ready yet. Use this command to validate the other API capabilities before deploying:

```bash
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml \
  run --rm --no-deps --entrypoint npm api run test:core
```

`npm run test:core` explicitly excludes **only** `server/test/ttsFallback.test.js`, which checks the legacy ElevenLabs/Qwen fallback behavior. That test suite will remain in the full `npm test` until the standalone GPU/TTS setup and intended provider behavior are reconciled. This is not evidence that TTS works.

## Non-TTS changes addressed

- Research corpus-only response checks now use Voxora branding rather than legacy Helix text.
- Research cancellation status is not incorrectly inferred from the absence of an in-memory controller.
- Research source-reader failures are recorded as unreadable/failed sources instead of aborting every research request. Explicit user cancellation still aborts the request.
- Research conversation formatting assertions track the current repair call and verify a pure Markdown formatter with behavior checks.
- Source-based frontend contract tests skip with an explicit explanation when executed from the **backend-only** Docker image (which contains no `/frontend`). They run when a complete monorepo checkout is available.

## Release checklist

1. Back up MySQL before applying new migrations or updating production containers.
2. Rebuild API and frontend images: `docker compose ... build api frontend`.
3. Run the above `test:core` command. Confirm **zero failures**; a few explicitly labelled frontend-source skips are expected only in the backend-only image.
4. Validate the actual frontend by building it and opening policy pages and account/signup flows in a browser. The API test command does not exercise the browser.
5. Check startup logs for Prisma migration success and verify API health.
6. When the GPU server is ready, configure its URL/token, review the current four-engine TTS architecture, replace old ElevenLabs-based tests with expectations matching the deployed architecture, and restore a passing full `npm test`.

**Do not replace `npm test` with a permanently reduced suite.** This temporary command communicates the unconfigured TTS dependency explicitly.
