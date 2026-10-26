# Voxora Users & Authentication — Onboarding, Recovery and Browser Test Plan

**Branch:** feature/auth-onboarding-recovery-e2e-20261026  
**Scope:** users/auth only. No Paddle checkout, paid price, quota, or GPU/TTS changes.

## Implemented account journeys

1. Visitors selecting Creator/Studio on the landing page arrive at `/choose-plan?plan=creator|studio`; signed-out visitors are sent through sign-in → sign-up with the intended plan encoded as a validated, same-origin `next` value.
2. Signup validates the intended plan against `free`, `creator`, `studio`. The backend saves the plan in `users.intended_plan` so it survives browser refreshes, new sessions and emailed verification links opened on other devices.
3. After signup and verification, the user goes back to `/choose-plan?plan=creator|studio`, **not** directly to the paid workspace. Actual payments and entitlements remain controlled by the existing Paddle billing flow.
4. Incomplete users who sign in again resume the saved plan. After completing Free onboarding or having the paid plan activated by a signed Paddle webhook, the saved intent is cleared.
5. Signup button says **Create account** (not **Create free account**), as plan selection happens later.
6. If Gmail fails to deliver the first verification message, signup still creates the authenticated account and truthfully reports that email delivery failed. The code page offers a resend, with no artificial cooldown until a message was actually accepted.
7. Resending a code creates a new link/code pair, attempts delivery, and only invalidates older tokens **after** success. Failed delivery removes the undelivered pair and keeps previously delivered codes valid.
8. Invalid/expired email verification links offer a safe path to the code screen, or to sign-in if the browser has no session. Expired/missing password-reset links offer a new reset request instead of a dead-end form.
9. Internal return URLs are validated; external redirect addresses and protocol-relative URLs are rejected.

## Schema and release

Additive migration: `server/prisma/migrations/20261026110000_user_intended_plan/migration.sql`; no existing account rows are rewritten. Existing users have `intendedPlan = null` until they follow a new paid signup flow.

**Deploy only after backup and tests**: the API must migrate/rebuild at the same time as the frontend because signup and `/api/auth/me` now expose `intendedPlan`.

```bash
cd /opt/apps/voxora
# After merging/pulling main: back up MySQL first and verify the backup.
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build api frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml run --rm --no-deps --entrypoint npm api run test:core
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d --no-deps api frontend
```

The existing API container startup migrates Prisma. Monitor the API migration logs.

## Browser tests

The browser tests run against a local Vite instance with **mocked API responses**: they never create real accounts, contact Gmail, or charge Paddle. They test login, signup, code verification, expired link recovery, Gmail delivery failure and resend, password reset and session expiry in desktop Chromium and a Pixel viewport.

One-time setup after pulling this branch on your development machine (Node 22 recommended for Vite 8):

```bash
cd frontend
npm install
npm run test:unit
npm run test:e2e:install
npm run test:e2e:browsers
npm run test:e2e
```

The test runner starts its own local Vite server on **127.0.0.1:5179**. To test an existing dev server, set `VOXORA_E2E_URL` to its base URL.

For continuous integration, see `.github/workflows/frontend-auth-e2e.yml`. Browser test runner dependencies are intentionally isolated under `frontend/e2e` to avoid inflating the production image. GitHub Actions currently has an account-level **startup_failure** problem that may prevent CI jobs from starting; do not claim green browser tests until they have actually run.

## Production smoke checks (Gmail, no TTS needed)

- [ ] New Studio signup → 6-digit Gmail verification → Studio is still highlighted on plan page; no plan charged automatically.
- [ ] New Creator signup → close the browser → sign in again → Creator selected.
- [ ] Open the email verification link in a different browser → after login, intended plan is still selected.
- [ ] Disable SMTP temporarily in a controlled **staging** environment → signup returns `emailSent:false`; immediate resend is available once SMTP is restored.
- [ ] Expired email code/link offers resend and does not lose the account or prior plan.
- [ ] Wrong code attempts are rate-limited; resend cooldown applies only after a successful delivery.
- [ ] Forgot password, follow Gmail reset link, change password, verify other sessions are revoked.
- [ ] Expired reset link offers a new request.
- [ ] Protected workspace pages redirect to sign-in after session expiry and preserve return location.
- [ ] Verify cookie security and auth rate limits in the actual deployed HTTPS environment.

## Important limitations

Browser fixtures prove frontend navigation and recovery, not Gmail deliverability, cryptographic token handling, Prisma migration success, or Paddle payments. Real database/inbox integration must still pass separately. Do not treat this branch as production verified until frontend build/lint, backend tests and live QA pass. No API credentials or test account passwords should be committed.
