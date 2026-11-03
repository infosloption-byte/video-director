"""Safety checks for a Docker gateway bound to a private EC2 host IP."""
import importlib.util
import io
import json
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "gateway_health_binding", SCRIPTS / "resolve_gpu_gateway_health_url.py")
resolver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolver)


def published(host="172.31.64.234", port="8000"):
    return {"8000/tcp": [{"HostIp": host, "HostPort": port}]}


class GatewayHealthBindingTests(unittest.TestCase):
    def test_actual_ec2_private_binding_is_used(self):
        self.assertEqual(
            resolver.resolve_health_url(published()),
            "http://172.31.64.234:8000/health")

    def test_loopback_still_supported_when_explicitly_published(self):
        self.assertEqual(
            resolver.resolve_health_url(published("127.0.0.1")),
            "http://127.0.0.1:8000/health")

    def test_rejects_public_wildcard_ipv6_and_special_bindings(self):
        for host in ("0.0.0.0", "::", "::1", "54.157.129.157",
                     "169.254.1.10", "224.0.0.1", "not-an-ip"):
            with self.subTest(host=host), self.assertRaises(resolver.UnsafeGatewayBinding):
                resolver.resolve_health_url(published(host))

    def test_rejects_missing_duplicate_or_incorrect_port_mappings(self):
        cases = [
            {},
            {"8000/tcp": None},
            {"8000/tcp": []},
            {"8000/tcp": [published()["8000/tcp"][0]] * 2},
            {"8000/tcp": [{"HostIp": "172.31.64.234"}]},
            {"9000/tcp": [{"HostIp": "172.31.64.234", "HostPort": "8000"}]},
            published(port="0"),
            published(port="99999"),
        ]
        for mapping in cases:
            with self.subTest(mapping=mapping), self.assertRaises(resolver.UnsafeGatewayBinding):
                resolver.resolve_health_url(mapping)

    def test_cli_inspects_live_docker_published_port_not_environment(self):
        outcome = SimpleNamespace(returncode=0, stdout=json.dumps(published()), stderr="")
        with patch.object(resolver.subprocess, "run", return_value=outcome) as run:
            output = io.StringIO()
            with redirect_stdout(output):
                rc = resolver.main(["resolver.py", "container-id-123"])
        self.assertEqual(rc, 0)
        self.assertEqual(output.getvalue().strip(), "http://172.31.64.234:8000/health")
        self.assertEqual(run.call_args.args[0][:3],
                         ["sudo", "docker", "inspect"])
        self.assertEqual(run.call_args.args[0][3], "container-id-123")

    def test_cli_fails_closed_if_docker_binding_is_public(self):
        outcome = SimpleNamespace(returncode=0, stdout=json.dumps(published("0.0.0.0")),
                                  stderr="passwords should not leak")
        with patch.object(resolver.subprocess, "run", return_value=outcome):
            err = io.StringIO()
            with redirect_stderr(err):
                rc = resolver.main(["resolver.py", "container-id-123"])
        self.assertEqual(rc, 1)
        self.assertNotIn("passwords should not leak", err.getvalue())

    def test_gateway_rollout_compares_bindings_across_recreation_and_rollback(self):
        source = (SCRIPTS / "rollout_gpu_gateway.sh").read_text()
        self.assertIn('gateway_health_url="$(python3', source)
        self.assertIn('current_url="$(python3', source)
        self.assertIn('[[ "$current_url" == "$gateway_health_url" ]] || return 1', source)
        self.assertIn('curl --noproxy', source)
        self.assertIn('probe_health || { echo "BLOCKED: original gateway health failed', source)
        self.assertNotIn('curl -fsS --max-time 3 http://127.0.0.1:8000/health', source)


if __name__ == "__main__":
    unittest.main()
