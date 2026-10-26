# Voxora Billing dashboard — integrated implementation / acceptance

Feature branch: `feature/billing-dashboard-invoices-activity-20261026`

This module extends **Billing**, not the already sandbox-validated **Payments** module. Existing Paddle Checkout transaction creation, signed webhook processing, plan-change locks, duplicate-charge protection, receipt emails, and payment-result confirmation remain unchanged.

## Sections implemented

1. **Subscription overview:** Subscription plan, live Paddle status, signed-webhook entitlement status, UTC billing-cycle dates, next renewal, cancellation effective date, scheduled cancellation, auto-renewal indicator, plan allowance and monthly usage progress.
2. **Invoice & transaction history:** Backend `GET /api/billing/dashboard/transactions?cursor=` reads Paddle transactions filtered to subscription IDs demonstrably belonging to the logged-in Voxora user. It includes previous user-owned subscriptions recorded in Voxora checkout rows (up to the 50 latest owned checkout associations) without leaking foreign BuildHire transactions. Shows gross amount in Paddle minor units, currency, invoice number, transaction type, payment status and timestamp; paginated Load More; view a paid Paddle PDF invoice via `GET /api/billing/dashboard/invoice/:id`. Invoice links are generated *on demand*, expire in ~1 hour and are never persisted.
3. **Payment management:** `GET /api/billing/dashboard/manage?action=overview|payment|retry|cancel` validates locally owned subscription and current Paddle product price. It tries a temporary, authenticated Paddle customer portal session first, then Paddle subscription management URLs as a fallback when session creation fails but Paddle has returned valid links. Both link types generally require the portal-session write permission. The retry action is available only for a Paddle past-due subscription, and uses the provider's payment method/recovery flow. **No second checkout** is created.
4. **Cancellation experience:** Confirmation dialog with estimated billing-period end and clear continuing-access guidance; opening Paddle is *not* cancellation. Paddle finalizes the cancellation; signed `subscription.updated` webhooks continue to control Voxora entitlements. Once cancellation is scheduled, Billing displays the effective date and disables repeat cancellation actions.
5. **Activity timeline:** `GET /api/billing/dashboard/activity` merges subscription history from the Paddle subscription history API (released June 2026), recent user-owned transaction changes and latest confirmed local plan-change operation. Items show upgrades, downgrades, renewals and failed payments when supported by real Paddle records. History API failures are shown as partial warnings rather than fabricated results.
6. **UX/tests:** Black Gold-themed cards, adaptive mobile transaction cards and dialogs, status pills, tab-free filters, loading/error/partial-failure states, semantic headings, accessible progress and keyboard-trapped cancellation confirmation.

## API routes

`/api/billing/dashboard` — signed-in only, returns `account`, `subscription`, `warnings`. If Paddle subscription reads are unavailable or mismatch the known Voxora item, the last signed local state remains visible with actions disabled and an explicit warning.

`/api/billing/dashboard/transactions` — signed-in, user-owned subscription IDs only, strict Paddle pagination cursor, returns `items` and `nextCursor`. No card/bank details.

`/api/billing/dashboard/activity` — signed-in, user-owned history and transaction events. Requires Paddle `subscription_history.read` permission for subscription change history; otherwise displays available payments and a warning.

`/api/billing/dashboard/invoice/:id` — signed-in, checks exact transaction ID ownership, associated subscription and paid non-zero total, returns temporary Paddle invoice PDF URL. Only completed non-zero transactions are offered as downloadable tax invoices.

`/api/billing/dashboard/manage?action=` — signed-in, current subscription ownership and catalog validation, returns a temporary Paddle customer-portal URL with HTTPS and Paddle domain validation.

## Required Paddle API key permissions

- `subscription.read` — already needed for current payment and plan changes.
- `transaction.read` — **required** for invoices, transaction history and paid transaction lookup.
- `subscription_history.read` — **recommended** for full activity (otherwise graceful partial history with warning).
- `customer_portal_session.write` — **required for authenticated portal links and Paddle `management_urls`.** The code falls back from portal-session creation to subscription management URLs only when Paddle has returned them. Without this key permission, those links may also be absent.
- Paddle hosted cancellation and payment method changes are preferred to new local writes. No API key or webhook secret is exposed to Vite.

### Shared Paddle account isolation

Paddle is also used by BuildHire. Voxora must not query all merchant transactions without the user's owned subscription constraints, trust browser-supplied subscription IDs, or accept an arbitrary portal URL. Invoice ownership requires a server-owned subscription or checkout association. New Billing pages are **read-only** with respect to paid subscriptions; subscription events still require the same signed webhook.

## Server / frontend verification

Run on the feature branch in the respective folders:

```bash
cd /opt/apps/voxora/server
npm test
node --check src/routes/billingDashboard.js
node --check src/services/billingDashboardService.js

cd /opt/apps/voxora/frontend
npm run test:unit
npm run lint
npm run build
npm run test:e2e
```

New tests:
- `server/test/billingDashboard.test.js`: nine cases for renewal and cancellation dates, valid Paddle plan mapping, amounts/invoices, tenant-safe invoice access, portal URL allowlist, cursor, activity, and sandbox Paddle request filtering.
- `frontend/e2e/tests/billing.spec.js`: seven scenarios for desktop and mobile (14 new browser cases) covering complete dashboard, pagination and invoice, overdue payment recovery, scheduled cancellation, confirmation dialog, partial outages, and Free plan.
- Previously **42 frontend browser tests** passing; expected browser suite total **56** after adding Billing.

## Sandbox acceptance checklist

1. Log in to the test account with the active Studio plan. Billing shows actual Paddle renewal date, current billing period, allowance and subscription status.
2. Check a completed Creator payment and prorated Studio upgrade against Paddle Dashboard: gross amounts, currencies, invoice numbers and PDF links should match Paddle's records. A zero-total payment-method change should not show a PDF.
3. Download a real Paddle-issued invoice, then try to access a foreign BuildHire transaction's invoice ID using Voxora—must return 404 without leaking a PDF.
4. Simulate past-due renewal: account stays safely protected, Billing presents payment recovery in Paddle, and **does not** open a new plan checkout.
5. Initiate cancellation via dialog: Verify the modal, Paddle's hosted confirmation, the scheduled-change webhook and the correct displayed date. Ensure user retains access until confirmed end.
6. Check activity for Creator → Studio upgrade, renewal and failed payment when those events exist.
7. Test 375 px mobile and desktop, dashboard unavailable, payment history unavailable, expired portal link, keyboard Escape/Tab in modal, status refresh after returning from Paddle.
8. Test shared Paddle sandbox account: BuildHire transactions must not appear in Voxora and vice versa.

## Deployment after PR review

Because this adds **new backend routes**, you must rebuild **API and frontend together**. There is **no Prisma migration**. Never deploy only the frontend before its corresponding API endpoints are running.

```bash
cd /opt/apps/voxora
git pull --ff-only origin main

sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build api frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d --no-deps api frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml ps
```

Run the existing Paddle sandbox acceptance again after release. The implementation is not considered approved for merging until the unit, lint, build, browser and real Paddle sandbox checks pass.
