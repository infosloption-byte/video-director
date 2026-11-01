#!/usr/bin/env python3
"""Read-only comparison of live base Compose configs with GPU coordination overlays.

Runs docker compose config in-memory. Never prints full Compose JSON because it
can contain service environment values. Does not create or restart containers.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COORDINATOR_SECRET = (ROOT / "gpu-coordination/secrets/redis_password.txt").resolve()
NETWORK = "voxora-gpu-coordination"


class UnsafeOverlay(RuntimeError):
    """An overlay changes deployment properties beyond the intended scope."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise UnsafeOverlay(message)


def compose_config(directory: Path, project: str, overlay: bool, media: bool) -> dict:
    args = ["sudo", "docker", "compose", "-p", project,
            "-f", "docker-compose.gpu.yml"]
    if overlay:
        args.extend(["-f", "docker-compose.coordination.yml"])
    if media:
        args.extend(["--profile", "worker"])
    args.extend(["config", "--format", "json"])
    # Config can include secrets from env_file: capture privately; NEVER print.
    try:
        result = subprocess.run(
            args, cwd=directory, capture_output=True, text=True,
            check=False, timeout=45,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise UnsafeOverlay("Unable to inspect Compose config safely.") from exc
    require(result.returncode == 0,
            f"Compose config command failed for {directory.name}; run config --quiet to diagnose.")
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise UnsafeOverlay("Compose returned invalid JSON.") from exc
    require(isinstance(data, dict) and isinstance(data.get("services"), dict),
            "Compose configuration lacks services.")
    return data


def networks(service: dict) -> set[str]:
    val = service.get("networks")
    if not val:
        return {"default"}
    if isinstance(val, (list, dict)):
        return set(val)
    raise UnsafeOverlay("Unexpected Compose networks format.")


def env_map(service: dict) -> dict:
    val = service.get("environment", {})
    require(isinstance(val, dict), "Unexpected Compose environment format.")
    return val


def secrets(service: dict) -> list[dict]:
    val = service.get("secrets", [])
    require(isinstance(val, list), "Unexpected Compose secrets format.")
    require(all(isinstance(item, dict) for item in val),
            "Unexpected Compose secret entry.")
    return val


def unchanged_except(service: dict) -> dict:
    return {key: value for key, value in service.items()
            if key not in {"environment", "networks", "secrets"}}


def compare_stack(base: dict, merged: dict, target: str, stack: str) -> None:
    old_services = base["services"]
    new_services = merged["services"]
    require(set(old_services) == set(new_services),
            f"{stack}: overlay changes service inventory.")
    require(target in old_services, f"{stack}: expected service is missing.")
    for name in old_services:
        if name != target:
            require(old_services[name] == new_services[name],
                    f"{stack}: overlay changes unrelated service {name}.")

    old, new = old_services[target], new_services[target]
    require(unchanged_except(old) == unchanged_except(new),
            f"{stack}: overlay alters build/image, ports, volumes or dependencies.")

    old_networks, new_networks = networks(old), networks(new)
    require(new_networks == old_networks | {"coordination"},
            f"{stack}: overlay removes or unexpectedly adds networks.")
    require("coordination" not in old_networks,
            f"{stack}: coordination network already present in base config.")

    old_secrets, new_secrets = secrets(old), secrets(new)
    serialize = lambda item: json.dumps(item, sort_keys=True)
    before = {serialize(x) for x in old_secrets}
    after = {serialize(x) for x in new_secrets}
    require(before.issubset(after) and len(after - before) == 1,
            f"{stack}: secret entries were removed or unexpectedly changed.")
    added = [x for x in new_secrets if serialize(x) not in before]
    require(added[0].get("source") == "coordinator_password",
            f"{stack}: unexpected new secret.")

    original_env, new_env = env_map(old), env_map(new)
    allowed = {"GPU_COORDINATION_ENABLED", "GPU_COORDINATION_REDIS_HOST",
               "GPU_COORDINATION_REDIS_PASSWORD_FILE"}
    if stack == "media":
        allowed |= {"GPU_MEDIA_WHISPER_DEVICE", "GPU_MEDIA_HEAVY_ENABLED"}
    require({k: v for k, v in original_env.items() if k not in allowed}
            == {k: v for k, v in new_env.items() if k not in allowed},
            f"{stack}: overlay changes unrelated environment settings.")
    expected = {
        "GPU_COORDINATION_ENABLED": "false",
        "GPU_COORDINATION_REDIS_HOST": "voxora-gpu-coordinator",
        "GPU_COORDINATION_REDIS_PASSWORD_FILE":
            "/run/secrets/coordinator_password",
    }
    if stack == "media":
        expected.update({"GPU_MEDIA_WHISPER_DEVICE": "cpu",
                         "GPU_MEDIA_HEAVY_ENABLED": "false"})
    for k, v in expected.items():
        require(str(new_env.get(k, "")).lower() == v.lower(),
                f"{stack}: safety setting {k} is not as expected.")

    new_coord = merged.get("networks", {}).get("coordination", {})
    require(new_coord.get("external") is True and
            new_coord.get("name") == NETWORK,
            f"{stack}: coordinator Docker network must remain external.")

    coordinator = merged.get("secrets", {}).get("coordinator_password", {})
    require(isinstance(coordinator, dict) and
            Path(coordinator.get("file", "/missing")).resolve() == COORDINATOR_SECRET,
            f"{stack}: coordinator password mount points to the wrong source.")

    print(f"PASS: {stack} retains existing ports, dependencies, volumes and networks")
    print(f"PASS: {stack} adds only the intended secret and coordinator network")
    print(f"PASS: {stack} keeps GPU coordination disabled")


def main() -> int:
    try:
        require(COORDINATOR_SECRET.is_file(),
                "Coordinator password file is missing.")
        for stack, directory, project, target, media in (
            ("tts", ROOT / "tts-service", "voxora-gpu", "gateway", False),
            ("media", ROOT / "gpu-media-service", "voxora-media", "worker", True),
        ):
            base = compose_config(directory, project, False, media)
            overlay = compose_config(directory, project, True, media)
            compare_stack(base, overlay, target, stack)
    except UnsafeOverlay as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 1
    print("PASS: both overlays are non-disruptive in configuration only")
    print("No containers were created, recreated, stopped or restarted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
