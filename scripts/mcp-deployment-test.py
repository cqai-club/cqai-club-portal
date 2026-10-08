#!/usr/bin/env python3
"""Exercise the deployment verifier against real HTTP success and failure cases."""
import contextlib
import json
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
VERIFIER = PROJECT_ROOT / "deploy/check-mcp-endpoints.py"
RESOURCE = "https://club.example/mcp"
ISSUER = "https://auth.example/oidc"
METADATA_URL = "https://club.example/.well-known/oauth-protected-resource/mcp"


@contextlib.contextmanager
def http_server(changes=None):
    changes = changes or {}
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            requests.append(("GET", self.path))
            metadata = {
                "resource": RESOURCE,
                "authorization_servers": [ISSUER],
                "bearer_methods_supported": ["header"],
                "scopes_supported": ["activity:publish", "plugin:admin"],
            }
            metadata.update(changes.get("metadata", {}))
            if self.path == "/.well-known/oauth-protected-resource":
                metadata.update(changes.get("alias", {}))
            status = changes.get("metadata_status", 200)
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            if status == 302:
                self.send_header("Location", "/redirected-metadata")
            self.end_headers()
            self.wfile.write(changes.get("body", json.dumps(metadata).encode()))

        def do_POST(self):
            requests.append(("POST", self.path))
            assert self.headers.get("Authorization") is None
            assert self.headers.get("Cookie") is None
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            self.send_response(changes.get("anonymous_status", 401))
            challenge = changes.get("challenge", 'Bearer resource_metadata="' + METADATA_URL + '"')
            if challenge is not None:
                self.send_header("WWW-Authenticate", challenge)
            self.end_headers()
            self.wfile.write(b'{"code":"LOGIN_REQUIRED"}')

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield "http://127.0.0.1:" + str(server.server_port), requests
    finally:
        server.shutdown()
        server.server_close()
        worker.join()


class McpDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cqai-mcp-deployment-")
        self.addCleanup(self.temp.cleanup)
        self.env = Path(self.temp.name) / "app.env"
        # Existing public settings suffice; unrelated secrets must stay private.
        self.env.write_text(
            'BASE_URL_PROD="https://club.example/member"\n'
            'LOGTO_ENDPOINT="https://auth.example/"\n'
            'LOGTO_APP_SECRET=never-export-this-secret\n', encoding="utf-8")

    def run_verifier(self, base=None, extra=None):
        args = ["python3", str(VERIFIER)]
        if base is not None:
            args.append(base)
        args += extra or ["--env-file", str(self.env)]
        result = subprocess.run(args, cwd=PROJECT_ROOT, text=True, capture_output=True, timeout=15)
        self.assertNotIn("never-export-this-secret", result.stdout + result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        return result

    def test_existing_environment_with_loopback_probe(self):
        with http_server() as (base, requests):
            result = self.run_verifier(base)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(requests, [
            ("GET", "/.well-known/oauth-protected-resource/mcp"),
            ("GET", "/.well-known/oauth-protected-resource"),
            ("POST", "/mcp"),
        ])

    def test_public_configuration_export_and_runner_reuse(self):
        exported = self.run_verifier(extra=["--env-file", str(self.env), "--export-expectations"])
        self.assertEqual(exported.returncode, 0, exported.stderr)
        self.assertEqual(json.loads(exported.stdout), {"resource": RESOURCE, "issuer": ISSUER})
        expected = Path(self.temp.name) / "public-expectations.json"
        expected.write_text(exported.stdout)
        with http_server() as (base, _):
            result = self.run_verifier(base, ["--expected-file", str(expected)])
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_explicit_resource_and_existing_oidc_suffix(self):
        self.env.write_text("BASE_URL_PROD=https://unrelated.example/member\n"
                            "CQAI_MCP_RESOURCE=https://club.example:443/mcp\n"
                            "LOGTO_ENDPOINT=https://auth.example/oidc\n")
        with http_server() as (base, _):
            result = self.run_verifier(base)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_bad_discovery_and_authentication(self):
        cases = [
            ({"metadata": {"resource": "https://other.example/mcp"}}, "resource differs"),
            ({"metadata": {"authorization_servers": ["https://other.example/oidc"]}}, "issuer differs"),
            ({"alias": {"resource": "https://other.example/mcp"}}, "resource differs"),
            ({"metadata": {"scopes_supported": ["activity:publish"]}}, "business scopes"),
            ({"metadata": {"scopes_supported": [{}]}}, "business scopes"),
            ({"metadata": {"bearer_methods_supported": ["query"]}}, "header authentication"),
            ({"body": b'not-json'}, "return JSON"),
            ({"body": b'[]'}, "return an object"),
            ({"metadata_status": 302}, "without redirects"),
            ({"anonymous_status": 200}, "return 401"),
            ({"anonymous_status": 404}, "return 401"),
            ({"challenge": None}, "canonical resource metadata"),
            ({"challenge": 'Bearer resource_metadata="https://other.example/metadata"'}, "canonical resource metadata"),
            ({"challenge": 'Basic resource_metadata="' + METADATA_URL + '"'}, "canonical resource metadata"),
        ]
        for changes, message in cases:
            with self.subTest(changes=changes):
                with http_server(changes) as (base, _):
                    result = self.run_verifier(base)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn(message, result.stderr)

    def test_rejects_invalid_runtime_configuration_before_requests(self):
        for resource in ("https://club.example/not-mcp", "https://user:secret@club.example/mcp", "http://club.example/mcp", "https://club.example/mcp?query=1"):
            with self.subTest(resource=resource):
                self.env.write_text("CQAI_MCP_RESOURCE=" + resource + "\nLOGTO_ENDPOINT=https://auth.example\n")
                with http_server() as (base, requests):
                    result = self.run_verifier(base)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(requests, [])


if __name__ == "__main__":
    unittest.main()
