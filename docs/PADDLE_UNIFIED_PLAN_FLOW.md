# Voxora Paddle checkout and plan changes

## Flows implemented

1. New user: signup → email verification → /choose-plan → Free or Paddle Creator/Studio checkout → await signed Paddle subscription event → /signals.
2. Existing Free user: Account Settings/Billing → /choose-plan?mode=upgrade → paid checkout → await signed event → /billing?updated=1.
3. Existing active paying user: same selector → server Paddle change preview → on-page confirmation → PATCH subscription through Paddle → await signed subscription.updated event → Billing.

Browser checkout.completed or URL transactionId is a hint only. Paid access is granted only from Paddle-signed subscription events, with a server-created checkout record and linked Paddle subscription ID. A canceled checkout or forged transaction ID cannot activate a subscription.

Plan upgrade Creator → Studio is prorated immediately; Studio → Creator charges/credits prorated adjustment next billing period. Paddle determines taxes, the final amount and payment processing. Existing subscribers never buy a second plan through a new transaction. Cancellation to Free is handled through the Paddle customer portal.

## Sandbox prerequisites

Set in server/.env on Lightsail (not frontend):

    PADDLE_ENV=sandbox
    PADDLE_API_KEY=your_sandbox_server_api_key
    PADDLE_CLIENT_TOKEN=test_your_sandbox_client_token
    PADDLE_WEBHOOK_SECRET=your_notification_secret
    PADDLE_PRICE_CREATOR=pri_your_monthly_creator_price_id
    PADDLE_PRICE_STUDIO=pri_your_monthly_studio_price_id
    # Optional: defaults to AUTH_PUBLIC_URL + /checkout
    PADDLE_CHECKOUT_URL=https://usevoxora.online/checkout

IMPORTANT — SL Options shares one Paddle sandbox account with BuildHire. Paddle supports only ONE account-level Default payment link. KEEP the existing BuildHire default checkout link unchanged. Do not replace it with Voxora.

For each Voxora payment, the backend explicitly supplies checkout.url = https://usevoxora.online/checkout in POST /transactions. Paddle supports a per-transaction override of the default link, allowing the two products to share one merchant account without redirecting Voxora transactions to BuildHire. The URL is derived from AUTH_PUBLIC_URL by default; optional server-only PADDLE_CHECKOUT_URL can override the path on the same origin. The public /checkout page initializes Paddle.js and handles Paddle's _ptxn transaction query.

In Paddle > My account > Settings > Website approval, register usevoxora.online (sandbox websites approve automatically; live requires approval). Keep separate Voxora product prices, server credentials and webhook destination. The Paddle-hosted customer portal is used for payment-method updates and cancellations through subscription management URLs. Configure an active Voxora webhook destination at https://usevoxora.online/api/billing/webhook.

Note: events are account-wide; both BuildHire and Voxora webhook implementations must correlate only their own transactions/subscriptions rather than blindly using customer email or custom_data.
Enable subscription.created, subscription.updated, subscription.activated, subscription.trialing, subscription.canceled, subscription.paused, subscription.resumed, subscription.past_due, transaction.completed, transaction.payment_failed.
Ensure the Paddle API key has permissions for creating transactions, reading subscriptions, previewing changes, and writing subscriptions. Use sandbox-only test payment methods.
Confirm product prices match the provisional $19 / $49 catalog before charging anyone.

## Required acceptance checks

- [ ] New user Free → signals, no payment.
- [ ] New user Creator/Studio → sandbox checkout completes → wait for signed webhook → signals; confirmed plan and checkout-linked subscription exist.
- [ ] Checkout canceled → no paid access; incomplete webhook activation → pending, no double charge.
- [ ] Paddle default payment link /checkout?_ptxn=... automatically initializes Paddle checkout; emailed payment-method update URL works without a Voxora session.
- [ ] Wrong transaction ID or another account's ID → server rejects; no access.
- [ ] Existing Free → paid → billing shows correct quota after webhook.
- [ ] Creator → Studio preview, accept prorated immediate payment, webhook changes quota.
- [ ] Studio → Creator preview, next-billing-cycle adjustment, webhook changes quota.
- [ ] Current paid user cannot create another new paid checkout.
- [ ] Late / duplicate / out-of-order webhooks don't overwrite another subscription.
- [ ] Payment failure leaves old plan active.
- [ ] Paddle customer portal handles payment method updates and cancellation.
- [ ] Mobile and desktop, light/dark themes, signup recovery and Gmail receipts verified.

## Deployment

Take a verified MySQL backup: this change adds nullable billing_checkouts.paddle_subscription_id.
Build api and frontend; run npm run test:core using the updated API Docker image; inspect logs and verify signed webhook registration. The API entrypoint applies Prisma migrations.

Do not merge/deploy until sandbox payment tests, price IDs, production domain settings and webhook delivery are checked. GPU/TTS work is not part of this release.

## Limitations

Source code changes and logic tests can be reviewed in GitHub, but real Paddle sandbox transactions and refunds cannot be validated without runtime credentials.
Prices remain provisional; Paddle remains merchant of record. Credit reconciliation after failed background rendering, refunds, and chargebacks are separate operational work.

## Paddle dashboard default checkout link limitation

The account default is already set to BuildHire (e.g. `https://buildhire.sloptions.xyz/check...`). Paddle allows only one default URL in Checkout configuration. **Leave it unchanged.** Voxora's transaction-specific `checkout.url` is the correct supported override; customers paying Voxora use its own domain. Confirm actual returned `checkout.url` in a sandbox transaction (without sharing secrets or customer data).

Paddle docs: https://developer.paddle.com/build/transactions/default-payment-link/ and https://developer.paddle.com/api-reference/transactions/create-transaction/.
