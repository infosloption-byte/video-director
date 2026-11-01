"""Offline tests of the no-deploy Compose rollout comparator."""
from __future__ import annotations

import copy
import importlib.util
import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[2] / "scripts/check_gpu_coordination_rollout.py"
spec = importlib.util.spec_from_file_location("gpu_coordination_rollout", SOURCE)
rollout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rollout)


def config(stack="tts"):
    target = "gateway" if stack == "tts" else "worker"
    other = "kokoro" if stack == "tts" else "redis"
    base = {"services": {
        target: {
            "image": "original",
            "ports": ["127.0.0.1:8000:8000"] if stack == "tts" else [],
            "networks": {"default": None},
            "environment": {"PRESERVE_ME": "yes"},
            "volumes": [{"type": "volume", "source": "model-cache",
                         "target": "/cache"}],
        },
        other: {"image": "unrelated", "networks": {"default": None}},
    }}
    merged = copy.deepcopy(base)
    service = merged["services"][target]
    service["networks"]["coordination"] = None
    service["environment"].update({
        "GPU_COORDINATION_ENABLED": "false",
        "GPU_COORDINATION_REDIS_HOST": "voxora-gpu-coordinator",
        "GPU_COORDINATION_REDIS_PASSWORD_FILE": "/run/secrets/coordinator_password",
    })
    if stack == "media":
        service["environment"].update({
            "GPU_MEDIA_WHISPER_DEVICE": "cpu",
            "GPU_MEDIA_HEAVY_ENABLED": "false",
        })
    service["secrets"] = [{"source": "coordinator_password",
                           "target": "/run/secrets/coordinator_password"}]
    merged["networks"] = {"coordination":
                          {"external": True, "name": rollout.NETWORK}}
    merged["secrets"] = {"coordinator_password":
                         {"file": str(rollout.COORDINATOR_SECRET)}}
    return base, merged, target


class CompareTests(unittest.TestCase):
    def check(self, base, merged, target, stack="tts"):
        with redirect_stdout(io.StringIO()):
            rollout.compare_stack(base, merged, target, stack)

    def test_safe_tts_overlay(self):
        base, new, target = config()
        self.check(base, new, target)

    def test_safe_media_overlay(self):
        base, new, target = config("media")
        self.check(base, new, target, "media")

    def test_rejects_removed_original_network(self):
        base, new, target = config()
        base["services"][target]["networks"]["private"] = None
        with self.assertRaises(rollout.UnsafeOverlay):
            self.check(base, new, target)

    def test_rejects_changed_host_ports(self):
        base, new, target = config()
        new["services"][target]["ports"] = ["0.0.0.0:8000:8000"]
        with self.assertRaises(rollout.UnsafeOverlay):
            self.check(base, new, target)

    def test_rejects_unrelated_env_changes(self):
        base, new, target = config()
        new["services"][target]["environment"]["PRESERVE_ME"] = "no"
        with self.assertRaises(rollout.UnsafeOverlay):
            self.check(base, new, target)

    def test_rejects_enabled_gpu_inference(self):
        base, new, target = config("media")
        new["services"][target]["environment"]["GPU_MEDIA_WHISPER_DEVICE"] = "cuda"
        with self.assertRaises(rollout.UnsafeOverlay):
            self.check(base, new, target, "media")

    def test_rejects_broken_secret_source(self):
        base, new, target = config()
        new["secrets"]["coordinator_password"]["file"] = "/tmp/untrusted.txt"
        with self.assertRaises(rollout.UnsafeOverlay):
            self.check(base, new, target)

    def test_rejects_unrelated_service_change(self):
        base, new, target = config()
        new["services"]["kokoro"]["image"] = "different"
        with self.assertRaises(rollout.UnsafeOverlay):
            self.check(base, new, target)


if __name__ == "__main__":
    unittest.main()
