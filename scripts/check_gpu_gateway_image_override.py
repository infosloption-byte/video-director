#!/usr/bin/env python3
"""Validate the exact gateway image override before any Compose recreation.

Compose output may include secrets; capture stdout/stderr, print only safe results.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TTS = ROOT / "tts-service"


class InvalidPlan(RuntimeError):
    pass


def render(files: list[str]) -> dict:
    args = ["sudo", "docker", "compose", "-p", "voxora-gpu"]
    for filename in files:
        args.extend(["-f", filename])
    args.extend(["config", "--format", "json"])
    try:
        result = subprocess.run(
            args, cwd=TTS, capture_output=True, text=True, timeout=45,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise InvalidPlan("Unable to read Compose configuration safely.") from exc
    if result.returncode:
        raise InvalidPlan("Compose render failed; inspect config --quiet locally.")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise InvalidPlan("Compose output was not valid JSON.") from exc


def compare(before: dict, after: dict, expected: str) -> None:
    if set(before) != set(after):
        raise InvalidPlan("Image override changes top-level Compose configuration.")
    if set(before["services"]) != set(after["services"]):
        raise InvalidPlan("Image override changes service inventory.")
    for name, original in before["services"].items():
        changed = after["services"][name]
        if name != "gateway":
            if changed != original:
                raise InvalidPlan("Image override changes a non-gateway service.")
            continue
        if changed.get("image") != expected:
            raise InvalidPlan("Gateway image does not match the intended tag.")
        if {k: v for k, v in changed.items() if k != "image"} != {
            k: v for k, v in original.items() if k != "image"
        }:
            raise InvalidPlan("Image override modifies gateway settings beyond image.")
    if {k: v for k, v in after.items() if k != "services"} != {
        k: v for k, v in before.items() if k != "services"
    }:
        raise InvalidPlan("Image override changes networks, secrets, or project settings.")


def main() -> int:
    if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and sys.argv[3] != "--base-only"):
        print("Usage: check_gpu_gateway_image_override.py FILE IMAGE [--base-only]",
              file=sys.stderr)
        return 2
    override, expected = sys.argv[1:3]
    base = ["docker-compose.gpu.yml"]
    if len(sys.argv) == 3:
        base.append("docker-compose.coordination.yml")
    try:
        before = render(base)
        after = render(base + [override])
        compare(before, after, expected)
    except (InvalidPlan, KeyError, TypeError) as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 1
    print("PASS: gateway image override changes only the intended image reference.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
