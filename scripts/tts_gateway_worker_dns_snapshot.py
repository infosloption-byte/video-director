#!/usr/bin/env python3
"""Read-only TTS gateway DNS baseline / post-rollout fingerprint.

Executed with `docker exec -i <gateway> python -B - < this_file`.
The gateway advertises optional engines that may NOT have running containers.
Require its configured default engine to resolve. Snapshot all DNS-resolvable
worker endpoints before and after the gateway-only recreation; fail closed if
any previously working endpoint, DNS address, port, or configuration changes.
This does not call /unload or synthesize, access credentials, or write files.

JSON contains only non-secret engine labels and a SHA256 fingerprint of the
endpoint configuration and resolved DNS addresses; no hostnames, URLs or tokens.
"""
from __future__ import annotations

import hashlib
import json
import socket
from urllib.parse import urlsplit


class WorkerDnsError(ValueError):
    """A required or configured gateway endpoint cannot be safely checked."""


def worker_dns_snapshot(workers: dict, default_engine: str, resolver=None) -> dict:
    if resolver is None:
        resolver = socket.getaddrinfo
    if not isinstance(workers, dict) or not workers or default_engine not in workers:
        raise WorkerDnsError("Default TTS engine is not configured.")
    resolved: dict[str, tuple[str, int, list[str]]] = {}
    missing: list[str] = []
    for engine, endpoint in sorted(workers.items()):
        if not isinstance(engine, str) or not engine or not isinstance(endpoint, str):
            raise WorkerDnsError("TTS worker configuration has invalid engine keys.")
        try:
            parsed = urlsplit(endpoint)
            hostname = parsed.hostname
            port = parsed.port
        except (TypeError, ValueError) as error:
            raise WorkerDnsError("TTS worker endpoint contains an invalid host or port.") from error
        if (parsed.scheme not in ("http", "https") or not hostname or
                parsed.username or parsed.password or not port or
                not (1 <= port <= 65535)):
            raise WorkerDnsError("TTS worker endpoint is not an HTTP service with a valid host and port.")
        try:
            entries = resolver(hostname, port, type=socket.SOCK_STREAM)
            addresses = sorted({row[4][0] for row in entries if row[4]})
        except socket.gaierror:
            addresses = []
        if not addresses:
            missing.append(engine)
            continue
        resolved[engine] = (hostname, port, addresses)
    if default_engine not in resolved:
        raise WorkerDnsError("The currently configured default TTS worker does not resolve.")
    signature = hashlib.sha256(
        json.dumps(resolved, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        "default": default_engine,
        "resolved": sorted(resolved),
        "missing": sorted(missing),
        "signature": signature,
    }


def main() -> int:
    from gateway.app import DEFAULT_ENGINE, WORKERS
    try:
        result = worker_dns_snapshot(WORKERS, DEFAULT_ENGINE)
    except WorkerDnsError as error:
        # Do not print a URL, IP, DNS address or service credential.
        import sys
        print(f"BLOCKED: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
