#!/usr/bin/env bash
# Gateway-only deployment, explicitly gated. Never enables GPU scheduling.
set -euo pipefail
umask 077

root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
tts="$root/tts-service"
media="$root/gpu-media-service"
mode="$1"
snapshot="$2"

if [[ "$#" != 2 && "$#" != 3 ]] ||
   [[ "$mode" != check && "$mode" != deploy && "$mode" != rollback ]] ||
   [[ ! -d "$snapshot" ]]; then
  echo "Usage: bash scripts/rollout_gpu_gateway.sh check|deploy|rollback SNAPSHOT_DIR [--accept-tts-interruption]" >&2
  exit 2
fi
if [[ "$mode" == deploy && "$#" == 3 && "$3" == --accept-tts-interruption ]]; then
  :
elif [[ "$mode" == deploy || "$#" == 3 ]]; then
  echo "BLOCKED: deploy requires --accept-tts-interruption." >&2
  exit 2
fi

snapshot="$(realpath "$snapshot")"
[[ -O "$snapshot" && "$(stat -c %a "$snapshot")" == 700 ]] || {
  echo "BLOCKED: snapshot must be owned by current user and mode 700." >&2; exit 1;
}
[[ -s "$snapshot/manifest.txt" ]] || {
  echo "BLOCKED: snapshot manifest missing." >&2; exit 1;
}
manifest() {
  awk -F= -v key="$1" '$1==key {print substr($0,index($0,"=")+1); exit}' "$snapshot/manifest.txt"
}
old_gateway="$(manifest gateway_container_id)"
old_worker="$(manifest worker_container_id)"
old_gateway_image="$(manifest gateway_previous_image_id)"
old_worker_image="$(manifest worker_previous_image_id)"
rollback_tag="$(manifest gateway_rollback_tag)"
new_tag="$(manifest gateway_staged_image)"
new_override="$snapshot/gateway-new-image.override.yml"
old_override="$snapshot/gateway-rollback-image.override.yml"
[[ "$rollback_tag" =~ ^voxora-gateway-rollback:[0-9]{8}T[0-9]{6}Z$ &&
   "$new_tag" == "voxora-gateway-coordination-preflight:20261101" ]] || {
  echo "BLOCKED: unexpected rollout images in manifest." >&2; exit 1;
}
[[ -f "$new_override" && -f "$old_override" ]] || {
  echo "BLOCKED: image overrides missing." >&2; exit 1;
}
[[ -f "$tts/docker-compose.gpu.yml" &&
   -f "$snapshot/tts-docker-compose.gpu.yml" ]] &&
cmp -s "$tts/docker-compose.gpu.yml" "$snapshot/tts-docker-compose.gpu.yml" || {
  echo "BLOCKED: base TTS Compose differs from snapshot." >&2; exit 1;
}
if [[ -f "$tts/.env" || -f "$snapshot/tts.env" ]]; then
  [[ -f "$tts/.env" && -f "$snapshot/tts.env" ]] &&
  cmp -s "$tts/.env" "$snapshot/tts.env" || {
    echo "BLOCKED: TTS environment differs from snapshot." >&2; exit 1;
  }
fi

python3 "$root/scripts/check_gpu_gateway_image_override.py" "$new_override" "$new_tag"
python3 "$root/scripts/check_gpu_gateway_image_override.py" "$old_override" "$rollback_tag" --base-only
[[ "$(sudo docker image inspect "$rollback_tag" --format '{{.Id}}')" == "$old_gateway_image" ]] || {
  echo "BLOCKED: rollback tag no longer points at original image." >&2; exit 1;
}
new_image="$(sudo docker image inspect "$new_tag" --format '{{.Id}}')"

worker="$(cd "$media" && sudo docker compose -p voxora-media \
  -f docker-compose.gpu.yml --profile worker ps -q worker)"
[[ "$worker" == "$old_worker" &&
   "$(sudo docker inspect "$worker" --format '{{.Image}}')" == "$old_worker_image" ]] || {
  echo "BLOCKED: media worker changed since snapshot." >&2; exit 1;
}

gateway="$(cd "$tts" && sudo docker compose -p voxora-gpu \
  -f docker-compose.gpu.yml ps -a -q gateway)"
[[ -n "$gateway" ]] || { echo "BLOCKED: gateway is missing." >&2; exit 1; }
gateway_image="$(sudo docker inspect "$gateway" --format '{{.Image}}')"

# Remember original engine IDs, to ensure no dependency is recreated.
engine_ids=""
for engine in kokoro melotts-v3 chatterbox-nano qwen3-tts-0.6b; do
  id="$(cd "$tts" && sudo docker compose -p voxora-gpu \
    -f docker-compose.gpu.yml ps -q "$engine")"
  [[ -n "$id" ]] || { echo "BLOCKED: TTS engine not running: $engine" >&2; exit 1; }
  engine_ids="$engine_ids $id"
