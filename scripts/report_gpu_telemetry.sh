#!/usr/bin/env bash
# Read-only GPU EC2 host snapshot. Runs outbound to the authenticated Voxora API.
# Deployment is OPT-IN; does not start/stop/restart Docker, CUDA, TTS or media services.
set -euo pipefail
ENV_FILE="${VOXORA_GPU_METRICS_ENV:-/etc/voxora-gpu-telemetry.env}"
if [[ ! -r "$ENV_FILE" ]]; then echo "Missing protected telemetry configuration" >&2; exit 2; fi
# Configuration owned by the operator; enforce mode 600 and root ownership at setup.
# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a
: "${VOXORA_METRICS_TOKEN:?Configure VOXORA_METRICS_TOKEN}"
: "${VOXORA_METRICS_URL:=https://usevoxora.online/api/internal/telemetry/gpu}"
export VOXORA_METRICS_TOKEN VOXORA_METRICS_URL
python3 - <<'PY'
import datetime, json, os, subprocess, time, urllib.request

values = subprocess.check_output([
    "nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
    "--format=csv,noheader,nounits",
], text=True, timeout=8).splitlines()
if not values:
    raise RuntimeError("No NVIDIA GPU was reported")
rows = [[x.strip() for x in line.split(",")] for line in values]
if len(rows) != 1:
    raise RuntimeError("This reporter requires exactly one NVIDIA GPU; do not silently report only one device")
usage, used_mb, total_mb, temp = rows[0]
sample = {
    "collectedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "gpuPct": float(usage),
    "vramUsedBytes": int(float(used_mb) * 1048576),
    "vramTotalBytes": int(float(total_mb) * 1048576),
    "temperatureC": float(temp),
}

def meminfo():
    result = {}
    with open("/proc/meminfo", encoding="utf8") as stream:
        for line in stream:
            key, sep, value = line.partition(":")
            if sep and key in {"MemTotal", "MemAvailable"}:
                result[key] = int(value.strip().split()[0]) * 1024
    return result

def cpu_ticks():
    with open("/proc/stat", encoding="utf8") as stream:
        row = stream.readline().split()
    ticks = [int(value) for value in row[1:]]
    return sum(ticks), ticks[3] + (ticks[4] if len(ticks) > 4 else 0)

cpu_a, idle_a = cpu_ticks()
time.sleep(0.25)
cpu_b, idle_b = cpu_ticks()
if cpu_b > cpu_a:
    sample["cpuPct"] = round(100 * (1 - (idle_b - idle_a) / (cpu_b - cpu_a)), 1)

memory = meminfo()
if "MemTotal" in memory and "MemAvailable" in memory:
    sample["ramTotalBytes"] = memory["MemTotal"]
    sample["ramUsedBytes"] = memory["MemTotal"] - memory["MemAvailable"]
payload = json.dumps(sample).encode()
req = urllib.request.Request(
    os.environ["VOXORA_METRICS_URL"], data=payload, method="POST",
    headers={
        "Authorization": "Bearer " + os.environ["VOXORA_METRICS_TOKEN"],
        "Content-Type": "application/json",
    },
)
with urllib.request.urlopen(req, timeout=12) as response:
    if response.status != 202:
        raise RuntimeError(f"Telemetry ingest returned HTTP {response.status}")
print("GPU telemetry accepted")
PY
