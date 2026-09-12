#!/usr/bin/env bash
set -Eeuo pipefail

resource_path="${1:-/data/cqai-club-portal}"
meminfo_file="${CQAI_MEMINFO_FILE:-/proc/meminfo}"
min_disk_available_kib="${CQAI_MIN_DISK_AVAILABLE_KIB:-10485760}"
max_disk_usage_percent="${CQAI_MAX_DISK_USAGE_PERCENT:-75}"
max_inode_usage_percent="${CQAI_MAX_INODE_USAGE_PERCENT:-80}"
min_memory_available_kib="${CQAI_MIN_MEMORY_AVAILABLE_KIB:-1572864}"

require_non_negative_integer() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "Resource gate configuration is invalid: $name=$value"
    exit 10
  fi
}

require_non_negative_integer CQAI_MIN_DISK_AVAILABLE_KIB "$min_disk_available_kib"
require_non_negative_integer CQAI_MAX_DISK_USAGE_PERCENT "$max_disk_usage_percent"
require_non_negative_integer CQAI_MAX_INODE_USAGE_PERCENT "$max_inode_usage_percent"
require_non_negative_integer CQAI_MIN_MEMORY_AVAILABLE_KIB "$min_memory_available_kib"

if [[ ! -d "$resource_path" ]]; then
  echo "Resource gate path does not exist: $resource_path"
  exit 10
fi
if [[ ! -r "$meminfo_file" ]]; then
  echo "Resource gate cannot read memory information: $meminfo_file"
  exit 10
fi

disk_available_kib="$(df -Pk "$resource_path" | awk 'END {print $4}')"
disk_usage_percent="$(df -Pk "$resource_path" | awk 'END {gsub(/%/, "", $5); print $5}')"
inode_usage_percent="$(df -Pi "$resource_path" | awk 'END {gsub(/%/, "", $5); print $5}')"
memory_available_kib="$(awk '$1 == "MemAvailable:" {print $2; exit}' "$meminfo_file")"

for measurement in disk_available_kib disk_usage_percent inode_usage_percent memory_available_kib; do
  require_non_negative_integer "$measurement" "${!measurement:-}"
done

echo "Resource gate: disk_available=${disk_available_kib}KiB disk_used=${disk_usage_percent}% inode_used=${inode_usage_percent}% memory_available=${memory_available_kib}KiB"

gate_failed=false
if (( disk_available_kib < min_disk_available_kib )); then
  echo "Resource gate failed: available disk is below ${min_disk_available_kib}KiB."
  gate_failed=true
fi
if (( disk_usage_percent >= max_disk_usage_percent )); then
  echo "Resource gate failed: disk usage must be below ${max_disk_usage_percent}%."
  gate_failed=true
fi
if (( inode_usage_percent >= max_inode_usage_percent )); then
  echo "Resource gate failed: inode usage must be below ${max_inode_usage_percent}%."
  gate_failed=true
fi
if (( memory_available_kib < min_memory_available_kib )); then
  echo "Resource gate failed: available memory is below ${min_memory_available_kib}KiB."
  gate_failed=true
fi

if [[ "$gate_failed" == "true" ]]; then
  exit 10
fi

echo "Resource gate passed."