done

engines_unchanged() {
  local now=""
  local engine id
  for engine in kokoro melotts-v3 chatterbox-nano qwen3-tts-0.6b; do
    id="$(cd "$tts" && sudo docker compose -p voxora-gpu \
      -f docker-compose.gpu.yml ps -q "$engine")"
    now="$now $id"
  done
  [[ "$now" == "$engine_ids" ]]
}
healthy() {
  local attempt
  for attempt in $(seq 1 20); do
    if curl -fsS --max-time 3 http://127.0.0.1:8000/health 2>/dev/null |
      python3 -c 'import json,sys; j=json.load(sys.stdin); sys.exit(0 if j.get("ok") is True and j.get("service")=="helix-tts" else 1)' 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}
restore() {
  echo "Restoring previous TTS gateway image and base-only Compose networks..."
  (cd "$tts" && sudo docker compose -p voxora-gpu \
    -f docker-compose.gpu.yml -f "$old_override" \
    up -d --no-deps --no-build --force-recreate gateway)
  local id
  id="$(cd "$tts" && sudo docker compose -p voxora-gpu -f docker-compose.gpu.yml ps -q gateway)"
  [[ "$(sudo docker inspect "$id" --format '{{.Image}}')" == "$old_gateway_image" ]] &&
    healthy && engines_unchanged && {
      echo "PASS: rollback gateway image and health restored, engine IDs unchanged."
      return 0
    }
  echo "URGENT: rollback did not fully verify; investigate TTS gateway." >&2
  return 1
}

if [[ "$mode" == check ]]; then
  [[ "$gateway" == "$old_gateway" && "$gateway_image" == "$old_gateway_image" ]] || {
    echo "BLOCKED: gateway changed from snapshot." >&2; exit 1;
  }
  bash "$root/scripts/plan_gpu_gateway_rollout.sh" "$snapshot"
  echo "PASS: deployment checks completed. No containers changed."
  exit 0
fi

if [[ "$mode" == rollback ]]; then
  [[ "$gateway_image" == "$old_gateway_image" || "$gateway_image" == "$new_image" ]] || {
    echo "BLOCKED: gateway image unrelated to this rollout." >&2; exit 1;
  }
  restore
  exit $?
fi

[[ "$gateway" == "$old_gateway" && "$gateway_image" == "$old_gateway_image" ]] || {
  echo "BLOCKED: gateway changed since snapshot." >&2; exit 1;
}
bash "$root/scripts/plan_gpu_gateway_rollout.sh" "$snapshot"
healthy || { echo "BLOCKED: existing gateway health failed before deployment." >&2; exit 1; }

echo "The next action recreates ONLY TTS gateway and briefly interrupts requests."
echo "Verify that no TTS requests are in flight and upstream traffic is paused."
read -r -p "Type DEPLOY-GATEWAY to confirm a quiet window: " answer
[[ "$answer" == "DEPLOY-GATEWAY" ]] || { echo "Aborted; no changes."; exit 2; }

attempted=0
complete=0
recover() {
  status=$?
  trap - EXIT
  if [[ "$attempted" == 1 && "$complete" != 1 ]]; then
    echo "Gateway deployment failed; attempting automatic rollback..." >&2
    restore || echo "URGENT: automatic rollback failed. See gpu-coordination/ROLLOUT.md." >&2
  fi
  exit "$status"
}
trap recover EXIT

attempted=1
(cd "$tts" && sudo docker compose -p voxora-gpu \
  -f docker-compose.gpu.yml \
  -f docker-compose.coordination.yml \
  -f "$new_override" \
  up -d --no-deps --no-build --force-recreate gateway)

gateway_new="$(cd "$tts" && sudo docker compose -p voxora-gpu \
  -f docker-compose.gpu.yml ps -q gateway)"
[[ -n "$gateway_new" && "$gateway_new" != "$old_gateway" &&
   "$(sudo docker inspect "$gateway_new" --format '{{.Image}}')" == "$new_image" ]]
sudo docker exec "$gateway_new" python -c '
import os
from pathlib import Path
assert os.environ.get("GPU_COORDINATION_ENABLED") == "false"
assert os.environ.get("GPU_COORDINATION_REDIS_HOST") == "voxora-gpu-coordinator"
assert Path("/run/secrets/coordinator_password").is_file()
print("PASS: gateway secret mounted, GPU coordination OFF")
'
healthy
engines_unchanged
[[ "$(cd "$media" && sudo docker compose -p voxora-media \
  -f docker-compose.gpu.yml --profile worker ps -q worker)" == "$old_worker" ]]

complete=1
echo "PASS: new gateway image, health, TTS engine IDs and media worker verified."
echo "GPU scheduling remains disabled. Test real narration before deploying media worker."
echo "Rollback: bash scripts/rollout_gpu_gateway.sh rollback SNAPSHOT_DIR"
