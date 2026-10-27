# Dedicated Voxora Platform Admin

Feature branch: `feature/dedicated-admin-console`.

## Scope

- `/admin` is a **separate application shell and sidebar** for role `platform_admin`.
- `/platform-admin` redirects to `/admin` to preserve old bookmarks.
- Admins still use normal Voxora projects, research, voices, editor and billing pages; the regular workspace account dropdown contains a gateway to the admin console.
- Admin read-only overview, users, projects, subscriptions, render queues, activity and provider configuration remain intact.
- Admin can **manage** plan quotas, public registrations, announcement and the tone/audience master data.
- Every change is logged in `admin_audit_logs.metadata` with before/after snapshots and the logged-in admin's user ID.

## API routes and permissions

All management endpoints live under `/api/platform-admin/*`, with existing `requireAuth` and `requirePlatformAdmin` middleware. No ordinary customer or frontend-only client role is trusted.

| Route | Description |
| --- | --- |
| GET/PUT `plans/:planId` | Only `rendersPerMonth` and `maxSeconds`; validates numeric limits |
| GET/PUT `settings` | `registrationOpen` and `announcement`; no arbitrary keys |
| GET/POST `master-data` | Tone/audience master items |
| PUT `master-data/:id` | Change label/order/active; cannot archive the last active item |
| GET `admin-audit` | Recent audited changes |

The public `GET /api/platform-config` exposes **only** registration availability and the announcement, not secrets or admin configuration.

## Important behavioral details

- Paddle plan prices, price IDs, checkout flows and subscriptions are unchanged.
- Render allowance/duration overrides are read from MySQL at runtime for billing and `reserveRender`. Updates affect future credit reservations; no previous usage is reset.
- The public pricing page, plan selector, and customer Billing dashboard use configured plan limits.
- `registrationOpen=false` stops new signup requests at the **backend**, not only in the browser. Existing login/sessions continue working.
- Admin announcements render in the signed-in workspace.
- Master tone and audience values populate and validate the real guided setup routes.
- The guided storyboard still supports 15, 30, 45 and 60 second templates. A higher entitlement alone does not extend those UI templates.
- AI provider on/off switches, Grok inference, customer suspension, and subscription overrides are separate follow-up modules; they are not simulated as working controls.

## Deployment and tests

First run against staging or a snapshot-backed database. The new additive migration is `20261027150000_admin_management`.

```bash
cd server
npx prisma validate
npm test
cd ../frontend
npm run lint
npm run test:unit
npm run build
```

On the existing Lightsail Compose configuration, the API entrypoint applies migrations before launching the server. Back up MySQL before deployment, then rebuild and restart the API and frontend; do not remove persistent volumes.

After deployment, open `https://usevoxora.online/admin` with the existing verified admin account. Verify:
1. Non-admin API requests still return 403; unauthenticated requests return 401.
2. Admin can use both `/admin` and regular `/signals` workspace.
3. Editing a Free/Creator/Studio render limit changes `/api/billing/plans` and `/api/billing/me`, without affecting Paddle prices.
4. Adding a tone populates project setup suggestions, and archiving the last active tone returns 409.
5. Disabling registration rejects new signup with 503; existing accounts still work.
6. Admin announcement appears in signed-in customer workspace.
7. Admin Audit contains the before/after records for changes.
8. Restore settings and verify full research/storyboard/TTS/render functionality.

Do not merge until frontend build, server tests and a staging migration have passed. The feature branch has no production deployment side effects.
