# Voxora

Voxora is an AI-assisted research-to-video workspace for discovering topics, building research briefs and storyboards, generating narration, and editing/rendering videos.

## Services

- `frontend/`: React + Vite web client, served by Nginx.
- `server/`: Express API, Prisma/MySQL, Redis queues, FFmpeg, and Remotion/Chromium rendering.
- `tts-service/`: optional self-hosted narration gateway and model workers. Run this on suitable separate compute rather than assuming it fits on the application Lightsail instance.

## Deploy to the existing Lightsail host

Voxora uses its own MySQL container/database, Redis service, and application storage. It does not reuse Buildhire's `buildhire_db` or the personal website's resources. Each stack has separate persistent volumes.

1. Read [DEPLOY.md](./DEPLOY.md).
2. Copy `.env.lightsail.example` to `.env.lightsail` and generate two different database passwords: one for the Voxora app user and one for the MySQL root account.
3. Copy `server/.env.example` to `server/.env` and configure the external provider keys you use.
4. Validate and start the stack with:

   ```bash
   sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml config
   sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml build
   sudo docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml up -d
   ```

The web container binds to `127.0.0.1:8090`; the host Nginx virtual host forwards only the Voxora domain to it. Voxora's MySQL database, Redis data, rendered files, exports, and audio are persisted in Voxora-specific Docker volumes.

The original `docker-compose.yml` remains available for environments that already provide a shared MySQL Docker network. For the Lightsail host shared with other sites, use the dedicated Lightsail Compose file above.

Never commit `.env.lightsail` or `server/.env`. Do not expose MySQL, Redis, or port 8090 directly to the Internet.
