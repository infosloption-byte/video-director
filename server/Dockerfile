FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    npm_config_loglevel=warn

WORKDIR /app

# System deps:
# - openssl/ca-certificates: required by Prisma's query engine on Debian
# - ffmpeg: used directly by mediaProcessing.js / ttsService.js
# - the libnss3/libatk/... set: required by the headless Chrome that
#   @remotion/renderer downloads and drives to render video compositions
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    wget \
    ffmpeg \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgbm1 \
    libasound2 \
    libxrandr2 \
    libxkbcommon0 \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev \
  && npx prisma generate

# App source
COPY . .

# Pre-download the headless Chrome build Remotion needs at build time so the
# first render doesn't stall/fail on a cold container. Non-fatal if it
# can't reach the network at build time (e.g. offline builds) — it will be
# retried on first render instead.
RUN npx remotion browser ensure || true

# Writable storage for renders/exports/audio/render-assets. Mount this as a
# volume in docker-compose so files survive container restarts.
RUN mkdir -p storage/renders storage/exports storage/render-assets storage/audio

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
