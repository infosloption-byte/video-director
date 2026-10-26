# Voxora Frontend Test Isolation, Hooks and Bundle Fixes

This batch follows the 38/38 passing post-checkout browser tests on 26 Oct 2026. It does **not** change Paddle, render quotas, subscription webhook processing, Node API or Prisma migrations.

## Issues from the Lightsail logs

1. **7 React/ESLint warnings:** `VoiceProfilesPage.jsx` had state updates called from a mount effect, stale closure-based draft URL cleanup, preview URL ref cleanup, and a missing dependency. `SceneCustomizePanel.jsx` reset local editing draft via synchronous effects and had missing whole-scene dependencies. `onboarding.js` used an intentional control-character regex that lint warned about.
2. **Vite proxy `ECONNREFUSED 127.0.0.1:4000`:** On reaching the workspace from a mocked payment/auth browser test, some late background fetches were incorrectly forwarded to the non-running local backend. No actual payment test failed. Playwright now starts a dedicated Vite server with `VOXORA_E2E_MOCK_API=true`, which disables that proxy **only for locally mocked tests**. Normal Vite development still proxies `/api` to the Node backend. Reusing an existing, possibly misconfigured Vite server at port 5179 is disabled.
3. **Oversized JS entry chunk (~651 KB):** Heavy editor, research, billing, profile, marketing and confirmation screens are now loaded with `React.lazy` and an accessible session loading fallback. Vite should produce separate dynamic chunks instead of requiring all workspace modules up front. Inspect the actual `npm run build` output for bundle sizes before declaring the warning fixed.
4. **Locally changed npm lockfiles:** Existing `frontend/package-lock.json` is locally modified, and `frontend/e2e/package-lock.json` was generated as an untracked file by `npm install` on the Lightsail host. These are **not** test failures. Preserve or review those changes before switching branches; do not delete them blindly.

## Implementation notes

- `VoiceProfilesPage`: abortable initial API request, no stale state updates after navigation, latest draft audio URL released on component unmount, preview URLs captured in a stable cleanup container; still refreshes profiles after cloning.
- `SceneCustomizePanel`: editing state initialized when the relevant scene revision changes rather than synchronized through a chain of `setState` calls in an effect.
- `onboarding.js`: validation still rejects backslashes and ASCII control characters using numeric character codes.
- `frontend/e2e/tests/voiceSmoke.spec.js`: additional desktop and mobile browser test of the voice library without an active TTS/GPU service.

## Testing in the existing Lightsail checkout

First verify the current working tree. If the two generated lockfiles need preserving, stash **only** those files (including untracked):

```bash
cd /opt/apps/voxora
git status --short
git stash push -u -m "Save local npm lockfiles before frontend verification" -- frontend/package-lock.json frontend/e2e/package-lock.json
git fetch origin
git switch --track origin/fix/frontend-test-isolation-hooks-and-bundle-20261026

cd frontend
npm run test:unit
npm run lint
npm run build
npm run test:e2e
```

After validation, return to main and restore your local lockfile changes if desired:

```bash
cd /opt/apps/voxora
git switch main
git stash list
# Only run 'git stash pop' after identifying your own intended stash.
```

Do not use `git reset --hard` or `git clean -fd` to resolve lockfile differences.

The test runner uses **mocked APIs**; it does not make sandbox purchases, and therefore is safe to run without a TTS worker or local backend.

## Acceptance criteria

- All frontend unit tests pass (previously 7).
- Frontend lint has **0 errors and 0 warnings** from the previously affected components; review any remaining messages.
- Production Vite build succeeds and reports route-based chunks; check whether any individual chunk still exceeds Vite's threshold.
- Auth/payment browser tests remain green (previously 38). The new voice library smoke test runs on desktop and mobile, bringing the planned total to **40 browser tests**.
- No `ECONNREFUSED 127.0.0.1:4000` messages from the mocked browser-test Vite server.
- Manually confirm plan selection, payment result screen (15-second pause/resume), workspace navigation and scene customization still work.

## Deployment after review and green tests

Frontend only; no database/API changes.

```bash
cd /opt/apps/voxora
git pull --ff-only origin main
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d --no-deps frontend
```

This document does not claim runtime tests were run by the code-authoring tool. Lightsail results are the merge gate.
