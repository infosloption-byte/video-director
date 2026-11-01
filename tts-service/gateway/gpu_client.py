"""Redis GPU coordination client configuration.

Prefer a read-only Docker secret over passwords in environment variables.
This is only used when GPU_COORDINATION_ENABLED=true.
"""
from __future__ import annotations

import os
from pathlib import Path

from redis import Redis

from .gpu_lease import LeaseUnavailable


def create_gpu_redis_client() -> Redis:
    secret_path = os.getenv("GPU_COORDINATION_REDIS_PASSWORD_FILE", "").strip()
    url = os.getenv("GPU_COORDINATION_REDIS_URL", "").strip()
    timeout = dict(socket_connect_timeout=3, socket_timeout=3)

    if secret_path:
        if url:
            raise LeaseUnavailable(
                "GPU coordination password file and Redis URL are mutually exclusive."
            )
        if not Path(secret_path).is_absolute():
            raise LeaseUnavailable("GPU coordinator secret path must be absolute.")
        try:
            password = Path(secret_path).read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError) as exc:
            raise LeaseUnavailable("GPU coordinator secret file cannot be read.") from exc
        if len(password) < 32:
            raise LeaseUnavailable("GPU coordinator secret is invalid.")
        host = os.getenv("GPU_COORDINATION_REDIS_HOST", "").strip()
        if not host:
            raise LeaseUnavailable("GPU coordinator host is not configured.")
        return Redis(host=host, port=6379, db=0, password=password, **timeout)

    if not url:
        raise LeaseUnavailable("GPU coordination Redis connection is not configured.")
    return Redis.from_url(url, **timeout)
