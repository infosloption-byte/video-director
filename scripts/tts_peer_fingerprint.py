#!/usr/bin/env python3
"""Capture non-gateway containers by Compose project label, not assumed service names.

Outputs a deterministic, non-secret fingerprint for comparison before/after a
gateway-only rollout. Does not mutate the Docker daemon.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys


class PeerDiscoveryError(RuntimeError):
    pass


def parse_peers(gateway_id: str, all_ids: list[str], inspected: list[dict]) -> list[dict]:
    if not re.fullmatch(r"[0-9a-f]{64}", gateway_id):
        raise PeerDiscoveryError("Invalid gateway ID.")
    if gateway_id not in all_ids:
        raise PeerDiscoveryError("The gateway is not in the expected Compose project.")
    peer_ids = set(all_ids) - {gateway_id}
    if not peer_ids:
        raise PeerDiscoveryError("No other TTS containers found in Compose project.")
    if len(all_ids) != len(set(all_ids)):
        raise PeerDiscoveryError("Duplicate Docker IDs found.")
    if {entry.get("Id") for entry in inspected} != peer_ids:
        raise PeerDiscoveryError("Docker peer inspection did not match project membership.")

    records = []
    for entry in inspected:
        state = entry.get("State")
        labels = entry.get("Config", {}).get("Labels") or {}
        if not isinstance(state, dict):
            raise PeerDiscoveryError("Incomplete Docker state.")
        if labels.get("com.docker.compose.project") != "voxora-gpu":
            raise PeerDiscoveryError("Container has unexpected Compose project label.")
        service = labels.get("com.docker.compose.service")
        if not service or service == "gateway":
            raise PeerDiscoveryError("Unexpected gateway or missing service label.")
        if not entry.get("Image") or not state.get("StartedAt"):
            raise PeerDiscoveryError("Incomplete Docker image or start metadata.")
        records.append({
            "container": entry["Id"],
            "image": entry["Image"],
            "started": state["StartedAt"],
            "running": state.get("Running"),
            "service": service,
        })
    return sorted(records, key=lambda item: item["container"])


def capture() -> str:
    listed = subprocess.run(
        ["sudo", "docker", "ps", "-a", "--no-trunc", "-q",
         "--filter", "label=com.docker.compose.project=voxora-gpu"],
        capture_output=True, text=True, timeout=15, check=True,
    )
    all_ids = [x.strip() for x in listed.stdout.splitlines() if x.strip()]
    gateway_id = sys.argv[1].strip()
    if gateway_id not in all_ids:
        raise PeerDiscoveryError("Gateway not found among TTS project containers.")
    peers = [x for x in all_ids if x != gateway_id]
    if not peers:
        raise PeerDiscoveryError("No non-gateway containers were discovered.")
    inspected = subprocess.run(
        ["sudo", "docker", "inspect", *peers],
        capture_output=True, text=True, timeout=20, check=True,
    )
    records = parse_peers(gateway_id, all_ids, json.loads(inspected.stdout))
    encoded = json.dumps(records, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/tts_peer_fingerprint.py GATEWAY_ID",
              file=sys.stderr)
        raise SystemExit(2)
    try:
        print(capture())
    except (PeerDiscoveryError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as exc:
        # Do not leak any Docker environment values in error messages.
        print(f"BLOCKED: TTS peer discovery failed ({type(exc).__name__}).",
              file=sys.stderr)
        raise SystemExit(1) from None
