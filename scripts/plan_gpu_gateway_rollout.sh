#!/usr/bin/env bash
# Plan a gateway-only coordination deployment. DRY RUN: no Docker up/down.
set -euo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TTS="$ROOT/tts-service"
MEDIA="$ROOT/gpu-media-service"
SNAPSHOT="${1:-}"

if [[ "$#" -ne 1 || -z "$SNAPSHOT" || ! -d "$SNAPSHOT" ]]; then
  echo "Usage: bash scripts/plan_gpu_gateway_rollout.sh /path/to/protected/snapshot" >&2
  exit 2
fi
SNAPSHOT="$(realpath "$SNAPSHOT")"
if [[ ! -O "$SNAPSHOT" ]]; then
  echo "BLOCKED: snapshot directory is not owned by the current user." >&2
  exit 1
fi
if [[ ! -f "$SNAPSHOT/manifest.txt" || ! -f "$SNAPSHOT/tts-docker-compose.gpu.yml" ]]; then
  echo "BLOCKED: snapshot manifest or live TTS Compose backup missing." >&2
  exit 1
fi
if [[ "$(stat -c %a "$SNAPSHOT")" != "700" ]]; then
  echo "BLOCKED: snapshot directory must be mode 700." >&2
  exit 1
fi

manifest_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {print substr($0, index($0,"=") + 1); exit}' "$SNAPSHOT/manifest.txt"
}

old_gateway="$(manifest_value gateway_container_id)"
old_worker="$(manifest_value worker_container_id)"
old_gateway_image="$(manifest_value gateway_previous_image_id)"
old_worker_image="$(manifest_value worker_previous_image_id)"
gateway_rollback="$(manifest_value gateway_rollback_tag)"
new_gateway="$(manifest_value gateway_staged_image)"
if [[ ! "$gateway_rollback" =~ ^voxora-gateway-rollback:[0-9]{8}T[0-9]{6}Z$ ||
      "$new_gateway" != "voxora-gateway-coordination-preflight:20261101" ||
      -z "$old_gateway" || -z "$old_worker" ||
      -z "$old_gateway_image" || -z "$old_worker_image" ]]; then
  echo "BLOCKED: unexpected or incomplete rollback manifest." >&2
  exit 1
fi

if ! cmp -s "$SNAPSHOT/tts-docker-compose.gpu.yml" "$TTS/docker-compose.gpu.yml"; then
  echo "BLOCKED: live TTS Compose differs from backup; investigate before rollout." >&2
  exit 1
fi
if [[ -f "$SNAPSHOT/tts.env" || -f "$TTS/.env" ]]; then
  if [[ ! -f "$SNAPSHOT/tts.env" || ! -f "$TTS/.env" ]] ||
      ! cmp -s "$SNAPSHOT/tts.env" "$TTS/.env"; then
    echo "BLOCKED: live TTS environment differs from backup." >&2
    exit 1
  fi
fi

gateway_id="$(cd "$TTS" && sudo docker compose -p voxora-gpu -f docker-compose.gpu.yml ps -q gateway)"
worker_id="$(cd "$MEDIA" && sudo docker compose -p voxora-media -f docker-compose.gpu.yml --profile worker ps -q worker)"
if [[ "$gateway_id" != "$old_gateway" || "$worker_id" != "$old_worker" ]]; then
  echo "BLOCKED: running service container IDs differ from snapshot." >&2
  exit 1
fi
gateway_image_id="$(sudo docker inspect --format '{{.Image}}' "$gateway_id")"
worker_image_id="$(sudo docker inspect --format '{{.Image}}' "$worker_id")"
if [[ "$gateway_image_id" != "$old_gateway_image" ||
      "$worker_image_id" != "$old_worker_image" ]]; then
  echo "BLOCKED: live service image IDs differ from snapshot." >&2
  exit 1
fi
for id in "$gateway_id" "$worker_id"; do
  if [[ "$(sudo docker inspect --format '{{.State.Running}}' "$id")" != true ]]; then
    echo "BLOCKED: gateway or media worker is not running." >&2
    exit 1
  fi
done

if [[ "$(sudo docker image inspect "$gateway_rollback" --format '{{.Id}}')" != "$old_gateway_image" ]]; then
  echo "BLOCKED: rollback tag does not resolve to the previously running gateway image." >&2
  exit 1
fi
sudo docker image inspect "$new_gateway" >/dev/null

# Confirm the coordinator remains healthy and no service scheduling is enabled.
if [[ "$(sudo docker inspect --format '{{.State.Health.Status}}' voxora-coordination-redis-1)" != healthy ]]; then
  echo "BLOCKED: coordinator is not healthy." >&2
  exit 1
fi
bash "$ROOT/scripts/validate_gpu_coordination_compose.sh"

NEW_OVERRIDE="$SNAPSHOT/gateway-new-image.override.yml"
ROLLBACK_OVERRIDE="$SNAPSHOT/gateway-rollback-image.override.yml"
printf 'services:\n  gateway:\n    image: %s\n' "$new_gateway" > "$NEW_OVERRIDE"
printf 'services:\n  gateway:\n    image: %s\n' "$gateway_rollback" > "$ROLLBACK_OVERRIDE"
chmod 600 "$NEW_OVERRIDE" "$ROLLBACK_OVERRIDE"

python3 "$ROOT/scripts/check_gpu_gateway_image_override.py" "$NEW_OVERRIDE" "$new_gateway"
python3 "$ROOT/scripts/check_gpu_gateway_image_override.py" "$ROLLBACK_OVERRIDE" "$gateway_rollback" --base-only

echo "PASS: live TTS Compose/environment match protected snapshot."
echo "PASS: running gateway and media worker match snapshot IDs and images."
echo "PASS: verified staged gateway and original rollback image tags."
echo "PASS: new and rollback Compose overrides validated without deployment."
echo "PLAN ONLY: no gateway, engine or media containers were changed."
echo "Prepared private overrides in: $SNAPSHOT"
echo "Do NOT run Docker Compose up yet: a quiet TTS maintenance window is required."
