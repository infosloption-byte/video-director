"""Only previously working gateway worker DNS targets are rollout requirements."""
import importlib.util
import json
import socket
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "tts_gateway_worker_dns_snapshot.py"
spec = importlib.util.spec_from_file_location("gateway_dns", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

WORKERS = {
    "kokoro": "http://kokoro:8101",
    "melotts-v3": "http://melotts-v3:8102",
    "chatterbox-nano": "http://chatterbox-nano:8103",
    "qwen3-tts-0.6b": "http://qwen3-tts-0.6b:8104",
}
ADDRESSES = {"kokoro": "172.21.0.10", "qwen3-tts-0.6b": "172.21.0.11"}


def resolver(host, port, *, type):
    if host not in ADDRESSES:
        raise socket.gaierror(-3, "Temporary failure in name resolution")
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ADDRESSES[host], port))]


class GatewayDnsSnapshotTests(unittest.TestCase):
    def test_optional_unavailable_engines_do_not_fail_live_baseline(self):
        status = module.worker_dns_snapshot(WORKERS, "kokoro", resolver)
        self.assertEqual(status["resolved"], ["kokoro", "qwen3-tts-0.6b"])
        self.assertEqual(status["missing"], ["chatterbox-nano", "melotts-v3"])
        self.assertEqual(len(status["signature"]), 64)

    def test_signatures_are_stable_for_unmodified_live_workers(self):
        first = module.worker_dns_snapshot(WORKERS, "kokoro", resolver)
        second = module.worker_dns_snapshot(dict(reversed(list(WORKERS.items()))), "kokoro", resolver)
        self.assertEqual(first, second)
        self.assertEqual(json.dumps(first), json.dumps(second))

    def test_rejects_default_tts_worker_that_does_not_resolve(self):
        with self.assertRaisesRegex(module.WorkerDnsError, "default"):
            module.worker_dns_snapshot(WORKERS, "melotts-v3", resolver)

    def test_rejects_unknown_default_worker(self):
        with self.assertRaises(module.WorkerDnsError):
            module.worker_dns_snapshot(WORKERS, "missing", resolver)

    def test_change_or_loss_of_working_worker_changes_fingerprint(self):
        before = module.worker_dns_snapshot(WORKERS, "kokoro", resolver)
        with_changed_ip = dict(ADDRESSES)
        with_changed_ip["qwen3-tts-0.6b"] = "172.21.0.99"

        def changed(host, port, *, type):
            if host not in with_changed_ip:
                raise socket.gaierror()
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (with_changed_ip[host], port))]

        after = module.worker_dns_snapshot(WORKERS, "kokoro", changed)
        self.assertNotEqual(before, after)

        def missing_qwen(host, port, *, type):
            if host == "qwen3-tts-0.6b":
                raise socket.gaierror()
            return resolver(host, port, type=type)

        after = module.worker_dns_snapshot(WORKERS, "kokoro", missing_qwen)
        self.assertNotEqual(before, after)

    def test_rejects_malformed_worker_endpoint(self):
        invalid = dict(WORKERS)
        invalid["kokoro"] = "http://kokoro:notaport"
        with self.assertRaises(module.WorkerDnsError):
            module.worker_dns_snapshot(invalid, "kokoro", resolver)

    def test_snapshot_never_exposes_urls_or_resolved_ip(self):
        state = module.worker_dns_snapshot(WORKERS, "kokoro", resolver)
        payload = json.dumps(state)
        self.assertNotIn("http://", payload)
        self.assertNotIn("172.21.", payload)
        self.assertNotIn(":8101", payload)

    def test_rollout_compares_working_dns_before_and_after_deployment(self):
        source = (SCRIPT.parent / "rollout_gpu_gateway.sh").read_text()
        self.assertIn('worker_dns_before="$(snapshot_worker_dns "$gateway")"', source)
        self.assertIn('worker_dns_after="$(snapshot_worker_dns "$gateway_new")"', source)
        self.assertIn('[[ "$worker_dns_after" == "$worker_dns_before" ]]', source)
        self.assertIn('[[ "$(snapshot_worker_dns "$id")" == "$worker_dns_before" ]]', source)
        self.assertNotIn('for endpoint in WORKERS.values():', source)
        self.assertIn('socket.getaddrinfo("voxora-gpu-coordinator", 6379)', source)
        self.assertIn('assert client.ping() is True', source)


if __name__ == "__main__":
    unittest.main()
