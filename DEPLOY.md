# Deploying Helix (video-director) to helix.ycusriya.online

## What this app actually is
Looking at the repo directly (frontend/, server/), it's not one simple
static site — it's several moving parts:
- `frontend`: React + Vite SPA, calls its own backend via relative `/api/...`
  fetches with `credentials: "include"` (cookie auth) — so frontend and API
  must be served from the **same origin** in production.
- `server`: Node/Express API + Prisma **MySQL**, using **Redis**
  (BullMQ) for a background video-render queue, `ffmpeg` for media
  processing, and Remotion (which drives a headless Chrome) to actually
  render the video reels.
- `server/qwen-tts`: an optional Python Qwen3-TTS fallback. It is deliberately
  kept separate from the Node process and can run on the same machine during
  local development or on a dedicated GPU EC2 instance in AWS.

For production with Qwen, use two compute hosts:

```text
EC2 #1 — Helix frontend + backend + MySQL + Redis
                 |
                 | private VPC connection to TCP 8000
                 v
EC2 #2 — Qwen3-TTS GPU service
```

## Files prepared for deployment

```text
server/Dockerfile
server/docker-entrypoint.sh
server/.dockerignore
server/qwen-tts/Dockerfile
server/qwen-tts/docker-compose.yml
server/qwen-tts/.dockerignore
frontend/Dockerfile
frontend/nginx.conf
frontend/.dockerignore
docker-compose.yml
.env.compose.example
deploy/helix.ycusriya.online.conf
```

---

## 1. DNS
Create the A record you mentioned:

```text
Type: A
Host: helix
Value: <your AWS server's public IP>
TTL: default
```

Wait for it to resolve (`dig helix.ycusriya.online` or `nslookup`).

## 2. Get the code on the Helix server

SSH into the EC2 instance that runs the Helix application:

```bash
cd /var/www
git clone https://github.com/infosloption-byte/video-director.git helix
cd helix
```

## 3. Configure the Helix backend

Copy `server/.env.example`:

```bash
cp server/.env.example server/.env
```

Use Docker service names for MySQL and Redis:

```env
DATABASE_URL="mysql://helix:<MYSQL_PASSWORD>@mysql:3306/helix"
REDIS_URL="redis://redis:6379"
PORT=4000

AUTH_PUBLIC_URL="https://helix.ycusriya.online"
AUTH_ALLOWED_ORIGINS="https://helix.ycusriya.online"
COOKIE_SECURE="true"
COOKIE_SAMESITE="Lax"

ELEVENLABS_API_KEY="..."
ELEVENLABS_VOICE_ID="..."
GEMINI_API_KEY="..."
TAVILY_API_KEY="..."
BRAVE_API_KEY="..."
PEXELS_API_KEY="..."
```

### Qwen3-TTS configuration

For the two-EC2 production setup, point the backend at the **private** address
of the dedicated Qwen server:

```env
QWEN3_TTS_ENABLED="true"
QWEN3_TTS_URL="http://10.0.2.25:8000"
QWEN3_TTS_TIMEOUT_MS="120000"
QWEN3_TTS_AUTH_TOKEN="use-a-long-random-shared-secret"
QWEN3_TTS_MODEL="Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
QWEN3_TTS_VOICE="Ryan"
QWEN3_TTS_LANGUAGE="English"
```

Do not use `127.0.0.1:8000` in the production backend when Qwen is on another
EC2. `127.0.0.1` means the backend container itself.

## 4. Configure the root Compose stack

Create the root environment file:

```bash
cp .env.compose.example .env
```

Set strong MySQL credentials:

```env
MYSQL_PASSWORD=<same password used in DATABASE_URL>
MYSQL_ROOT_PASSWORD=<different strong root password>
```

Never commit either `.env` file.

Build and start the main stack:

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f api
```

The API entrypoint applies Prisma migrations after MySQL becomes ready.

Sanity check:

```bash
curl http://127.0.0.1:8090/api/health
```

## 5. Deploy Qwen on the second EC2

The same repository contains the Qwen service so local development and AWS
use exactly the same implementation.

On the GPU EC2:

```bash
git clone https://github.com/infosloption-byte/video-director.git helix
after_cd=helix/server/qwen-tts
cd "$after_cd"
docker compose up -d --build
docker compose ps
docker compose logs -f qwen-tts
```

The bundled Qwen Compose file:

- builds from `server/qwen-tts/Dockerfile`;
- uses NVIDIA GPU access;
- exposes port 8000;
- keeps Hugging Face model weights in a persistent Docker volume;
- runs one Uvicorn worker for one GPU/model process.

For AWS, change the Compose port binding from the default localhost binding to
an interface reachable from the private VPC, for example:

```yaml
ports:
  - "0.0.0.0:8000:8000"
```

Also set the same `QWEN3_TTS_AUTH_TOKEN` value on the Qwen EC2 environment.

Do **not** open port 8000 to `0.0.0.0/0` in the EC2 security group. Allow TCP
8000 only from the Helix backend EC2 security group.

Check the Qwen service from the Qwen host first:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/diagnostics
```

Then, from the Helix backend host/container, verify the private URL:

```bash
curl http://10.0.2.25:8000/health
```

When authentication is enabled, use the configured bearer token.

## 6. Local development still works

There is no AWS-only code path.

For a normal local Node backend, run the Qwen service directly:

```bash
cd server/qwen-tts
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
.venv\\Scripts\\python -m uvicorn service:app --host 127.0.0.1 --port 8000
```

Keep local backend configuration at:

```env
QWEN3_TTS_ENABLED="true"
QWEN3_TTS_URL="http://127.0.0.1:8000"
```

For a Dockerized local backend with a Qwen process running directly on the
host, use:

```env
QWEN3_TTS_URL="http://host.docker.internal:8000"
```

For a local NVIDIA machine running Qwen in Docker, from `server/qwen-tts`:

```bash
docker compose up -d --build
```

This keeps the same API contract used by AWS.

## 7. Point host Nginx + Certbot at the Helix stack

This follows the same pattern as the existing subdomain setup:

```bash
sudo cp deploy/helix.ycusriya.online.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/helix.ycusriya.online.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Then issue the certificate:

```bash
sudo certbot --nginx -d helix.ycusriya.online
sudo certbot renew --dry-run
```

## 8. Verify end-to-end narration fallback

First check backend diagnostics:

```text
GET /api/tts/diagnostics
```

It should show Qwen enabled and reachable when the private connection is
working.

Then create a narration using an account/project where ElevenLabs is expected
to fail or be unavailable. Helix should attempt ElevenLabs first, then call
Qwen through `QWEN3_TTS_URL`, convert the returned WAV to the normal scene MP3,
and preserve the returned word timing metadata.

If Qwen is unreachable, the diagnostic result should identify the connection
failure without exposing the secret token.

## 9. Persistent storage and updates

`helix_storage` is a named Docker volume holding rendered videos, exports,
audio, and render assets. Back it up like other persistent production data.

The Qwen container has a separate persistent Hugging Face cache volume so the
large model does not have to be downloaded again every time the container is
recreated.

To update Helix later:

```bash
git pull
docker compose build
docker compose up -d
```

To update Qwen on its GPU EC2:

```bash
cd /var/www/helix/server/qwen-tts
git pull
docker compose build
docker compose up -d
```
