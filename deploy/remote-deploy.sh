#!/usr/bin/env bash
set -Eeuo pipefail

release_sha="${1:-}"
image_name="${2:-}"
registry_username="${3:-}"
resource_gate_script="${4:-}"
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid release SHA."
  exit 2
fi
if [[ ! "$image_name" =~ ^ghcr\.io/[a-z0-9._/-]+:"$release_sha"$ ]]; then
  echo "Invalid image reference; expected an immutable GHCR tag for the release SHA."
  exit 2
fi
if [[ -z "$registry_username" ]]; then
  echo "Registry username is required."
  exit 2
fi

deploy_base="${CQAI_DEPLOY_BASE:-/data/cqai-club-portal}"
environment_file="${CQAI_ENV_FILE:-/data/informationCollection/.env}"
database_file="${CQAI_DB_FILE:-/data/informationCollection/prisma/dev.db}"
storage_directory="${CQAI_STORAGE_DIR:-$deploy_base/storage}"
backup_directory="$deploy_base/backups"
temporary_directory="$deploy_base/tmp"
production_container="cqai-club-portal"
legacy_container="aiclub-form"
rollback_container="cqai-club-portal-rollback"
candidate_container="cqai-club-portal-candidate-${release_sha:0:12}"
candidate_directory="$temporary_directory/candidate-${release_sha:0:12}"
candidate_database="$candidate_directory/dev.db"

mkdir -p \
  "$deploy_base/incoming" \
  "$backup_directory" \
  "$temporary_directory" \
  "$storage_directory/uploads/collection"

exec 9>"$deploy_base/deploy.lock"
if ! flock -n 9; then
  echo "Another deployment is already running."
  exit 3
fi

for required_file in "$environment_file" "$database_file" "$resource_gate_script"; do
  if [[ ! -f "$required_file" ]]; then
    echo "Required deployment file is missing: $required_file"
    exit 4
  fi
done

bash "$resource_gate_script" "$deploy_base"

registry_config_directory="$(mktemp -d "$temporary_directory/registry-auth.XXXXXX")"
cleanup_registry_auth() {
  rm -rf "$registry_config_directory"
}
trap cleanup_registry_auth EXIT

IFS= read -r registry_token
if [[ -z "$registry_token" ]]; then
  echo "Registry token is required."
  exit 4
fi

echo "Pulling $image_name"
if ! printf '%s\n' "$registry_token" | DOCKER_CONFIG="$registry_config_directory" \
  docker login ghcr.io --username "$registry_username" --password-stdin >/dev/null; then
  echo "Registry login failed."
  exit 4
fi
unset registry_token
DOCKER_CONFIG="$registry_config_directory" docker pull "$image_name"
cleanup_registry_auth
trap - EXIT

bash "$resource_gate_script" "$deploy_base"

cleanup_candidate() {
  if docker container inspect "$candidate_container" >/dev/null 2>&1; then
    docker stop "$candidate_container" >/dev/null 2>&1 || true
    docker rm "$candidate_container" >/dev/null 2>&1 || true
  fi
  rm -f \
    "$candidate_database" \
    "${candidate_database}-journal" \
    "${candidate_database}-wal" \
    "${candidate_database}-shm"
  rmdir \
    "$candidate_directory/storage/uploads/collection" \
    "$candidate_directory/storage/uploads" \
    "$candidate_directory/storage" >/dev/null 2>&1 || true
  rmdir "$candidate_directory" >/dev/null 2>&1 || true
}
trap cleanup_candidate EXIT

backup_database() {
  local destination="$1"
  rm -f "$destination"
  sqlite3 "$database_file" ".timeout 5000" ".backup '$destination'"
  chmod 660 "$destination"
}

url_contains() {
  local url="$1"
  local expected_text="$2"
  local response_body
  response_body="$(curl -fsS "$url")" || return 1
  [[ "$response_body" == *"$expected_text"* ]]
}

url_redirects_to() {
  local url="$1"
  local expected_path="$2"
  local response_headers
  response_headers="$(curl -sS -D - -o /dev/null "$url")" || return 1
  grep -Fqi "location:" <<< "$response_headers" && grep -Fq "$expected_path" <<< "$response_headers"
}

cleanup_candidate
mkdir -p "$candidate_directory"
mkdir -p "$candidate_directory/storage/uploads/collection"
backup_database "$candidate_database"

docker run -d \
  --name "$candidate_container" \
  --env-file "$environment_file" \
  --env DATABASE_URL=file:/data/dev.db \
  --env CONFIG_DIR=/app/deploy \
  --publish 127.0.0.1::3000 \
  --volume "$candidate_directory:/data" \
  --volume "$candidate_directory/storage:/app/storage" \
  "$image_name" >/dev/null

