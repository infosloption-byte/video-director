"""Opt-in integration tests against a *dedicated disposable* Redis server.

NEVER point GPU_COORDINATION_TEST_REDIS_URL at production/queue Redis.
Run with scripts/test_gpu_redis_integration.sh, which starts an isolated Redis.
"""
import multiprocessing
import os
import time
import unittest
import uuid

from redis import Redis
from media_service.gpu_lease import GPULease, LeaseUnavailable, LeaseLost


def _hold_lease_in_child(redis_url, key, sender):
    client = Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        with GPULease(client, key=key, ttl_ms=3500, heartbeat_seconds=0.2):
            sender.send("acquired")
            while True:
                time.sleep(0.5)
    finally:
        sender.close()
        client.close()


@unittest.skipUnless(
    os.getenv("GPU_COORDINATION_TEST_REDIS_URL"),
    "Requires an explicitly configured disposable Redis instance",
)
class RealRedisLeaseTests(unittest.TestCase):
    def setUp(self):
        self.url = os.environ["GPU_COORDINATION_TEST_REDIS_URL"]
        self.client = Redis.from_url(self.url, socket_connect_timeout=2, socket_timeout=2)
        self.client.ping()
        self.key = "voxora:gpu:integration-test:" + uuid.uuid4().hex

    def tearDown(self):
        self.client.delete(self.key)
        self.client.close()

    def test_distinct_redis_clients_exclude_each_other(self):
        another = Redis.from_url(self.url, socket_connect_timeout=2, socket_timeout=2)
        try:
            with GPULease(self.client, key=self.key, ttl_ms=3500, heartbeat_seconds=0.2) as holder:
                holder.assert_held()
                with self.assertRaises(LeaseUnavailable):
                    GPULease(another, key=self.key).acquire()
            with GPULease(another, key=self.key) as successor:
                successor.assert_held()
        finally:
            another.close()

    def test_media_and_tts_lease_implementations_interoperate(self):
        from gateway.gpu_lease import (
            GPULease as TTSGPULease,
            LeaseUnavailable as TTSLeaseUnavailable,
        )
        # Exercise both service implementations against one real Redis key.
        another = Redis.from_url(self.url, socket_connect_timeout=2, socket_timeout=2)
        try:
            with GPULease(self.client, key=self.key) as media_holder:
                media_holder.assert_held()
                # Each service defines its own exception class; a failed
                # TTS lease acquisition must raise the TTS-specific type.
                with self.assertRaises(TTSLeaseUnavailable):
                    TTSGPULease(another, key=self.key).acquire()

            with TTSGPULease(another, key=self.key) as tts_holder:
                tts_holder.assert_held()
                with self.assertRaises(LeaseUnavailable):
                    GPULease(self.client, key=self.key).acquire()
        finally:
            another.close()

    def test_heartbeat_renews_real_redis_ttl(self):
        with GPULease(self.client, key=self.key, ttl_ms=3000, heartbeat_seconds=0.1) as lease:
            time.sleep(0.6)
            self.assertGreater(self.client.pttl(self.key), 0)
            lease.assert_held()
        self.assertIsNone(self.client.get(self.key))

    def test_stale_owner_cannot_delete_successor(self):
        old = GPULease(self.client, key=self.key, ttl_ms=3500, heartbeat_seconds=0.2)
        old.acquire()
        try:
            self.client.set(self.key, "successor", px=3500)
            with self.assertRaises(LeaseLost):
                old.assert_held()
        finally:
            old.release()
        self.assertEqual(self.client.get(self.key), b"successor")

    def test_sigkill_releases_lease_after_ttl(self):
        # Spawn creates a separate Python process and Redis connection.
        ctx = multiprocessing.get_context("spawn")
        receiver, sender = ctx.Pipe(duplex=False)
        process = ctx.Process(target=_hold_lease_in_child, args=(self.url, self.key, sender))
        process.start()
        sender.close()
        try:
            self.assertTrue(receiver.poll(8), "Child failed to acquire lease")
            self.assertEqual(receiver.recv(), "acquired")
            with self.assertRaises(LeaseUnavailable):
                GPULease(self.client, key=self.key).acquire()
            process.kill()
            process.join(timeout=3)
            self.assertFalse(process.is_alive())
            successor = GPULease(self.client, key=self.key, ttl_ms=3500,
                                 heartbeat_seconds=0.2)
            successor.acquire(wait_seconds=7)
            try:
                successor.assert_held()
            finally:
                successor.release()
        finally:
            if process.is_alive():
                process.kill()
                process.join(timeout=3)
            receiver.close()


if __name__ == "__main__":
    unittest.main()
