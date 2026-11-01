#!/usr/bin/env bash
# Probe the actual coordinator without restarting or connecting running services.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
SECRET="$ROOT/gpu-coordination/secrets/redis_password.txt"
NETWORK="voxora-gpu-coordination"
CONTAINER="voxora-coordination-redis-1"

if [[ ! -s "$SECRET" ]]; then
  echo "Missing private coordinator password file." >&2
  exit 1
fi
if [[ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$CONTAINER")" != "healthy" ]]; then
  echo "GPU coordinator is not healthy." >&2
  exit 1
fi
if [[ "$(sudo docker inspect --format '{{json .HostConfig.PortBindings}}' "$CONTAINER")" != "{}" ]]; then
  echo "Refusing: coordinator has a published host port." >&2
  exit 1
fi
if [[ "$(sudo docker network inspect --format '{{.Driver}}' "$NETWORK")" != "bridge" ]]; then
  echo "Refusing: coordinator network is not a local bridge." >&2
  exit 1
fi
members=" $(sudo docker network inspect --format '{{range .Containers}}{{.Name}} {{end}}' "$NETWORK") "
if [[ "$members" != *" $CONTAINER "* ]]; then
  echo "Refusing: coordinator is not attached to the expected network." >&2
  exit 1
fi
sudo docker image inspect voxora-media-worker:latest >/dev/null

echo "Testing coordinator with a disposable client; no live services will be changed."
sudo docker run --rm \
  --network "$NETWORK" \
  --read-only \
  --tmpfs /tmp:rw,nosuid,noexec,size=32m \
  -v "$SECRET:/run/secrets/coordinator_password:ro" \
  -v "$ROOT/gpu-media-service:/app:ro" \
  -v "$ROOT/tts-service:/tts-service:ro" \
  -v "$ROOT/scripts:/scripts:ro" \
  -e "PYTHONPATH=/app:/tts-service" \
  --workdir /app \
  --entrypoint python \
  voxora-media-worker:latest \
  -B /scripts/smoke_gpu_coordinator.py

echo "Live TTS and media services remain on their original networks."