candidate_port="$(docker port "$candidate_container" 3000/tcp 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -1 || true)"
if [[ -z "$candidate_port" ]]; then
  echo "Could not determine candidate port."
  docker inspect "$candidate_container" --format 'status={{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}' || true
  docker logs "$candidate_container" --tail 100 || true
  exit 5
fi

candidate_ready=false
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$candidate_port/api/health" >/dev/null \
    && url_contains "http://127.0.0.1:$candidate_port/" '重庆AI创享俱乐部' \
    && url_contains "http://127.0.0.1:$candidate_port/apply/" '入会申请' \
    && url_redirects_to "http://127.0.0.1:$candidate_port/admin/" '/member/dashboard/admin/members' \
    && url_redirects_to "http://127.0.0.1:$candidate_port/collection-admin.html" '/member/dashboard/admin/collections'; then
    candidate_ready=true
    break
  fi
  sleep 1
done

if [[ "$candidate_ready" != "true" ]]; then
  echo "Candidate verification failed."
  docker logs "$candidate_container" --tail 100 || true
  exit 6
fi

cleanup_candidate
trap - EXIT

timestamp="$(date +%Y%m%d-%H%M%S)"
database_backup="$backup_directory/dev-${timestamp}-${release_sha:0:12}.db"
backup_database "$database_backup"

previous_container=""
if docker container inspect "$production_container" >/dev/null 2>&1; then
  previous_container="$production_container"
elif docker container inspect "$legacy_container" >/dev/null 2>&1; then
  previous_container="$legacy_container"
fi

restore_previous() {
  set +e
  echo "Deployment failed; restoring the previous container and database."
  if docker container inspect "$production_container" >/dev/null 2>&1; then
    docker stop "$production_container" >/dev/null 2>&1 || true
    docker rm "$production_container" >/dev/null 2>&1 || true
  fi
  rm -f \
    "${database_file}-journal" \
    "${database_file}-wal" \
    "${database_file}-shm"
  cp -p "$database_backup" "$database_file"
  chmod 660 "$database_file"
  if [[ -n "$previous_container" ]]; then
    if ! docker container inspect "$previous_container" >/dev/null 2>&1 \
      && docker container inspect "$rollback_container" >/dev/null 2>&1; then
      docker rename "$rollback_container" "$previous_container"
    fi
    if docker container inspect "$previous_container" >/dev/null 2>&1; then
      docker start "$previous_container" >/dev/null
    fi
  fi
  set -e
}

cutover_started=false
handle_cutover_exit() {
  local exit_status="$?"
  if [[ "$exit_status" -ne 0 && "$cutover_started" == "true" ]]; then
    restore_previous || true
  fi
  exit "$exit_status"
}
trap handle_cutover_exit EXIT

if docker container inspect "$rollback_container" >/dev/null 2>&1; then
  docker stop "$rollback_container" >/dev/null 2>&1 || true
  docker rm "$rollback_container" >/dev/null
fi

cutover_started=true
if [[ -n "$previous_container" ]]; then
  docker stop "$previous_container" >/dev/null
  docker rename "$previous_container" "$rollback_container"
fi

if ! docker run --rm \
  --env-file "$environment_file" \
  --env DATABASE_URL=file:/data/dev.db \
  --volume "$(dirname "$database_file"):/data" \
  --entrypoint node \
  "$image_name" \
  node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma; then
  exit 7
fi

if ! docker run -d \
  --name "$production_container" \
  --restart unless-stopped \
  --env-file "$environment_file" \
  --env DATABASE_URL=file:/data/dev.db \
  --env CONFIG_DIR=/app/deploy \
  --publish 127.0.0.1:3000:3000 \
  --volume "$(dirname "$database_file"):/data" \
  --volume "$storage_directory:/app/storage" \
  "$image_name" >/dev/null; then
  exit 8
fi

production_ready=false
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null \
    && url_contains http://127.0.0.1:3000/ '重庆AI创享俱乐部' \
    && url_contains http://127.0.0.1:3000/apply/ '入会申请' \
    && url_redirects_to http://127.0.0.1:3000/admin/ '/member/dashboard/admin/members' \
    && url_redirects_to http://127.0.0.1:3000/collection-admin.html '/member/dashboard/admin/collections'; then
    production_ready=true
    break
  fi
  sleep 1
done

if [[ "$production_ready" != "true" ]]; then
  docker logs "$production_container" --tail 100 || true
  exit 9
fi

printf '%s\n' "$release_sha" > "$deploy_base/current-sha"
cutover_started=false
trap - EXIT
echo "Deployment succeeded: $release_sha"
