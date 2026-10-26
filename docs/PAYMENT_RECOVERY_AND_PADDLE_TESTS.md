# Voxora Payments Module — Recovery, Idempotency and Sandbox Verification

**Branch:** `feature/payments-recovery-paddle-20261026`  
**Scope:** Paddle checkout/payment and Creator ↔ Studio plan change; excludes GPU/TTS and the separate Billing, Settings and Quota UX batches.  
**Release status:** Needs an approved review PR, MySQL migration and sandbox acceptance. **No live payment was made during code development.**

## Payment state model

Five user-visible states:

- `awaiting_payment`: Paddle transaction created; checkout can be resumed using the **same transaction ID**.
- `processing`: payment completed at Paddle but the signed subscription event is still being delivered; keep the old plan until it arrives.
- `activated`: the signed Paddle subscription event confirms the matching, server-owned plan/subscription ID.
- `failed`: Paddle reports a payment failure; existing checkout may be resumed with the same transaction, and failed upgrades can be reviewed again from a fresh proration preview.
- `canceled`: Paddle itself confirmed the unpaid transaction was canceled. Closing the checkout overlay **does not cancel a Paddle transaction**.

A network timeout, 5xx provider outcome or interrupted request with unknown status remains **uncertain**. The server blocks accidental retries until an administrator reconciles the transaction or plan change. The UI never tells the user to try a second charge under uncertain conditions.

## API endpoints

| Route | Method | Result |
| --- | --- | --- |
| `/api/billing/checkout` | POST | Reserves one user checkout before Paddle transaction creation. Returns the original `transactionId` when resuming. |
| `/api/billing/payment-state` | GET | User-owned checkout + latest plan-change state, read from database records updated by signed Paddle webhooks. No secret exposed. |
| `/api/billing/checkout-status` | GET | User-owned transaction status, including explicit activated/failed/canceled state. |
| `/api/billing/checkout/cancel` | POST | Allows canceling unpaid Paddle `draft`/`ready` API transactions. Checks Paddle status first and unlocks only after Paddle confirms cancellation. |
| `/api/billing/change-preview` | POST | Paddle proration preview for an authenticated active subscriber. |
| `/api/billing/change-plan` | POST | Reserves a per-user plan-change lock, calls Paddle subscription PATCH with `on_payment_failure: prevent_change`, and waits for the signed subscription event before granting benefits. |
| `/api/billing/webhook` | POST | Authenticated by Paddle's raw-body HMAC, stored with event-id idempotency, then matched to a server-created Voxora transaction/subscription. |

## MySQL migration

Additive migration: `server/prisma/migrations/20261026180000_payment_attempt_state/migration.sql`.

- Adds checkout `status`, `updated_at`, `last_event_at`.
- Adds `billing_checkout_locks`, **one reservation per user** so a simultaneous click/tab cannot create a second checkout.
- Adds `billing_plan_changes`, **one persisted change operation per user**, including `processing`, `uncertain`, `activated` and `failed` states.
- Existing old pending checkout records are recovered into a lock upon the next purchase attempt; the user is offered the original transaction rather than a second one.

Do not edit historical migrations or deploy without a verified MySQL backup. Run Prisma schema validation and deploy migrations before accepting payments.

## Shared Paddle account with BuildHire

**Leave BuildHire's account-wide Default payment link unchanged.** Voxora creates its own checkout with transaction-specific `checkout.url=https://usevoxora.online/checkout`.

Paddle webhook signatures authenticate **the destination**, not the SaaS product. Voxora now handles subscription events **only** when a linked, server-created Voxora checkout or already-linked Voxora subscription exists **and** the subscription contains exactly one configured Voxora Creator/Studio recurring price at quantity 1.

BuildHire transactions and unrelated webhook IDs must be acknowledged with HTTP 200 and produce **no Voxora user subscription, email or render entitlement**. We did not inspect or change BuildHire's webhook implementation in this branch: **independently confirm BuildHire filters out Voxora transactions**. Distinct notification destinations and secrets reduce accidental routing mistakes.

## Paddle Sandbox dashboard checks

