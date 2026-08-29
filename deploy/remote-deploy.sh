#!/usr/bin/env bash
set -Eeuo pipefail

release_sha="${1:-}"
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid release SHA."
  exit 2
fi

deploy_base="${CQAI_DEPLOY_BASE:-/data/cqai-club-portal}"
environment_file="${CQAI_ENV_FILE:-/data/informationCollection/.env}"
database_file="${CQAI_DB_FILE:-/data/informationCollection/prisma/dev.db}"
archive_file="$deploy_base/incoming/$release_sha.tgz"
release_directory="$deploy_base/releases/$release_sha"
backup_directory="$deploy_base/backups"
temporary_directory="$deploy_base/tmp"
image_name="cqai-club-portal:$release_sha"
production_container="cqai-club-portal"
legacy_container="aiclub-form"
rollback_container="cqai-club-portal-rollback"
candidate_container="cqai-club-portal-candidate-${release_sha:0:12}"
candidate_directory="$temporary_directory/candidate-${release_sha:0:12}"
candidate_database="$candidate_directory/dev.db"

mkdir -p "$deploy_base/incoming" "$deploy_base/releases" "$backup_directory" "$temporary_directory"

exec 9>"$deploy_base/deploy.lock"
if ! flock -n 9; then
  echo "Another deployment is already running."
  exit 3
fi

for required_file in "$archive_file" "$environment_file" "$database_file"; do
  if [[ ! -f "$required_file" ]]; then
    echo "Required deployment file is missing: $required_file"
    exit 4
  fi
done

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
  rmdir "$candidate_directory" >/dev/null 2>&1 || true
}
trap cleanup_candidate EXIT

backup_database() {
  local destination="$1"
  rm -f "$destination"
  sqlite3 "$database_file" ".timeout 5000" ".backup '$destination'"
  chmod 660 "$destination"
}

if [[ ! -d "$release_directory" ]]; then
  mkdir -p "$release_directory"
  tar -xzf "$archive_file" -C "$release_directory"
fi

echo "Building $image_name"
docker build --pull=false --tag "$image_name" "$release_directory"

cleanup_candidate
mkdir -p "$candidate_directory"
backup_database "$candidate_database"

docker run -d \
  --name "$candidate_container" \
  --env-file "$environment_file" \
  --env DATABASE_URL=file:/data/dev.db \
  --publish 127.0.0.1::3000 \
  --volume "$candidate_directory:/data" \
  "$image_name" >/dev/null

candidate_port="$(docker port "$candidate_container" 3000/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -1)"
if [[ -z "$candidate_port" ]]; then
  echo "Could not determine candidate port."
  docker logs "$candidate_container" --tail 100 || true
  exit 5
fi

candidate_ready=false
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$candidate_port/health" >/dev/null \
    && curl -fsS "http://127.0.0.1:$candidate_port/" | grep -q '重庆AI创享俱乐部' \
    && curl -fsS "http://127.0.0.1:$candidate_port/apply/" | grep -q '入会申请' \
    && curl -fsS "http://127.0.0.1:$candidate_port/admin/" | grep -q '管理后台登录'; then
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
  "$image_name" \
  node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma; then
  exit 7
fi

if ! docker run -d \
  --name "$production_container" \
  --restart unless-stopped \
  --env-file "$environment_file" \
  --env DATABASE_URL=file:/data/dev.db \
  --publish 127.0.0.1:3000:3000 \
  --volume "$(dirname "$database_file"):/data" \
  "$image_name" >/dev/null; then
  exit 8
fi

production_ready=false
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null \
    && curl -fsS http://127.0.0.1:3000/ | grep -q '重庆AI创享俱乐部' \
    && curl -fsS http://127.0.0.1:3000/apply/ | grep -q '入会申请' \
    && curl -fsS http://127.0.0.1:3000/admin/ | grep -q '管理后台登录'; then
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
