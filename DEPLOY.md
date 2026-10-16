# Deploy Voxora to your existing Lightsail server

This guide deploys Voxora at `https://usevoxora.online` alongside your existing personal website and Buildhire installation.

Voxora uses a React/Vite frontend, an Express API, the existing shared MySQL instance, a private Redis queue service, FFmpeg, and Remotion/Chromium for video rendering. Buildhire already connects to the shared `mysql_shared` container over the external `shared_net` Docker network. Voxora uses that same MySQL server but has its own database and dedicated user; it must not use Buildhire's database. The optional self-hosted TTS service should remain on suitable separate compute.

## 1. Check the existing host first

SSH into the same Ubuntu Lightsail instance and inspect available memory, disk, containers, the MySQL network, and Nginx sites before deploying:

```bash
free -h
df -h
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker inspect mysql_shared --format '{{json .NetworkSettings.Networks}}'
docker network ls
sudo nginx -t
ls -la /etc/nginx/sites-enabled/
```

Buildhire's current Compose file expects the external Docker network `shared_net`. Confirm the `mysql_shared` container exists and check its attached network. If the network name differs, use the actual network name in `.env.lightsail`. **Do not start the Voxora stack until the existing MySQL container and network are confirmed.** Do not stop or remove existing containers. Video rendering can use significant memory; monitor it during the first render with `docker stats`.

## 2. Confirm Route 53 records

Ensure that the apex `A` record for `usevoxora.online` points to your Lightsail instance's **static IPv4 address**. A dynamic public IP can change when the instance is stopped and started; AWS recommends attaching a static IP for stable DNS. [AWS Lightsail static IP guide](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-create-static-ip.html).

Optionally, create a `www` CNAME pointing to `usevoxora.online`. If an `AAAA` record exists, ensure it targets a configured IPv6 endpoint. Verify:

```bash
dig +short usevoxora.online A
dig +short www.usevoxora.online
```

The apex A result should match the Lightsail static IP. If you do not use `www`, omit it from the certificate request.

## 3. Get the current code

```bash
sudo mkdir -p /opt/apps
sudo chown "$USER":"$USER" /opt/apps
cd /opt/apps
git clone https://github.com/infosloption-byte/video-director.git voxora
cd /opt/apps/voxora
```

If `/opt/apps/voxora` already exists, do not clone over it; inspect the existing checkout and back up any local changes first.

## 4. Create production environment files and database

Create the configuration files:

```bash
cp .env.lightsail.example .env.lightsail
cp server/.env.example server/.env
openssl rand -hex 32
nano .env.lightsail
nano server/.env
```

Copy the generated 64-character hexadecimal value into `DB_PASSWORD` in `.env.lightsail`. Hexadecimal is intentional: the application entrypoint builds the MySQL URL from these values, so a hex-only password avoids URL-escaping errors. Set:

- `DB_DATABASE=voxora`
- `DB_USERNAME=voxora_app`
- `SHARED_MYSQL_NETWORK=shared_net` (or the actual network name confirmed in step 1)
- `AUTH_PUBLIC_URL=https://usevoxora.online`
- `AUTH_ALLOWED_ORIGINS=https://usevoxora.online,https://www.usevoxora.online`

Now create the dedicated database and user on the **existing** shared MySQL server. Enter the MySQL root password when prompted:

```bash
docker exec -it mysql_shared mysql -uroot -p
```

At the MySQL prompt, run the following statements, replacing `PASTE_THE_SAME_HEX_VALUE_AS_DB_PASSWORD` with the value in `.env.lightsail`:

```sql
CREATE DATABASE IF NOT EXISTS voxora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'voxora_app'@'%' IDENTIFIED BY 'PASTE_THE_SAME_HEX_VALUE_AS_DB_PASSWORD';
ALTER USER 'voxora_app'@'%' IDENTIFIED BY 'PASTE_THE_SAME_HEX_VALUE_AS_DB_PASSWORD';
GRANT ALL PRIVILEGES ON voxora.* TO 'voxora_app'@'%';
FLUSH PRIVILEGES;
EXIT;
```

This grants the Voxora account access only to the `voxora` database, not Buildhire's database. Do not use the MySQL root account for the application. Keep the real password out of Git.

In `server/.env`, configure the external provider credentials you intend to use, such as `GEMINI_API_KEY`, `TAVILY_API_KEY` or `BRAVE_API_KEY`, and `PEXELS_API_KEY`. Never commit that file. Production authentication is enforced, development auth fallback is disabled, and secure cookies are enabled by the Lightsail Compose configuration.

If your separately hosted TTS service is still available, set `TTS_SERVICE_URL` and `TTS_SERVICE_AUTH_TOKEN` in `.env.lightsail`. The URL must be reachable **from the Lightsail Docker container**; a private IP from a different VPC may not be reachable. If this URL is empty or unreachable, narration generation will be unavailable; do not assume it will fall back automatically. Test the endpoint from the Lightsail host before enabling narration for users.

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

It should return HTTP 200 with a healthy JSON response before proceeding.

## 6. Add a separate Nginx virtual host

The repository includes `deploy/usevoxora.online.conf`. It forwards only requests for Voxora's domain to `127.0.0.1:8090`; it does not replace the virtual hosts for your other sites.

```bash
sudo cp deploy/usevoxora.online.conf /etc/nginx/sites-available/usevoxora.online
sudo ln -s /etc/nginx/sites-available/usevoxora.online /etc/nginx/sites-enabled/usevoxora.online
sudo nginx -t
sudo systemctl reload nginx
```

If the link already exists, inspect it instead of creating a duplicate. If Nginx reports a conflict, inspect the existing virtual hosts rather than changing the server's default site.

If Certbot is not installed, follow the [AWS Lightsail Nginx HTTPS guide](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-using-lets-encrypt-certificates-with-nginx.html) for your Ubuntu setup. Once DNS is resolving, request HTTPS:

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
5. Narration works through the configured TTS service.
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

Back up the shared MySQL instance according to the existing infrastructure procedure and back up the Voxora `redis_data` and `app_storage` volumes as appropriate. **Do not run `docker compose down -v`** for routine updates; removing Voxora's volumes would delete its Redis data and saved render/audio files. Do not expose MySQL, Redis, or port 8090 through the Lightsail firewall.
