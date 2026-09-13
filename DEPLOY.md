# Deploying Helix (video-director) to helix.ycusriya.online

## What this app actually is
Looking at the repo directly (frontend/, server/), it's not one simple
static site — it's three moving parts:
- `frontend`: React + Vite SPA, calls its own backend via relative `/api/...`
  fetches with `credentials: "include"` (cookie auth) — so frontend and API
  must be served from the **same origin** in production.
- `server`: Node/Express API + Prisma **MySQL** database, using **Redis**
  (BullMQ) for a background video-render queue, `ffmpeg` for media
  processing, and Remotion (which drives a headless Chrome) to actually
  render the video reels.
- `server/qwen-tts`: an *optional* local Python TTS fallback (only used if
  ElevenLabs fails/isn't configured). Skip it for now — it needs
  torch/faster-whisper and GPU is recommended. Not included below.

So this needs more than a single container: MySQL + Redis + the API +
the built frontend.

## Files I've prepared
Drop these into your existing repo (same relative paths), don't recreate
the app itself:
```
server/Dockerfile
server/docker-entrypoint.sh
server/.dockerignore
frontend/Dockerfile
frontend/nginx.conf
frontend/.dockerignore
docker-compose.yml          (repo root)
.env.compose.example        (repo root)
deploy/helix.ycusriya.online.conf   (host nginx vhost)
```

---

## 1. DNS
Create the A record you mentioned:
```
Type: A
Host: helix
Value: <your AWS server's public IP>
TTL:  default
```
Wait for it to resolve (`dig helix.ycusriya.online` or `nslookup`).

## 2. Get the code on the server
SSH into the same AWS server that runs shop.tattoo, then:
```bash
cd /var/www          # or wherever you keep the other projects
git clone https://github.com/infosloption-byte/video-director.git helix
cd helix
```
Add the files above into this checkout (`server/Dockerfile`, etc.).

## 3. Configure environment variables

**`server/.env`** — copy from `server/.env.example` and fill in for
production:
```bash
cp server/.env.example server/.env
```
Key changes from the example, since this now runs in Docker:
```env
DATABASE_URL="mysql://helix:<MYSQL_PASSWORD>@mysql:3306/helix"
REDIS_URL="redis://redis:6379"
PORT=4000

# These matter once you're behind HTTPS on a real domain:
AUTH_PUBLIC_URL="https://helix.ycusriya.online"
AUTH_ALLOWED_ORIGINS="https://helix.ycusriya.online"
COOKIE_SECURE="true"
COOKIE_SAMESITE="Lax"

# Fill in whichever of these you actually use:
ELEVENLABS_API_KEY="..."
ELEVENLABS_VOICE_ID="..."
GEMINI_API_KEY="..."
TAVILY_API_KEY="..."
BRAVE_API_KEY="..."
PEXELS_API_KEY="..."

# Leave the Qwen TTS block as-is (QWEN3_TTS_ENABLED="false") unless you're
# also standing up server/qwen-tts as its own service.
```
`mysql` and `redis` above are the **service names** in docker-compose —
Docker's internal DNS resolves them, no need for real hostnames/IPs.

**`.env`** at the repo root (next to `docker-compose.yml`) — for the MySQL
container's own credentials:
```bash
cp .env.compose.example .env
```
```env
MYSQL_PASSWORD=<same password you put in DATABASE_URL above>
MYSQL_ROOT_PASSWORD=<a different strong password>
```

Never commit either `.env` file — check `.gitignore` covers them.

## 4. Build and start the stack
```bash
docker compose build
docker compose up -d
docker compose ps        # mysql/redis should be "healthy", api and frontend "running"
docker compose logs -f api   # watch it apply Prisma migrations and boot
```
The entrypoint script runs `prisma migrate deploy` automatically on first
boot (retrying until MySQL is ready), so you shouldn't need to do this by
hand. If you want to seed the demo signals like the local setup does:
```bash
docker compose exec api npm run prisma:seed
```

At this point the app is reachable at `http://127.0.0.1:8090` on the
server itself — not yet on the internet. Sanity check:
```bash
curl http://127.0.0.1:8090/api/health
```

## 5. Point host Nginx + Certbot at it
This follows the exact same pattern as your shop.tattoo subdomain:
```bash
sudo cp deploy/helix.ycusriya.online.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/helix.ycusriya.online.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```
Then issue the certificate (assuming certbot's already installed, as it
must be for shop.tattoo):
```bash
sudo certbot --nginx -d helix.ycusriya.online
```
Certbot edits that config file in place to add the SSL server block and a
redirect from port 80. Confirm renewal is already automated (it usually is
if certbot manages the other subdomain):
```bash
sudo certbot renew --dry-run
```

## 6. Verify
```bash
curl https://helix.ycusriya.online/api/health
```
should return `{"ok":true}`. Then open `https://helix.ycusriya.online` in a
browser and confirm the signals page loads and (if you have provider keys
set) that generating a storyboard/render actually works end-to-end — that
exercises Redis, the render worker, ffmpeg, and headless Chrome all at
once, which is the part most likely to need debugging on a fresh box.

## Notes on sizing
- Remotion renders spin up headless Chrome per job — on a small instance
  (e.g. t3.small/medium) keep an eye on memory during a render
  (`docker stats`). If renders OOM, that's your signal to bump the
  instance size before optimizing anything else.
- `helix_storage` is a named Docker volume holding rendered videos,
  exports, and audio (`storage/renders`, `storage/exports`,
  `storage/audio`, `storage/render-assets`). Back it up like you would any
  other persistent data — it isn't ephemeral.
- Updating the app later:
  ```bash
  git pull
  docker compose build
  docker compose up -d
  ```
  (migrations re-run automatically on the api container's boot.)
