# Voxora public site, billing and account delivery checklist

Status: **implementation branch / sandbox verification required**. Do not deploy to production until the checklist passes.

## Proposed launch catalog — pending commercial approval

| Plan | Display price | Max completed render submissions / calendar month (UTC) | Length |
| --- | ---: | ---: | --- |
| Free | $0 | 3 | 60 seconds |
| Creator | $19 / month | 30 | 60 seconds |
| Studio | $49 / month | 150 | 60 seconds |

Prices and allowances are **provisional**, not a commercial commitment. Keep price IDs and checkout disabled until product owner signs off. Both standard and editor render submissions reserve a usage credit. Repeat submissions of the same standard project (or unchanged editor version) within the same calendar month are idempotent. This meters accepted render requests, not guaranteed successful media production; failed background renders currently require administrative reconciliation.

Source of truth: `server/src/services/billingService.js`. Keep `frontend/src/pages/LandingPage.jsx` marketing copy and `frontend/src/pages/BillingPage.jsx` in sync when revising it.

## Configure transactional email

This implementation uses **Resend's HTTPS email API** and Node's native `fetch` to avoid new dependency changes. Do not commit secrets.
Configure in `server/.env` (and on Lightsail in secure runtime configuration):

```ini
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=Voxora <hello@YOUR_VERIFIED_DOMAIN>
AUTH_PUBLIC_URL=https://usevoxora.online
```

Resend requires a verified sending domain. Production signup fails closed if email is not configured; do not enable new registrations without working mail delivery.

Existing workflows:

- Signup → user, one-use 24h email-verification token, branded link by email; session created.
- Unverified account → Account → **Resend verification email** (limited to four/hour per source IP).
- Verify link → token consumed, `emailVerifiedAt` populated, confirmation email.
- Signin and signout → cookie-backed session; invalid login returns a generic credential error.
- Forgot password → generic response whether account exists; token only sent by email (2h); no raw reset URL exposed.
- Reset password → replaces password, revokes old sessions, signs in current browser, sends security notice.
- Password change → revokes other sessions and sends security notice.
- Paddle transaction completed/failed, subscription created/activated/canceled/past-due → user email notifications (best effort; email send errors logged).
  
Email integration and HTML templates: `server/src/services/emailService.js`.

## Configure Paddle sandbox

Set in `server/.env` / Lightsail runtime environment:

```ini
PADDLE_ENV=sandbox
PADDLE_API_KEY=your_sandbox_server_api_key
PADDLE_CLIENT_TOKEN=test_your_client_side_token
PADDLE_WEBHOOK_SECRET=your_notification_destination_secret
PADDLE_PRICE_CREATOR=pri_your_creator_monthly_price_id
PADDLE_PRICE_STUDIO=pri_your_studio_monthly_price_id
```

Create two Paddle monthly recurring products/prices matching the approved plan catalogue. Set Paddle Checkout's default payment link to an approved domain. In Paddle **Events → Notifications**, configure a webhook destination:

`https://usevoxora.online/api/billing/webhook`

Subscribe at least to `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.canceled`, `subscription.paused`, `subscription.resumed`, `subscription.past_due`, `subscription.trialing`, `transaction.completed` and `transaction.payment_failed`.

The webhook endpoint uses the raw request body and validates Paddle HMAC signature and timestamp. A persisted webhook-event record avoids reapplying duplicate deliveries. Paid access activates from the verified subscription event **not browser checkout success**. Provisioning links to a server-created checkout transaction instead of trusting user-editable Paddle custom data. Test with Paddle's webhook simulator before switching to production.

## Production migration

1. Back up Voxora MySQL and confirm the deployment branch is merged.
2. Build/test backend and frontend and validate Prisma:
   `cd server && npm ci && npx prisma validate && npx prisma generate && npm test`
   `cd frontend && npm ci && npm run lint && npm run build`
3. Apply **only after a database backup**:
   `cd server && npx prisma migrate deploy`
4. Set Resend and Paddle secrets only on server runtime config.
5. Deploy application normally through the existing Compose process. Do not delete persistent volumes.
6. Check `/api/health`, `/api/billing/plans`, `/api/billing/me` (authenticated) and `/api/auth/me`.
7. Open a paid checkout in Paddle sandbox; verify that subscription status changes only after a signed webhook is processed.

## Acceptance tests to run with real credentials

- [ ] Public mobile/tablet/desktop landing page loads; signals workspace remains accessible via `/signals`
- [ ] Pricing and plan CTAs, including logged-out redirect to signin/signup, are clear
- [ ] Signup, verification email delivery, verification success, token reuse and expiry
- [ ] Unverified user cannot submit a video render or checkout; resend works
- [ ] Signin, signout, incorrect-password rate limiting and session persistence
- [ ] Forgot-password response does not leak account existence or token; reset link arrives
- [ ] Reset token expires, is single-use and revokes other sessions
- [ ] Email templates render on Gmail/Outlook/mobile, including payment and lifecycle messages
- [ ] Paddle sandbox checkout only works after email verification
- [ ] Webhook signature failures are rejected; duplicate deliveries do not double-provision
- [ ] Paid plan access tracks activation/past-due/cancellation and renewals
- [ ] Both video render routes enforce the 60s length and monthly quota on the server
- [ ] Concurrent last-credit requests cannot exceed the monthly allowance
- [ ] Background failed/cancelled renders and refunds have defined credit-reconciliation policy
- [ ] Subscription upgrade/downgrade and customer portal experience tested
- [ ] Invoices, tax handling, chargebacks/refunds and billing emails reviewed before live payments
- [ ] No secrets, reset URLs or verification tokens appear in logs or API responses
- [ ] Test retention/deletion of old rendered videos and associated storage costs

## Known follow-up work (not complete)

- Paddle end-to-end sandbox and live validation require credentials, approved domain and notification destination.
- Production SMTP/Resend sender-domain verification and inbox testing require external setup.
- Confirm prices/plan allowances with owner; currently provisional.
- Add refund/chargeback adjustments, per-feature narration/voice-clone caps, admin reconciliation, and plan-change proration rules.
- Meter TTS usage, research-provider requests and storage allocation if separate plan entitlements are desired.
- Implement automatic credit reversal on asynchronous render failure/cancellation if commercial policy requires this.
- Move webapp/render storage into scalable object storage before 15k video/month workload.
