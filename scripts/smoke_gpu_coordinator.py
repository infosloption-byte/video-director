"""Non-disruptive smoke check for an already running GPU Redis coordinator.

Uses an isolated, unique key. It neither invokes CUDA nor enables the runtime
scheduler. The caller must mount both service source trees and a password file.
"""
from pathlib import Path
import uuid

from redis import Redis
from redis.exceptions import AuthenticationError
from gateway.gpu_lease import (
    GPULease as TTSLease,
    LeaseUnavailable as TTSLeaseUnavailable,
)
from media_service.gpu_lease import (
    GPULease as MediaLease,
    LeaseUnavailable as MediaLeaseUnavailable,
)

HOST = "voxora-gpu-coordinator"
SECRET = Path("/run/secrets/coordinator_password")


def require_rejection(lease, expected_exception):
    try:
        lease.acquire(wait_seconds=0)
    except expected_exception:
        return
    else:
        lease.release()
        raise AssertionError("Two service lease clients obtained exclusive access.")


def run():
    password = SECRET.read_text(encoding="utf-8").strip()
    if len(password) < 32:
        raise RuntimeError("Coordinator secret is missing or too short.")

    # Authentication should be required for this lock-only Redis.
    unauthenticated = Redis(host=HOST, port=6379, socket_connect_timeout=3, socket_timeout=3)
    try:
        try:
            unauthenticated.ping()
        except AuthenticationError:
            pass
        else:
            raise AssertionError("Redis accepted an unauthenticated PING.")
    finally:
        unauthenticated.close()

    first = Redis(
        host=HOST, port=6379, password=password, db=0,
        socket_connect_timeout=3, socket_timeout=3,
    )
    second = Redis(
        host=HOST, port=6379, password=password, db=0,
        socket_connect_timeout=3, socket_timeout=3,
    )
    key = "voxora:gpu:connectivity-smoke:" + uuid.uuid4().hex
    try:
        if not first.ping() or not second.ping():
            raise AssertionError("Authenticated Redis PING failed.")

        with MediaLease(first, key=key) as media_holder:
            media_holder.assert_held()
            require_rejection(TTSLease(second, key=key), TTSLeaseUnavailable)
        with TTSLease(second, key=key) as tts_holder:
            tts_holder.assert_held()
            require_rejection(MediaLease(first, key=key), MediaLeaseUnavailable)

        if first.exists(key):
            raise AssertionError("Lease key remained after normal release.")
        print("PASS: Redis authentication required")
        print("PASS: authenticated Redis DNS and connectivity")
        print("PASS: media and TTS exclusive lease interoperability")
        print("PASS: temporary lease released")
        print("No inference, existing containers, or job queues were changed.")
    finally:
        # Never touch the production exclusive lease key.
        first.delete(key)
        first.close()
        second.close()


if __name__ == "__main__":
    run()
