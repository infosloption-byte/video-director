#!/usr/bin/env python3
"""Resolve the current TTS gateway's *private* Docker host health binding.

Never assume localhost:8000: the deployed gateway may publish only to the EC2
instance's private IP. Reject public/wildcard/ambiguous bindings rather than
probing an arbitrary URL or publishing new ports.
"""
from __future__ import annotations

import ipaddress
import json
import subprocess
import sys

PORT_KEY = "8000/tcp"
ALLOWED_HOST_NETWORKS = tuple(
    ipaddress.ip_network(network)
    for network in ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
)


class UnsafeGatewayBinding(ValueError):
    pass


def resolve_health_url(ports: dict) -> str:
    if not isinstance(ports, dict):
        raise UnsafeGatewayBinding("Docker port data must be a mapping.")
    bindings = ports.get(PORT_KEY)
    if not isinstance(bindings, list) or len(bindings) != 1:
        raise UnsafeGatewayBinding("Gateway must publish exactly one TCP port 8000 binding.")
    binding = bindings[0]
    if not isinstance(binding, dict):
        raise UnsafeGatewayBinding("Invalid Docker port binding.")
    raw_ip = binding.get("HostIp")
    raw_port = binding.get("HostPort")
    try:
        ip = ipaddress.ip_address(raw_ip)
        port = int(raw_port)
    except (ValueError, TypeError):
        raise UnsafeGatewayBinding("Invalid gateway host IP or port.") from None
    if not isinstance(ip, ipaddress.IPv4Address):
        raise UnsafeGatewayBinding("Gateway health binding must use a private IPv4 address.")
    # Explicitly refuse published wildcard, Internet-facing, special and
    # link-local addresses even if Python classifies some as 'private'.
    if not any(ip in network for network in ALLOWED_HOST_NETWORKS):
        raise UnsafeGatewayBinding("Gateway health must be bound to private IPv4, not public/wildcard.")
    if not (1 <= port <= 65535) or str(port) != str(raw_port):
        raise UnsafeGatewayBinding("Gateway host port is invalid.")
    return f"http://{ip}:{port}/health"


def main(argv: list[str]) -> int:
    if len(argv) != 2 or not argv[1].strip():
        print("Usage: resolve_gpu_gateway_health_url.py CONTAINER_ID", file=sys.stderr)
        return 2
    try:
        result = subprocess.run(
            ["sudo", "docker", "inspect", argv[1], "--format",
             "{{json .NetworkSettings.Ports}}"],
            capture_output=True, text=True, check=False, timeout=10,
        )
        if result.returncode:
            raise UnsafeGatewayBinding("Could not inspect the gateway port binding.")
        url = resolve_health_url(json.loads(result.stdout))
    except (UnsafeGatewayBinding, json.JSONDecodeError,
            OSError, subprocess.TimeoutExpired) as error:
        # No container environment, credentials or Docker inspect JSON printed.
        print(f"BLOCKED: unsafe or unavailable gateway health binding: {type(error).__name__}",
              file=sys.stderr)
        return 1
    print(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
