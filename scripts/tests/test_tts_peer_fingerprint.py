"""Tests for safe discovery of actual TTS containers with custom service names."""
import importlib.util
import unittest
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "tts_peer_fingerprint.py"
spec = importlib.util.spec_from_file_location("tts_peers", PATH)
peers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(peers)

GATEWAY = "a" * 64
CUSTOM_MELO = "b" * 64
CUSTOM_QWEN = "c" * 64


def record(identifier, service, image="sha256:" + "a" * 64, started="2026-11-01T00:00:00Z"):
    return {
        "Id": identifier, "Image": image,
        "State": {"Running": True, "StartedAt": started},
        "Config": {"Labels": {
            "com.docker.compose.project": "voxora-gpu",
            "com.docker.compose.service": service,
        }},
    }


class PeerDiscoveryTests(unittest.TestCase):
    def test_custom_engine_service_names_are_accepted(self):
        records = peers.parse_peers(
            GATEWAY,
            [GATEWAY, CUSTOM_MELO, CUSTOM_QWEN],
            [record(CUSTOM_MELO, "melo-worker"), record(CUSTOM_QWEN, "qwen-cuda")],
        )
        self.assertEqual([r["service"] for r in records], ["melo-worker", "qwen-cuda"])

    def test_rejects_missing_gateway_membership(self):
        with self.assertRaises(peers.PeerDiscoveryError):
            peers.parse_peers(GATEWAY, [CUSTOM_MELO], [record(CUSTOM_MELO, "melo")])

    def test_rejects_no_other_tts_containers(self):
        with self.assertRaises(peers.PeerDiscoveryError):
            peers.parse_peers(GATEWAY, [GATEWAY], [])

    def test_rejects_unexpected_peer_container(self):
        with self.assertRaises(peers.PeerDiscoveryError):
            peers.parse_peers(GATEWAY, [GATEWAY, CUSTOM_MELO],
                              [record(CUSTOM_QWEN, "qwen")])

    def test_rejects_peer_labeled_gateway(self):
        with self.assertRaises(peers.PeerDiscoveryError):
            peers.parse_peers(GATEWAY, [GATEWAY, CUSTOM_MELO],
                              [record(CUSTOM_MELO, "gateway")])

    def test_rejects_wrong_compose_project(self):
        wrong = record(CUSTOM_MELO, "melo")
        wrong["Config"]["Labels"]["com.docker.compose.project"] = "wrong"
        with self.assertRaises(peers.PeerDiscoveryError):
            peers.parse_peers(GATEWAY, [GATEWAY, CUSTOM_MELO], [wrong])

    def test_detects_change_in_peer_image(self):
        original = peers.parse_peers(GATEWAY, [GATEWAY, CUSTOM_MELO],
                                     [record(CUSTOM_MELO, "melo")])
        updated = peers.parse_peers(GATEWAY, [GATEWAY, CUSTOM_MELO],
                                    [record(CUSTOM_MELO, "melo", image="sha256:" + "f"*64)])
        self.assertNotEqual(original, updated)

    def test_detects_restart_of_same_container(self):
        original = peers.parse_peers(GATEWAY, [GATEWAY, CUSTOM_MELO],
                                     [record(CUSTOM_MELO, "melo")])
        updated = peers.parse_peers(
            GATEWAY, [GATEWAY, CUSTOM_MELO],
            [record(CUSTOM_MELO, "melo", started="2026-11-01T01:00:00Z")],
        )
        self.assertNotEqual(original, updated)


if __name__ == "__main__":
    unittest.main()
