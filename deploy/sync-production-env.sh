#!/usr/bin/env bash
set -Eeuo pipefail

environment_file="${1:-/data/informationCollection/.env}"
auth_config_file="${2:-}"

if [[ -z "$auth_config_file" || ! -f "$auth_config_file" ]]; then
  echo "Production auth configuration file is missing."
  exit 2
fi

if [[ ! -f "$environment_file" ]]; then
  echo "Production environment file does not exist: $environment_file"
  exit 3
fi

trap 'rm -f "$auth_config_file"' EXIT

python3 - "$environment_file" "$auth_config_file" <<'PY'
import json
import os
import re
import secrets
import sys

environment_file, auth_config_file = sys.argv[1:]
with open(auth_config_file, encoding='utf-8') as source:
    incoming = json.load(source)

required = ('LOGTO_CLIENT_ID', 'LOGTO_CLIENT_SECRET')
for key in required:
    value = incoming.get(key)
    if not isinstance(value, str) or not value or any(character in value for character in ('\n', '\r', '\0')):
        raise SystemExit(f'{key} is missing or invalid.')

managed_values = {
    'NODE_ENV': 'production',
    'PORT': '3000',
    'LOGTO_ISSUER': 'https://auth.cqaiclub.asia/oidc',
    'LOGTO_CLIENT_ID': incoming['LOGTO_CLIENT_ID'],
    'LOGTO_CLIENT_SECRET': incoming['LOGTO_CLIENT_SECRET'],
    'LOGTO_REDIRECT_URI': 'https://cqaiclub.asia/auth/callback',
    'LOGTO_POST_LOGOUT_REDIRECT_URI': 'https://cqaiclub.asia/admin/',
    'LOGTO_ADMIN_ROLE': 'club-admin',
    'LEGACY_ADMIN_LOGIN_ENABLED': 'false',
}
managed_order = [
    'NODE_ENV',
    'PORT',
    'LOGTO_ISSUER',
    'LOGTO_CLIENT_ID',
    'LOGTO_CLIENT_SECRET',
    'LOGTO_REDIRECT_URI',
    'LOGTO_POST_LOGOUT_REDIRECT_URI',
    'LOGTO_ADMIN_ROLE',
    'LEGACY_ADMIN_LOGIN_ENABLED',
    'SESSION_SECRET',
]

with open(environment_file, 'rb') as source:
    original = source.read()

lines = original.decode('utf-8').splitlines(keepends=True)
key_pattern = re.compile(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=')
rendered = []
written = set()

for line in lines:
    match = key_pattern.match(line)
    if not match or match.group(1) not in managed_order:
        rendered.append(line)
        continue

    key = match.group(1)
    if key in written:
        continue

    if key == 'SESSION_SECRET':
        raw_value = line.split('=', 1)[1].rstrip('\r\n')
        if raw_value.strip():
            rendered.append(line if line.endswith(('\n', '\r')) else f'{line}\n')
            written.add(key)
            continue

    if key != 'SESSION_SECRET':
        rendered.append(f'{key}={managed_values[key]}\n')
        written.add(key)

if 'SESSION_SECRET' not in written:
    managed_values['SESSION_SECRET'] = secrets.token_hex(32)

for key in managed_order:
    if key not in written:
        rendered.append(f'{key}={managed_values[key]}\n')
        written.add(key)

updated = ''.join(rendered).encode('utf-8')

try:
    with open(environment_file, 'wb') as destination:
        destination.write(updated)
        destination.flush()
        os.fsync(destination.fileno())
except Exception:
    with open(environment_file, 'wb') as destination:
        destination.write(original)
        destination.flush()
        os.fsync(destination.fileno())
    raise
PY

echo "Production environment synchronized."
