# Deploy Voxora to your existing Lightsail server

This guide deploys Voxora at `https://usevoxora.online` alongside your existing personal website and Buildhire installation.

Voxora uses a React/Vite frontend, an Express API, MySQL through Prisma, Redis queues, FFmpeg, and Remotion/Chromium for video rendering. The Lightsail compose file defines an isolated MySQL database and Redis instance for Voxora so it does not depend on or modify Buildhire's database. The optional self-hosted TTS service should remain on its suitable dedicated host.

## 1. Check the existing host first

SSH into the same Ubuntu Lightsail instance and inspect available memory, disk, containers, and Nginx sites before deploying:

```bash
free -h
df -h
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker network ls
sudo nginx -t
ls -la /etc/nginx/sites-enabled/
```

Do not stop or remove existing containers. Video rendering can use significant memory; monitor it during the first render with `docker stats`.

## 2. Confirm Route 53 records

Attach a Lightsail static IP to the instance, then make sure the Route 53 hosted zone has:

- An apex `A` record for `usevoxora.online` pointing to that static IPv4 address.
- Optionally, a `www` CNAME record pointing to `usevoxora.online`.

If an `AAAA` record exists, confirm it points to the correct IPv6 endpoint or remove it if IPv6 is not configured for this host. Verify DNS before requesting HTTPS:

```bash
dig +short usevoxora.online A
dig +short www.usevoxora.online
```

The first result must match the server's static IPv4 address. If you are not using `www`, omit it from the certificate command below.

## 3. Get the current code

```bash
sudo mkdir -p /opt/apps
sudo chown "$USER":"$USER" /opt/apps
cd /opt/apps
git clone https://github.com/infosloption-byte/video-director.git voxora
cd /opt/apps/voxora
```

If `/opt/apps/voxora` already exists, do not clone over it; inspect the existing checkout and back up any local changes first.

## 4. Create production environment files

Create the Compose variables file and application environment file:

```bash
cp .env.lightsail.example .env.lightsail
cp server/.env.example server/.env
openssl rand -hex 32
openssl rand -hex 32
nano .env.lightsail
nano server/.env
```

Use the first generated random value for `DB_PASSWORD` and the second, different value for `MYSQL_ROOT_PASSWORD` in `.env.lightsail`. Use these hex-only values so the database connection URL assembled by the entrypoint is not broken by special URL characters.

Set your actual production values in `.env.lightsail`:

- `DB_DATABASE=voxora`
- `DB_USERNAME=voxora_app`
- `DB_PASSWORD` and `MYSQL_ROOT_PASSWORD` to the generated secrets
- `AUTH_PUBLIC_URL=https://usevoxora.online`
- `AUTH_ALLOWED_ORIGINS=https://usevoxora.online,https://www.usevoxora.online`

The Lightsail compose file deliberately supplies an empty `DATABASE_URL` to the API container so `server/docker-entrypoint.sh` builds it from the `DB_*` values for the internal `db` service. Do not put production database credentials in Git.

In `server/.env`, configure the external provider credentials you intend to use (for example Gemini, Tavily, Brave, or Pexels). Never commit that file. Production auth is set to required, development auth fallback is disabled, and secure cookies are enabled by the Lightsail Compose configuration.

If your separately hosted TTS service is still available, set `TTS_SERVICE_URL` and `TTS_SERVICE_AUTH_TOKEN` in `.env.lightsail`. The URL must be reachable **from the Lightsail Docker container**; a private IP from a different VPC may not be reachable. Leave these values empty if you have not verified connectivity and use the configured provider fallback supported by your application.

## 5. Validate, build, and start Voxora

Run these from `/opt/apps/voxora`:

```bash
docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml config
docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build
docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d
docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml ps
docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml logs --tail=150 api
```

The API entrypoint retries the MySQL connection and applies Prisma migrations before starting. If the API fails to start, inspect its logs before retrying; do not delete volumes or reset the database.

Check the local health endpoint:

```bash
curl -i http://127.0.0.1:8090/api/health
```

It should return HTTP 200 with a healthy JSON response before you proceed.

## 6. Add a separate Nginx virtual host

The repository includes `deploy/usevoxora.online.conf`. It forwards only requests for Voxora's domain to `127.0.0.1:8090`; it does not replace the virtual hosts for your other sites.

```bash
sudo cp deploy/usevoxora.online.conf /etc/nginx/sites-available/usevoxora.online
sudo ln -s /etc/nginx/sites-available/usevoxora.online /etc/nginx/sites-enabled/usevoxora.online
sudo nginx -t
sudo systemctl reload nginx
```

If the link already exists, inspect it instead of creating a duplicate. If Nginx reports a conflict, check the existing virtual hosts rather than changing the server's default site.

If Certbot is not installed, install the Nginx plugin package for your Ubuntu version. Then request HTTPS:

```bash
sudo certbot --nginx -d usevoxora.online -d www.usevoxora.online
sudo certbot renew --dry-run
```

Only include `www.usevoxora.online` if its DNS record resolves correctly. Certbot configures the HTTPS server block and HTTP-to-HTTPS redirect.

## 7. Final verification

Check all of the following:

1. `https://usevoxora.online` loads with the Voxora brand and a valid certificate.
2. `https://usevoxora.online/api/health` returns healthy JSON.
3. Sign-up, sign-in, sign-out, email verification, and password reset work with the production configuration.
4. Creating a research brief and storyboard works with the provider keys you configured.
5. Narration works through the chosen TTS/provider path.
6. A short video renders successfully, and the output survives a container restart.

Monitor memory and storage during the first render. If Chromium/Remotion is killed or Docker reports an OOM condition, increase the Lightsail plan before inviting users.

## 8. Safe updates and backups

To update later:

```bash
cd /opt/apps/voxora
git pull --ff-only
docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build
docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d
```

Back up MySQL and the `app_storage` volume regularly. **Do not run `docker compose down -v`** for routine updates; removing volumes would delete Voxora's database and saved render/audio files. Do not expose ports 3306, 6379, or 8090 through the Lightsail firewall.
