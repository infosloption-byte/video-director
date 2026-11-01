#!/usr/bin/env bash
# Build and probe NEW gateway/worker images without touching running containers.
# Does not alter production Compose tags, attach live services or execute CUDA.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET="$ROOT/gpu-coordination/secrets/redis_password.txt"
NETWORK="voxora-gpu-coordination"
COORDINATOR="voxora-coordination-redis-1"
GATEWAY_IMAGE="voxora-gateway-coordination-preflight:20261101"
WORKER_IMAGE="voxora-media-coordination-preflight:20261101"

if [[ ! -s "$SECRET" ]]; then
  echo "Missing coordinator secret file; stopping." >&2
  exit 1
fi
if [[ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$COORDINATOR")" != "healthy" ]]; then
  echo "Coordinator is not healthy; stopping." >&2
  exit 1
fi
if [[ "$(sudo docker inspect --format '{{json .HostConfig.PortBindings}}' "$COORDINATOR")" != "{}" ]]; then
  echo "Coordinator has host-published ports; stopping." >&2
  exit 1
fi
if [[ "$(sudo docker network inspect --format '{{.Driver}}' "$NETWORK")" != "bridge" ]]; then
  echo "Coordinator Docker bridge network not found." >&2
  exit 1
fi

# Snapshot current running containers to detect any unintended replacement.
gateway_id="$(cd "$ROOT/tts-service" && sudo docker compose -p voxora-gpu -f docker-compose.gpu.yml ps -q gateway)"
worker_id="$(cd "$ROOT/gpu-media-service" && sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker ps -q worker)"
if [[ -z "$gateway_id" || -z "$worker_id" ]]; then
  echo "Expected live gateway/worker containers were not found. No changes made." >&2
  exit 1
fi
gateway_before="$(sudo docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.State.Running}}' "$gateway_id")"
worker_before="$(sudo docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.State.Running}}' "$worker_id")"

echo "Validating optional Compose files without deploying..."
bash "$ROOT/scripts/validate_gpu_coordination_compose.sh"

echo "Building separate TEST images; existing running image tags remain unchanged..."
sudo docker build \
  -f "$ROOT/tts-service/gateway/Dockerfile" \
  -t "$GATEWAY_IMAGE" "$ROOT/tts-service"
sudo docker build \
  -f "$ROOT/gpu-media-service/Dockerfile.worker" \
  -t "$WORKER_IMAGE" "$ROOT/gpu-media-service"

probe() {
  local service="$1"
  local image="$2"
  echo "Checking fresh $service image with a disposable container..."
  sudo docker run --rm \
    --network "$NETWORK" \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --tmpfs /tmp:rw,nosuid,noexec,size=32m \
    --tmpfs /data:rw,nosuid,size=16m \
    --mount "type=bind,src=$SECRET,dst=/run/secrets/coordinator_password,readonly" \
    --mount "type=bind,src=$ROOT/scripts,dst=/checks,readonly" \
    -e GPU_COORDINATION_ENABLED=false \
    -e GPU_COORDINATION_REDIS_HOST=voxora-gpu-coordinator \
    -e GPU_COORDINATION_REDIS_PASSWORD_FILE=/run/secrets/coordinator_password \
    -e "GPU_PREFLIGHT_SERVICE=$service" \
    --entrypoint python \
    "$image" -B /checks/check_gpu_stage_image.py
}

probe tts "$GATEWAY_IMAGE"
probe media "$WORKER_IMAGE"

gateway_after="$(sudo docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.State.Running}}' "$gateway_id")"
worker_after="$(sudo docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.State.Running}}' "$worker_id")"
if [[ "$gateway_before" != "$gateway_after" || "$worker_before" != "$worker_after" ]]; then
  echo "Running gateway or worker changed during preflight; investigate immediately." >&2
  exit 1
fi
echo "PASS: original TTS gateway and media worker container IDs and start times are unchanged."
echo "Both new images passed. Existing TTS/media containers have NOT been replaced."
echo "DO NOT enable GPU scheduling or run the service Compose overlays yet."
