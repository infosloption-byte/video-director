#!/usr/bin/env bash
# Snapshot the LIVE TTS/media deployment before any optional coordination rollout.
# This NEVER runs docker compose up/down/build or enables GPU inference.
set -euo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TTS="$ROOT/tts-service"
MEDIA="$ROOT/gpu-media-service"
GATEWAY_TAG="voxora-gateway-coordination-preflight:20261101"
WORKER_TAG="voxora-media-coordination-preflight:20261101"

if [[ ! -f "$TTS/docker-compose.gpu.yml" ]]; then
  echo "BLOCKED: live untracked TTS Compose file missing." >&2
  exit 1
fi
if [[ ! -s "$ROOT/gpu-coordination/secrets/redis_password.txt" ]]; then
  echo "BLOCKED: coordinator secret missing." >&2
  exit 1
fi

echo "Validating production Compose files without deployment..."
bash "$ROOT/scripts/validate_gpu_coordination_compose.sh"

for tag in "$GATEWAY_TAG" "$WORKER_TAG"; do
  sudo docker image inspect "$tag" >/dev/null || {
    echo "BLOCKED: missing staged test image: $tag" >&2
    exit 1
  }
done

gateway_id="$(cd "$TTS" && sudo docker compose -p voxora-gpu -f docker-compose.gpu.yml ps -q gateway)"
worker_id="$(cd "$MEDIA" && sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker ps -q worker)"
if [[ -z "$gateway_id" || -z "$worker_id" ]]; then
  echo "BLOCKED: live gateway or worker container not found." >&2
  exit 1
fi

for id in "$gateway_id" "$worker_id"; do
  if [[ "$(sudo docker inspect --format '{{.State.Running}}' "$id")" != "true" ]]; then
    echo "BLOCKED: an expected live container is not running." >&2
    exit 1
  fi
done

gateway_image="$(sudo docker inspect --format '{{.Image}}' "$gateway_id")"
worker_image="$(sudo docker inspect --format '{{.Image}}' "$worker_id")"
sudo docker image inspect "$gateway_image" "$worker_image" >/dev/null

# The backups contain production secrets. Keep them outside Git and private.
BACKUP="$(mktemp -d "$HOME/voxora-gpu-rollout-XXXXXXXX")"
chmod 700 "$BACKUP"
copy_private() {
  local src="$1" dest="$2"
  if [[ -f "$src" ]]; then
    install -m 600 "$src" "$BACKUP/$dest"
  fi
}
copy_private "$TTS/docker-compose.gpu.yml" "tts-docker-compose.gpu.yml"
copy_private "$TTS/.env" "tts.env"
copy_private "$MEDIA/docker-compose.gpu.yml" "media-docker-compose.gpu.yml"
copy_private "$MEDIA/.env" "media.env"
# Coordinator password remains at its original protected path; do not duplicate it.

# Pin the original images to local rollback tags. This does not replace or restart a container.
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
old_gateway_tag="voxora-gateway-rollback:$stamp"
old_worker_tag="voxora-media-rollback:$stamp"
sudo docker tag "$gateway_image" "$old_gateway_tag"
sudo docker tag "$worker_image" "$old_worker_tag"

gateway_before="$(sudo docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.State.Running}}' "$gateway_id")"
worker_before="$(sudo docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.State.Running}}' "$worker_id")"

cat > "$BACKUP/manifest.txt" <<EOF
timestamp_utc=$stamp
git_commit=$(git -C "$ROOT" rev-parse HEAD)
gateway_container_id=$gateway_id
worker_container_id=$worker_id
gateway_previous_image_id=$gateway_image
worker_previous_image_id=$worker_image
gateway_rollback_tag=$old_gateway_tag
worker_rollback_tag=$old_worker_tag
gateway_staged_image=$GATEWAY_TAG
worker_staged_image=$WORKER_TAG
EOF
chmod 600 "$BACKUP/manifest.txt"

# Ensure no live container was replaced by the snapshot procedure.
gateway_after="$(sudo docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.State.Running}}' "$gateway_id")"
worker_after="$(sudo docker inspect --format '{{.Id}} {{.State.StartedAt}} {{.State.Running}}' "$worker_id")"
if [[ "$gateway_before" != "$gateway_after" || "$worker_before" != "$worker_after" ]]; then
  echo "BLOCKED: a live container changed while preparing rollout; investigate." >&2
  exit 1
fi
echo "PASS: live gateway and media worker unchanged."
echo "PASS: prior images pinned as local rollback tags."
echo "PASS: protected offline rollback files saved under: $BACKUP"
echo "This directory includes secrets. Never paste, upload or commit its contents."
echo "No production containers were deployed, recreated or restarted."
