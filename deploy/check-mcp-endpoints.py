#!/usr/bin/env python3
"""Verify MCP discovery and anonymous authentication without user credentials."""
import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class ProbeError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def configured_url(value):
    try:
        url = urllib.parse.urlsplit(value)
        hostname = url.hostname
        port = url.port
    except ValueError as error:
        raise ProbeError("Invalid public MCP configuration") from error
    loopback = hostname in ("localhost", "127.0.0.1", "::1")
    if (not hostname or url.scheme not in ("http", "https") or
            (url.scheme == "http" and not loopback) or url.username is not None or
            url.password is not None or "?" in value or "#" in value):
        raise ProbeError("Invalid public MCP configuration")
    host = "[" + hostname + "]" if ":" in hostname else hostname
    if port and not (url.scheme == "https" and port == 443 or url.scheme == "http" and port == 80):
        host += ":" + str(port)
    return url, url.scheme + "://" + host


def environment_expectations(filename):
    # Read only the three public configuration keys. Never parse or export secrets.
    keys = {"BASE_URL_PROD", "CQAI_MCP_RESOURCE", "LOGTO_ENDPOINT"}
    config = {}
    with Path(filename).open(encoding="utf-8") as source:
        for line in source:
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            key, value = line.split("=", 1)
            if key.strip() in keys:
                config[key.strip()] = value.strip().strip("\"'")
    explicit = config.get("CQAI_MCP_RESOURCE", "").strip()
    if explicit:
        url, origin = configured_url(explicit)
        if url.path != "/mcp":
            raise ProbeError("MCP resource must use the /mcp path")
        resource = origin + "/mcp"
    else:
        _, origin = configured_url(config.get("BASE_URL_PROD", "").strip())
        resource = origin + "/mcp"
    endpoint = config.get("LOGTO_ENDPOINT", "").strip().rstrip("/")
    issuer = endpoint if endpoint.endswith("/oidc") else endpoint + "/oidc"
    configured_url(issuer)
    return {"resource": resource, "issuer": issuer}


def validate_expectations(value):
    if (not isinstance(value, dict) or set(value) != {"resource", "issuer"} or
            any(not isinstance(value[key], str) for key in value)):
        raise ProbeError("Invalid public MCP expectations")
    url, origin = configured_url(value["resource"])
    if url.path != "/mcp" or value["resource"] != origin + "/mcp":
        raise ProbeError("Invalid canonical MCP resource")
    configured_url(value["issuer"])
    return value


def fetch(opener, url, method="GET"):
    request = urllib.request.Request(url, method=method, headers={"Accept": "application/json"})
    if method == "POST":
        request.data = b'{}'
        request.add_header("Content-Type", "application/json")
    try:
        response = opener.open(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise ProbeError("MCP endpoint unavailable") from error
    with response:
        body = response.read(65_537)
        if len(body) > 65_536:
            raise ProbeError("MCP response exceeds the probe limit")
        return response.code, response.headers, body


def verify(base_url, expected):
    # Probe destinations can be a loopback candidate or the public origin.
    url, origin = configured_url(base_url)
    if url.path not in ("", "/"):
        raise ProbeError("Probe destination must be an origin")
    opener = urllib.request.build_opener(NoRedirect)
    for path in ("/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"):
        status, _, body = fetch(opener, origin + path)
        if status != 200:
            raise ProbeError("MCP discovery must return 200 without redirects")
        try:
            metadata = json.loads(body)
        except (ValueError, UnicodeError) as error:
            raise ProbeError("MCP discovery must return JSON") from error
        if not isinstance(metadata, dict):
            raise ProbeError("MCP discovery must return an object")
        if metadata.get("resource") != expected["resource"]:
            raise ProbeError("MCP discovery resource differs from runtime configuration")
        if metadata.get("authorization_servers") != [expected["issuer"]]:
            raise ProbeError("MCP discovery issuer differs from runtime configuration")
        if metadata.get("bearer_methods_supported") != ["header"]:
            raise ProbeError("MCP discovery must advertise header authentication")
        scopes = metadata.get("scopes_supported")
        if (not isinstance(scopes, list) or any(not isinstance(scope, str) for scope in scopes) or
                not {"activity:publish", "plugin:admin"}.issubset(scopes)):
            raise ProbeError("MCP discovery is missing business scopes")
    status, headers, _ = fetch(opener, origin + "/mcp", method="POST")
    if status != 401:
        raise ProbeError("Anonymous MCP POST must return 401")
    challenge = headers.get("WWW-Authenticate", "")
    match = re.search(r'\bresource_metadata\s*=\s*(?:"([^"\r\n]+)"|([^,\s]+))', challenge, re.IGNORECASE)
    metadata_url = expected["resource"][:-4] + "/.well-known/oauth-protected-resource/mcp"
    if not challenge.lower().startswith("bearer ") or not match or (match.group(1) or match.group(2)) != metadata_url:
        raise ProbeError("Anonymous MCP challenge has no canonical resource metadata")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url", nargs="?")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--env-file")
    source.add_argument("--expected-file")
    parser.add_argument("--export-expectations", action="store_true")
    args = parser.parse_args()
    if args.env_file:
        expected = environment_expectations(args.env_file)
    else:
        expected = json.loads(Path(args.expected_file).read_text(encoding="utf-8"))
    expected = validate_expectations(expected)
    if args.export_expectations:
        print(json.dumps(expected, separators=(",", ":")))
        return
    if not args.base_url:
        raise ProbeError("A probe destination is required")
    verify(args.base_url, expected)
    print("MCP discovery and anonymous authentication checks passed.")


if __name__ == "__main__":
    try:
        main()
    except ProbeError as error:
        print("MCP endpoint check failed: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError) as error:
        # Do not expose environment-file contents or upstream response bodies.
        print("MCP endpoint check failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
