# Voxora render quotas — acceptance and rollout

## Current limits, unchanged
Free: 3 renders / UTC month, Creator: 30, Studio: 150. All plans currently permit 60-second videos. The backend continues to enforce the authenticated user's effective plan and an atomic MySQL reservation. This feature does not change the catalog or subscription security.

## Frontend
The shared `RenderQuota` indicator reads `GET /api/billing/me` with `cache: no-store`, shows actual used / remaining / allowance, the next midnight UTC monthly reset, and warning states at >=80% and 100%. A `PLAN_LIMIT_REACHED` response offers an Upgrade plan action. It is integrated into storyboard Preview, advanced Editor render modal, and the legacy editor render page. Usage refreshes after render submission, terminal polling, and when users return focus to the app after a plan change. Failures are visible rather than assumed to be zero credits.

## Failure and cancellation reconciliation
- Each new BullMQ render job stores the original server-side `{userId, renderKey, month}` reservation metadata.
- A retried attempt **does not** refund credits. Only final exhausted worker failures call `releaseRender`, after the terminal state is recorded.
- Safely removed *waiting, delayed or prioritized* jobs refund credits when the cancel API succeeds; active jobs remain non-cancellable and not refunded.
- Status polling for a terminal failed job provides a second reconciliation path if the worker's async failure listener was interrupted.
- The existing `releaseRender` database transaction atomically deletes the credit before decrementing usage; repeated notifications/calls cannot decrement more than once. It also refuses to decrement below zero.
- Successful renders are never refunded. Credit rollback uses the month of the original reservation, not the month in which failure was noticed.
- Existing jobs without reservation metadata are not automatically refunded: historical records need manual audit/reconciliation before refunds can be safely attributed. Do not guess a user/month.

## Validation and rollout gates

From the feature branch:

```bash
cd /opt/apps/voxora/server
npm ci
npx prisma generate
npm test
node --check src/jobs/renderQueue.js
node --check src/jobs/editorRenderQueue.js

cd /opt/apps/voxora/frontend
npm ci
npm run test:unit
npm run lint
npm run build
npm run test:e2e
```

With test accounts and a test Redis/MySQL/Paddle sandbox, verify:
1. Free 0/3, 2/3, 3/3, Creator 24/30 and Studio 120/150; UTC month rollover and plan upgrade.
2. Successful storyboard and editor renders retain one credit; repeated in-flight submits return the same job rather than double-consuming credit.
3. Forced first-attempt worker failure that later succeeds remains charged exactly once.
4. Forced terminal second-attempt failure returns the original credit exactly once; duplicate failed callbacks and status polling do not add credits.
5. Cancel a *waiting* job in each queue and verify its credit returns; attempt to cancel an active job and verify neither job nor quota changes.
6. Fail after UTC month change and verify only the original month's usage is decremented.
7. Test with an older job lacking metadata and confirm no guessed refund occurs.
8. Open all render entry points on desktop/mobile, verify the Upgrade plan path when the API responds `PLAN_LIMIT_REACHED`.

## Deployment
No Prisma migration. On the current Lightsail Compose configuration, **both render workers run inside the API container** (`RENDER_WORKER_IN_API=true`, `EDITOR_RENDER_WORKER_IN_API=true`). Rebuild/recreate `api` and `frontend` together after validation. Do not deploy only the frontend; the API's embedded workers must understand the new reservation metadata. Preserve database and Redis volumes and backup the database first. Older queued jobs without metadata require assessment. Do not automatically merge before MySQL + Redis integration acceptance.

This PR does not change TTS, Paddle webhook behavior, billing entitlements, or existing Settings implementation.
