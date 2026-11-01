"""No-live-Redis checks for secret-backed GPU coordinator client settings."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from media_service.gpu_client import create_gpu_redis_client
from media_service.gpu_lease import LeaseUnavailable


class GPUClientTests(unittest.TestCase):
    def _environment(self, **extra):
        return patch.dict(os.environ, {
            "GPU_COORDINATION_REDIS_URL": "",
            "GPU_COORDINATION_REDIS_PASSWORD_FILE": "",
            "GPU_COORDINATION_REDIS_HOST": "",
            **extra,
        })

    def test_missing_configuration_fails_closed(self):
        with self._environment():
            with self.assertRaises(LeaseUnavailable):
                create_gpu_redis_client()

    def test_invalid_secret_path_fails_closed(self):
        with self._environment(
            GPU_COORDINATION_REDIS_PASSWORD_FILE="/nonexistent/voxora/coordinator"
        ):
            with self.assertRaises(LeaseUnavailable):
                create_gpu_redis_client()

    def test_short_secret_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "redis.txt"
            path.write_text("short", encoding="utf-8")
            with self._environment(
                GPU_COORDINATION_REDIS_PASSWORD_FILE=str(path),
                GPU_COORDINATION_REDIS_HOST="voxora-gpu-coordinator",
            ):
                with self.assertRaises(LeaseUnavailable):
                    create_gpu_redis_client()

    def test_url_and_secret_conflict_fails_closed(self):
        with self._environment(
            GPU_COORDINATION_REDIS_PASSWORD_FILE="/tmp/not-read",
            GPU_COORDINATION_REDIS_URL="redis://localhost:6379/0",
        ):
            with self.assertRaises(LeaseUnavailable):
                create_gpu_redis_client()

    def test_secret_file_uses_authenticated_connection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "redis.txt"
            path.write_text("a" * 64 + "\n", encoding="utf-8")
            with self._environment(
                GPU_COORDINATION_REDIS_PASSWORD_FILE=str(path),
                GPU_COORDINATION_REDIS_HOST="voxora-gpu-coordinator",
            ):
                client = create_gpu_redis_client()
                try:
                    opts = client.connection_pool.connection_kwargs
                    self.assertEqual(opts["host"], "voxora-gpu-coordinator")
                    self.assertEqual(opts["port"], 6379)
                    self.assertEqual(opts["password"], "a" * 64)
                finally:
                    client.close()

    def test_legacy_url_still_supported(self):
        with self._environment(
            GPU_COORDINATION_REDIS_URL="redis://localhost:6379/2",
        ):
            client = create_gpu_redis_client()
            try:
                self.assertEqual(client.connection_pool.connection_kwargs["db"], 2)
            finally:
                client.close()


if __name__ == "__main__":
    unittest.main()
