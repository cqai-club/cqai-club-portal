#!/bin/sh
set -eu

APP_DIR="/app"
CONFIG_DIR_DEFAULT="${APP_DIR}/deploy"

: "${CONFIG_DIR:=${CONFIG_DIR_DEFAULT}}"
: "${CONFIG_ENV_FILE:=app.env}"

ENV_FILE="${CONFIG_DIR}/${CONFIG_ENV_FILE}"

cd "${APP_DIR}"

echo "[entrypoint] Starting cqai-club-portal container..."
echo "[entrypoint] Runtime config directory: ${CONFIG_DIR}"

if [ -f "${ENV_FILE}" ]; then
  echo "[entrypoint] Loading environment from ${ENV_FILE}"
  set -a
  # shellcheck source=/dev/null
  . "${ENV_FILE}"
  set +a
else
  echo "[entrypoint] No env file at ${ENV_FILE}, using existing environment variables"
fi

: "${NODE_ENV:=production}"
: "${PORT:=3000}"
: "${HOSTNAME:=0.0.0.0}"
: "${CONFIG_DIR:=${CONFIG_DIR_DEFAULT}}"

export NODE_ENV PORT HOSTNAME CONFIG_DIR

FEATURES_CONFIG="${CONFIG_DIR}/features.yaml"

if [ ! -f "${FEATURES_CONFIG}" ]; then
  echo "[entrypoint] Missing features config: ${FEATURES_CONFIG}" >&2
  exit 1
fi

echo "[entrypoint] Validating runtime config"
node ./scripts/validate-runtime-config.bundle.mjs

echo "[entrypoint] Starting Next.js server on ${HOSTNAME}:${PORT}"
exec node ./server.js
