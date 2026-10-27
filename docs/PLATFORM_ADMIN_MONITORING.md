# Voxora Platform Admin — Monitoring Foundation

This branch adds a **read-only, role-protected** administrator console. It does **not** enable Grok or change existing Gemini, Pexels, TTS, billing, render or customer workflows.

## Access & security

- Every user stays `user` after migration. Neither signup nor account preferences can promote a role.
- Admin routes require an authenticated, email-verified session **and** database role `platform_admin`. The browser-only route guard is convenience, not authorization.
- Operator bootstrap for a *verified preexisting account* only, after schema migration:

  ```sh
  cd /opt/apps/voxora
  # Run from the server's migrated API container; do not put credentials in this repo.
  sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml \\
    exec -e PLATFORM_ADMIN_EMAIL=owner@example.com api \\
    node scripts/grant-platform-admin.js --confirm=GRANT_PLATFORM_ADMIN
  ```

- Bootstrap is idempotent, writes `AdminAuditLog` on first grant, and requires a password-enabled verified account. Limit shell and Docker access to authorized operators.
- No role management or mutation endpoints are exposed in the first release.
- Administrative API responses use `Cache-Control: no-store, private`. Only allowlisted fields are returned; passwords, API keys, tokens, voice recordings and project research body are not exposed.

## Admin UI & routes

Path: `/platform-admin` (admin user also gets a sidebar link).

- `GET /api/platform-admin/overview`: global counts, plan/project distributions, monthly final-render usage, latest activity, bootstrap audit, recent Paddle webhook types, Redis queue counts and **configured** integrations (not real-time provider health).
- `GET /api/platform-admin/users?page=1&limit=20&q=...`: paginated user/plan lookup.
- `GET /api/platform-admin/projects?page=1&limit=20&q=...&status=...`: project monitoring with owner email and scene/media counts (no project contents).
- `GET /api/platform-admin/subscriptions?page=1&limit=20&q=...`: subscription oversight from local webhook-confirmed records.
- `GET /api/platform-admin/activity?page=1&limit=20`: sanitized platform project activity history.

This initial release **does not** provide infrastructure CPU/RAM/GPU telemetry, cost accounting, admin user manipulation, subscription overrides or AI-provider toggles. Those should be separate reviewed capabilities with additional audit and privilege controls.

## Validation and deployment

```sh
cd server && npm run prisma:generate && npm test
cd ../frontend && npm run lint && npm run test:unit && npm run build
```

Apply Prisma migrations with the deployment's normal entrypoint before bootstrapping the first administrator. Verify a regular customer receives 403 from admin API; confirm admin can see read-only monitoring. Promote only one trusted account initially. Do not merge/deploy without review.
