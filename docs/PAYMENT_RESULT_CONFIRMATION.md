# Voxora — Readable payment confirmation and recovery

**Scope:** Frontend-only change to post-checkout navigation. No Paddle secret, price, webhook, quota, API or Prisma changes.

## Problem

Previously, successful Paddle purchases and prorated Creator → Studio changes progressed through transient checkout/plan pages and redirected immediately to the workspace or Billing. Customers could not read the confirmation.

## New flow

### Successful payment

1. The checkout window reports `checkout.completed` (a browser hint **only**) or Paddle redirects to the transaction-specific `successUrl`.
2. Voxora opens **one** `/payment-result` page. It queries the existing `GET /api/billing/payment-state`, `GET /api/billing/me` and `GET /api/billing/plans` APIs.
3. Before the signed Paddle webhook matches an active subscription, the page says **Checking your payment…**, with **Check payment status** and **View plan options** actions. It does not claim payment success based on `checkout.completed` or URL parameters.
4. Once the server reports the matching checkout or plan-change operation **activated** AND Billing reports the matching **active/trialing plan**, the page displays a large confirmation.
5. A readable summary includes the subscribed plan, its standard monthly catalog price, monthly render allowance, per-video duration, billing period end, and a checkout transaction reference when present. The summary explicitly distinguishes **standard plan pricing** from the actual Paddle amount, which may include proration/tax.
6. The user has **15 seconds** to read the result. A clear countdown is displayed, with **Pause countdown / Resume countdown** controls for customers who need more reading time, plus **Go to workspace** (immediate) and **View subscription & billing** actions. When the countdown ends, the app refreshes account entitlements and navigates to `/signals`.
7. For an existing subscriber changing plans, the same page shows **Your plan is updated**, without a fleeting jump through Billing.

### Failed or canceled payment

1. A server-confirmed `failed` or `canceled` result displays the status prominently, explains that the new subscription was not activated, and summarizes the requested plan.
2. **Back to plans and retry** goes directly to the existing plan selector. If an unpaid transaction is still resumable, it is presented there using **Resume checkout** with the same Paddle transaction ID; no duplicate charge is created.
3. A 15-second return countdown is shown for these states, with the button usable immediately.
4. Paddle SDK errors alone are **not** trusted as proof of payment failure. The result screen says **Checkout could not finish**, keeps polling in case a signed activation arrives, and offers return to the existing checkout. If activation arrives, the **full 15-second success countdown restarts**.
5. If payment verification is unavailable, Voxora shows a non-definitive error and never grants paid entitlements from a browser redirect.

### Public /checkout payment link

Paddle's `/checkout?_ptxn=...` callback also routes to `/payment-result` after checkout completion. That preserves Voxora's separate checkout page while continuing to honor BuildHire's default payment link on the shared Paddle account.

## Security

- No `?success=1`, `checkout.completed` or user-controlled transaction ID can grant access or display a verified success.
- New `/payment-result` state is read only from server-owned payment and subscription records.
- An unrelated transaction ID, stale subscription state, wrong plan, unknown status or unsigned callback never shows a confirmed success.
- No new Paddle transactions are created from the result page; returning to plan selection preserves the existing backend recovery and duplicate-charge guardrails.

## Tests

- `frontend/test/paymentResult.test.js`: URL validation, 15-second default, server-verified paid entitlement, declined/canceled outcomes and subscription changes.
- `frontend/e2e/tests/paymentResult.spec.js`: 6 result-page scenarios × desktop/mobile; verify processing → confirmed summary → workspace, actual 15-second countdown, failed status → retry plans, SDK issue without signed failure, confirmed upgrade and invalid transaction.
- `frontend/e2e/tests/payments.spec.js`: an additional checkout event test ensures a client `checkout.completed` event cannot display paid success before the webhook, plus updated existing plan-change test.

Existing 24 browser scenarios plus 7 new browser scenarios × 2 viewports => **38 total browser tests**.

```bash
cd /opt/apps/voxora/frontend
npm run test:unit
npm run lint
npm run build
npm run test:e2e
```

## Lightsail deployment (after PR review/tests)

Frontend only. No Prisma migrations, API container rebuild or Paddle configuration changes:

```bash
cd /opt/apps/voxora
git pull --ff-only origin main
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d --no-deps frontend
```

Live sandbox acceptance: use a new test account and test subscription, check that a successful Creator purchase waits for signed activation and shows the summary for **15 seconds**, that **Go to workspace** works immediately, and that a failed/canceled test transaction shows **Back to plans and retry**. Re-test Creator → Studio. Never repeat a charge while its status is uncertain.

**Note:** The payment-result page does not itself prove actual Paddle sandbox webhook health. All payment entitlements are still assigned exclusively by the existing backend signed-webhook workflow.
