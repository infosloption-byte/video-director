"""Pure unit tests for the gateway-only image override safety checker."""
import copy
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "check_gpu_gateway_image_override.py"
spec = importlib.util.spec_from_file_location("gateway_override_check", SCRIPT)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

IMAGE = "voxora-gateway-coordination-preflight:20261101"


def specs():
    base = {
        "name": "voxora-gpu",
        "networks": {"default": {"name": "voxora-gpu_default"}},
        "services": {
            "gateway": {"image": "voxora-gpu-gateway",
                        "ports": [{"published": "8000", "target": 8000}],
                        "environment": {"GPU_COORDINATION_ENABLED": "false"},
                        "networks": {"default": None, "coordination": None}},
            "kokoro": {"image": "old-engine",
                       "networks": {"default": None}},
        },
    }
    planned = copy.deepcopy(base)
    planned["services"]["gateway"]["image"] = IMAGE
    return base, planned


class GatewayOverrideTests(unittest.TestCase):
    def test_accepts_only_gateway_image_change(self):
        base, planned = specs()
        checker.compare(base, planned, IMAGE)

    def test_rejects_unexpected_gateway_image(self):
        base, planned = specs()
        planned["services"]["gateway"]["image"] = "untrusted"
        with self.assertRaises(checker.InvalidPlan):
            checker.compare(base, planned, IMAGE)

    def test_rejects_other_service_image_change(self):
        base, planned = specs()
        planned["services"]["kokoro"]["image"] = "new-engine"
        with self.assertRaises(checker.InvalidPlan):
            checker.compare(base, planned, IMAGE)

    def test_rejects_gateway_port_change(self):
        base, planned = specs()
        planned["services"]["gateway"]["ports"][0]["published"] = "9000"
        with self.assertRaises(checker.InvalidPlan):
            checker.compare(base, planned, IMAGE)

    def test_rejects_coordination_enabled(self):
        base, planned = specs()
        planned["services"]["gateway"]["environment"]["GPU_COORDINATION_ENABLED"] = "true"
        with self.assertRaises(checker.InvalidPlan):
            checker.compare(base, planned, IMAGE)

    def test_rejects_network_change(self):
        base, planned = specs()
        planned["networks"]["default"]["name"] = "changed"
        with self.assertRaises(checker.InvalidPlan):
            checker.compare(base, planned, IMAGE)


if __name__ == "__main__":
    unittest.main()
