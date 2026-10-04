#!/usr/bin/env python3
"""Verify GitHub-provided M2M credentials and update only those runtime keys."""
import base64
import fcntl
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path


def main():
    env_file, backup_file = map(Path, sys.argv[1:3])
    payload = json.load(sys.stdin)
    keys = ("LOGTO_M2M_CLIENT_ID", "LOGTO_M2M_CLIENT_SECRET")
    if set(payload) != set(keys) or any(
        not isinstance(payload[key], str) or not payload[key] or
        len(payload[key]) > 4096 or any(char in payload[key] for char in "\r\n\0")
        for key in keys
    ):
        raise ValueError("Invalid management credential configuration")

    with env_file.open("r+", encoding="utf-8") as target:
        fcntl.flock(target, fcntl.LOCK_EX)
        original = target.read()
        config = {}
        for line in original.splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                config[key.strip()] = value.strip().strip("\"'")
        endpoint = config["LOGTO_ENDPOINT"].rstrip("/")
        token_request = urllib.request.Request(
            endpoint + "/oidc/token",
            data=urllib.parse.urlencode({"grant_type": "client_credentials", "resource": "https://default.logto.app/api", "scope": "all"}).encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + base64.b64encode((payload[keys[0]] + ":" + payload[keys[1]]).encode()).decode()},
        )
        token = json.load(urllib.request.urlopen(token_request, timeout=15))["access_token"]
        organization_request = urllib.request.Request(
            endpoint + "/api/organizations/rar9vrcnuavh",
            headers={"Authorization": "Bearer " + token},
        )
        organization = json.load(urllib.request.urlopen(organization_request, timeout=15))
        if organization.get("id") != "rar9vrcnuavh":
            raise ValueError("Innovation organization verification failed")

        # The existing file is group-writable, but its parent is root-owned.
        # Keep its owner/mode and restore its contents if an in-place write fails.
        with os.fdopen(os.open(backup_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as backup:
            backup.write(original)
        lines = [line for line in original.splitlines() if line.split("=", 1)[0].strip() not in keys]
        updated = "\n".join(lines + [key + "=" + payload[key] for key in keys]) + "\n"
        try:
            target.seek(0)
            target.write(updated)
            target.truncate()
            target.flush()
            os.fsync(target.fileno())
        except Exception:
            target.seek(0)
            target.write(original)
            target.truncate()
            target.flush()
            os.fsync(target.fileno())
            raise
    print("Management credentials verified and synchronized; original environment backed up.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never print request headers, response bodies or credential values.
        print("Management credential synchronization failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
