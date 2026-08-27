# Helix server (M0 — backend wiring)

Node/Express API + MySQL via Prisma. See `../frontend/docs/BUILD_PLAN.md`
and `../frontend/docs/TASK.md` for the full plan; this covers only what M0
needs to run.

## Setup (local WAMP/MySQL)

1. Create a database, e.g. in phpMyAdmin or the MySQL CLI:
   ```sql
   CREATE DATABASE helix CHARACTER SET utf8mb4;
   ```
2. Copy the env file and fill in your MySQL credentials:
   ```bash
   cp .env.example .env
   # edit DATABASE_URL, e.g.
   # DATABASE_URL="mysql://root:@localhost:3306/helix"
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Generate the Prisma client and run the initial migration (creates all
   five tables from BUILD_PLAN §3):
   ```bash
   npm run prisma:generate
   npm run prisma:migrate -- --name init
   ```
5. Seed the `signals` table with local-dev rows:
   ```bash
   npm run prisma:seed
   ```
6. Start the API:
   ```bash
   npm run dev
   ```
   Listens on `http://localhost:4000` by default (`PORT` in `.env`).
   `GET http://localhost:4000/api/signals` should return the 6 seeded rows.

## Frontend wiring

The frontend (`../frontend`) now fetches `/api/signals` instead of reading
the old mock array. Its dev server proxies `/api` to `http://localhost:4000`
(see `frontend/vite.config.js`), so run both dev servers side by side:

```bash
# terminal 1
cd server && npm run dev
# terminal 2
cd frontend && npm run dev
```
