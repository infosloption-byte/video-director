"""Cross-process GPU lease primitive.

Shared Redis lease implementation for TTS; use the same key and Redis URL as media.
Feature flags leave this disabled until both services have been deployed.
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass

from redis import Redis

_RELEASE = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
"""
_RENEW = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
"""


class LeaseLost(RuntimeError):
    """GPU lease expired, was stolen, or its heartbeat became unavailable."""


class LeaseUnavailable(RuntimeError):
    """GPU resource is busy or coordination cannot be reached."""


@dataclass
class GPULease:
    redis: Redis
    key: str = "voxora:gpu:exclusive"
    ttl_ms: int = 30000
    heartbeat_seconds: float = 5.0

    def __post_init__(self) -> None:
        if self.ttl_ms < 3000 or not (0 < self.heartbeat_seconds * 3000 < self.ttl_ms):
            raise ValueError("Heartbeat must be positive and shorter than one third of TTL.")
        self.token = uuid.uuid4().hex
        self._stop = threading.Event()
        self._lost = threading.Event()
        self._thread: threading.Thread | None = None
        self._acquired = False

    def acquire(self, wait_seconds: float = 0) -> "GPULease":
        if self._acquired:
            raise RuntimeError("Lease object cannot be acquired twice.")
        deadline = time.monotonic() + max(0, wait_seconds)
        while True:
            try:
                acquired = self.redis.set(self.key, self.token, nx=True, px=self.ttl_ms)
            except Exception as exc:
                raise LeaseUnavailable("GPU coordination store unavailable.") from exc
            if acquired:
                self._acquired = True
                self._thread = threading.Thread(target=self._heartbeat, daemon=True)
                self._thread.start()
                return self
            if time.monotonic() >= deadline:
                raise LeaseUnavailable("GPU is currently reserved.")
            time.sleep(min(0.2, max(0, deadline - time.monotonic())))

    def _heartbeat(self) -> None:
        while not self._stop.wait(self.heartbeat_seconds):
            try:
                renewed = self.redis.eval(_RENEW, 1, self.key, self.token, self.ttl_ms)
                if renewed != 1:
                    self._lost.set()
                    return
            except Exception:
                # Fail closed. Callers must check ownership before and during
                # inference; heartbeat alone cannot preempt a native CUDA kernel.
                self._lost.set()
                return

    def assert_held(self) -> None:
        if not self._acquired or self._lost.is_set():
            raise LeaseLost("GPU lease is not valid.")
        try:
            owner = self.redis.get(self.key)
        except Exception as exc:
            self._lost.set()
            raise LeaseLost("GPU coordination unavailable.") from exc
        if owner not in (self.token, self.token.encode()):
            self._lost.set()
            raise LeaseLost("GPU lease ownership lost.")

    def release(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=self.heartbeat_seconds + 1)
        if self._acquired:
            try:
                self.redis.eval(_RELEASE, 1, self.key, self.token)
            finally:
                self._acquired = False

    def __enter__(self) -> "GPULease":
        return self.acquire()

    def __exit__(self, *_: object) -> None:
        self.release()
