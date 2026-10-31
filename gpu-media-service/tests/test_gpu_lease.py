"""Unit tests for the scheduler lease primitive; no live Redis required."""
import unittest
from unittest.mock import patch

from media_service.gpu_lease import GPULease, LeaseLost, LeaseUnavailable


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.fail = False

    def set(self, key, value, nx=False, px=None):
        if self.fail:
            raise ConnectionError()
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    def get(self, key):
        if self.fail:
            raise ConnectionError()
        return self.values.get(key)

    def eval(self, script, count, key, token, *args):
        if self.fail:
            raise ConnectionError()
        if self.values.get(key) != token:
            return 0
        if "PEXPIRE" in script:
            return 1
        del self.values[key]
        return 1


class LeaseTests(unittest.TestCase):
    def test_exclusive_and_owner_safe_release(self):
        redis = FakeRedis()
        first = GPULease(redis, heartbeat_seconds=0.1)
        second = GPULease(redis, heartbeat_seconds=0.1)
        first.acquire()
        try:
            with self.assertRaises(LeaseUnavailable):
                second.acquire()
            first.assert_held()
        finally:
            first.release()
        second.acquire()
        second.release()

    def test_stale_owner_cannot_release_new_owner(self):
        redis = FakeRedis()
        old = GPULease(redis, heartbeat_seconds=0.1).acquire()
        redis.values[old.key] = "replacement"
        with self.assertRaises(LeaseLost):
            old.assert_held()
        old.release()
        self.assertEqual(redis.values[old.key], "replacement")

    def test_coordination_failure_is_fail_closed(self):
        redis = FakeRedis()
        redis.fail = True
        with self.assertRaises(LeaseUnavailable):
            GPULease(redis).acquire()

    def test_heartbeat_detects_loss(self):
        redis = FakeRedis()
        lease = GPULease(redis, heartbeat_seconds=0.01).acquire()
        redis.values[lease.key] = "another-owner"
        import time
        time.sleep(0.04)
        with self.assertRaises(LeaseLost):
            lease.assert_held()
        lease.release()


if __name__ == "__main__":
    unittest.main()
