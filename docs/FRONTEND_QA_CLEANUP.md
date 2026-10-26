# Voxora — Frontend QA Cleanup (October 26, 2026)

This batch resolves the issues seen during the 38-passing-browser-test run. **No Paddle API, webhook, Prisma migration, TTS server or payment entitlement behavior changes.**

## Issues and resolution

1. **Six React warnings**
   - `SceneCustomizePanel`: previously updated framework, tone, audience, narration, selected voice and asset selection synchronously in a prop-watching effect. The editor now uses a keyed draft component that initializes from source props and is recreated when the meaningful scene inputs change. Modern custom dropdowns are unchanged.
   - `VoiceProfilesPage`: the initial API load is scheduled after mount via a stable callback; generated draft-audio Blob URLs are revoked when changed/unmounted, and the preview-url collection is held in a stable cleanup reference. This fixes stale closures and unmount cleanup issues.
2. **One URL-validation warning**
   - `onboarding.js` still rejects backslashes and ASCII control characters in return URLs, using code-point checks instead of the lint-flagged control-character regular expression. Existing open-redirect unit tests remain.
3. **Spurious Playwright `ECONNREFUSED 127.0.0.1:4000`**
   - The Playwright-launched Vite server sets `VOXORA_E2E_MODE=1`, disables the real `/api` proxy and responds to incidental workspace GET requests for `/api/projects`, `/api/signals` and `/api/health/integrations` using empty local fixtures.
   - All other unmatched browser-test API calls fail with **503** to make missing mocks visible, rather than silently succeeding. No production/development API behavior changes.
   - Playwright refuses external host URLs and does not reuse a Vite server running without test isolation. Added a desktop/mobile browser test verifying workspace loading without Express.
4. **651 KB eager frontend JavaScript**
   - The main routes now lazily load the editor, research, storyboard, voice profiles, settings, billing, signals and project screens via React `lazy`/`Suspense`. Public onboarding and Paddle result pages remain immediately available.
   - The exact new chunk sizes require `npm run build` on the user's environment. Do not hide the Vite warning via a higher threshold.
5. **NPM lockfile diffs**
   - Corrected the **committed** `frontend/package-lock.json` root name from the legacy `helix-app` to the matching `voxora-app`.
   - `frontend/e2e/package-lock.json` is normally generated when installing Playwright. The user's local copy is not available to this PR and should be preserved, not deleted or replaced with an invented lockfile.

## Validate safely on Lightsail

The development checkout currently has modified/untracked lockfiles. **Do not run git reset --hard or git clean -fd.** Preserve them before switching:

```bash
cd /opt/apps/voxora
mkdir -p "$HOME/voxora-lockfile-backups"
cp -p frontend/package-lock.json "$HOME/voxora-lockfile-backups/frontend-package-lock.$(date +%Y%m%d%H%M%S).json"
if test -f frontend/e2e/package-lock.json; then
  cp -p frontend/e2e/package-lock.json "$HOME/voxora-lockfile-backups/e2e-package-lock.$(date +%Y%m%d%H%M%S).json"
fi
git stash push -u -m "Before frontend QA cleanup testing" -- frontend/package-lock.json frontend/e2e/package-lock.json
git fetch origin
git switch --track origin/fix/frontend-test-noise-lint-bundles-20261026
```

Then:

```bash
cd /opt/apps/voxora/frontend
npm run test:unit
npm run lint
npm run build
npm run test:e2e
```

Expected: zero lint errors **and zero warnings**, browser suite baseline of 38 previous cases + 2 isolation cases (desktop/mobile) = **40 passing**, no local backend `ECONNREFUSED` messages, and smaller initial JavaScript chunks. If any warning remains, capture the exact output before merging.

When finished testing:

```bash
cd /opt/apps/voxora
git status --short
git switch main
git stash list
# If desired, restore the specific saved lockfile changes after confirming the stash:
# git stash apply stash@{0}
```

Do not blindly pop the wrong stash or overwrite your local lockfiles; the backup copies remain available. Switching branches does not restart the live containers.

## Release

After branch tests pass, merge the PR and redeploy **frontend only**:

```bash
cd /opt/apps/voxora
git pull --ff-only origin main
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d --no-deps frontend
```

No API restart, database migration or Paddle reconfiguration is needed. Production final acceptance should still verify signup, Creator and Studio upgrades, the readable payment-result 15-second countdown and manual workspace continuation.
