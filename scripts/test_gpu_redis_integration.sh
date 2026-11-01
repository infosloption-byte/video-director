#!/usr/bin/env bash
# Run REAL Redis GPU-lease integration tests in a disposable, isolated network.
# No production containers, GPU devices, or Redis queues are touched.
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$HERE/.." && pwd)"
MEDIA_DIR="$ROOT/gpu-media-service"
DOCKER=(sudo docker)
NETWORK="voxora-gpu-redis-test-$$"
REDIS_NAME="voxora-gpu-test-redis-$$"
PASSWORD="$(openssl rand -hex 24)"

cleanup() {
  "${DOCKER[@]}" rm -f "$REDIS_NAME" >/dev/null 2>&1 || true
  "${DOCKER[@]}" network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${DOCKER[@]}" image inspect voxora-media-worker:latest >/dev/null

echo "Creating temporary internal-only Docker network..."
"${DOCKER[@]}" network create --internal "$NETWORK" >/dev/null

echo "Starting isolated, password-protected Redis (no host ports)..."
"${DOCKER[@]}" run --rm -d \
  --name "$REDIS_NAME" \
  --network "$NETWORK" \
  -e "TEST_REDIS_PASSWORD=$PASSWORD" \
  redis:7-alpine \
  sh -ec 'exec redis-server --save "" --appendonly no --maxmemory 64mb --maxmemory-policy noeviction --requirepass "$TEST_REDIS_PASSWORD"' >/dev/null

ready=0
for _ in $(seq 1 30); do
  if "${DOCKER[@]}" exec "$REDIS_NAME" \
       sh -ec 'REDISCLI_AUTH="$TEST_REDIS_PASSWORD" redis-cli ping' \
       2>/dev/null | grep -q PONG; then
    ready=1
    break
  fi
  sleep 0.25
done
if [[ "$ready" != "1" ]]; then
  echo "Disposable Redis failed to become ready." >&2
  exit 1
fi

echo "Running cross-container coordination tests with production worker Python..."
"${DOCKER[@]}" run --rm \
  --network "$NETWORK" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -e "GPU_COORDINATION_TEST_REDIS_URL=redis://:$PASSWORD@$REDIS_NAME:6379/0" \
  -v "$MEDIA_DIR:/app:ro" \
  -w /app \
  --entrypoint python \
  voxora-media-worker:latest \
  -B -m unittest discover -s tests -p "test_gpu_redis_integration.py" -v

echo "Disposable Redis integration tests passed; temporary resources are being removed."
