#!/usr/bin/env bash
# Read-only Compose validation. Does not create, recreate or restart containers.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"

if [[ ! -s "$ROOT/gpu-coordination/secrets/redis_password.txt" ]]; then
  echo "Missing coordinator secret file. See gpu-coordination/README.md." >&2
  exit 1
fi
if [[ ! -f "$ROOT/tts-service/docker-compose.gpu.yml" ]]; then
  echo "Live TTS base Compose file is missing; do not replace it." >&2
  exit 1
fi

echo "Checking dedicated coordinator Compose..."
(cd "$ROOT/gpu-coordination" && sudo docker compose -p voxora-coordination -f docker-compose.yml config --quiet)
echo "Checking TTS base + coordination overlay (no deployment)..."
(cd "$ROOT/tts-service" && sudo docker compose -p voxora-gpu -f docker-compose.gpu.yml -f docker-compose.coordination.yml config --quiet)
echo "Checking GPU media base + coordination overlay (no deployment)..."
(cd "$ROOT/gpu-media-service" && sudo docker compose -p voxora-media -f docker-compose.gpu.yml -f docker-compose.coordination.yml --profile worker config --quiet)
echo "Compose validation passed; no containers changed."