1. Verify products: Voxora Creator / Studio monthly recurring prices, correct `PADDLE_PRICE_CREATOR` and `PADDLE_PRICE_STUDIO`, and no overlap with BuildHire price IDs.
2. Verify `PADDLE_ENV=sandbox`, backend API key, frontend client token and `PADDLE_WEBHOOK_SECRET` only in `server/.env` on Lightsail.
3. Keep default payment link pointing to BuildHire; ensure Voxora's approved/sandbox-enabled domain supports `https://usevoxora.online/checkout`.
4. Configure Voxora webhook destination `https://usevoxora.online/api/billing/webhook`; subscribe to at least `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.trialing`, `subscription.canceled`, `subscription.past_due`, `transaction.completed`, `transaction.payment_failed`, `transaction.canceled`, `transaction.past_due`. The last two are needed for explicit cancellation and failure states.
5. Paddle **Events → Simulations**: create a destination whose traffic source permits **Simulation** or **Platform and simulation**. Ordinary platform-only notification destinations cannot receive simulated webhooks. Send an isolated `transaction.canceled` event and a subscription scenario; review HTTP responses and corresponding Voxora API logs. Unlinked simulator sample subscription IDs are intentionally ignored for provisioning.
6. Make a **real sandbox test purchase**, using a new test account and **sandbox test card only**. Verify Paddle checkout's transaction URL opens on `usevoxora.online`, not BuildHire. Observe transaction.created → subscription.created/activated → transaction.completed delivery and successful UI return.
7. Cancel an unpaid draft/ready checkout from Voxora. Confirm Paddle reports `canceled`; switching plans becomes available.
8. Simulate a failed initial payment; confirm no quota increase and Resume uses original transaction ID.
9. Test Creator → Studio prorated upgrade and Studio → Creator downgrade. Refresh while the plan change is pending; confirm it still shows as pending with no second PATCH. A failed upgrade must leave Creator active and require a **new preview** before retry.
10. Confirm BuildHire's **existing** purchases, checkout URL, subscriptions and emails remain unaffected. Voxora must ignore BuildHire webhooks; check BuildHire's handler ignores Voxora webhooks.

Paddle simulator instructions: https://developer.paddle.com/webhooks/simulator/test-webhooks/  
Paddle transaction cancellation: https://developer.paddle.com/api-reference/transactions/update-transaction/  
Paddle subscription changes: https://developer.paddle.com/api-reference/subscriptions/update-subscription/

**Do not mistake a simulated successful webhook for a complete live payment test.** It confirms delivery/signature processing, but an authorized Voxora checkout record and actual sandbox payment must be tested separately.

## Browser and backend tests

```bash
# In /opt/apps/voxora/frontend on a machine with Playwright installed:
npm run test:unit
npm run lint
npm run build
npm run test:e2e
# Browser suite includes 7 auth scenarios + 5 payment scenarios, each desktop/mobile.

# On Lightsail after building updated API image:
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml \
  run --rm --no-deps --entrypoint npm api run test:core
```

`test:core` excludes the unrelated legacy TTS fallback test file. It **includes the new payment state and Paddle helpers tests**. Playwright stubs Paddle.js and API traffic, so its tests do not charge a card. Real sandbox payment and webhook delivery are separate acceptance gates.

## Safe Lightsail deployment sequence (after review/merge)

```bash
cd /opt/apps/voxora
git pull --ff-only origin main
# Back up existing MySQL first and confirm the backup has contents.
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build api frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml run --rm --no-deps --entrypoint npm api run test:core
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d --no-deps api frontend
sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml logs --tail=100 api frontend
curl -fsS https://usevoxora.online/api/billing/plans
```

Ensure `billingReady: true` in the plan endpoint before attempting checkout. **It checks required variables only; it is not a Paddle API or webhook health test.**

## Known operational limitations

- In `uncertain` status, customers cannot self-release a payment lock; administrators must inspect the Paddle dashboard and reconcile the transaction/subscription before allowing another purchase. This is intentional to avoid duplicate charges.
- Automatic administrative reconciliation, failed-render quota refunds, invoice history and subscription renewal emails are separate operations/UX modules.
- This branch does **not** prove live Paddle Sandbox payments or delivery; those require the owner's configured credentials, reachable Lightsail host, and actual Paddle notification events.
