#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"

ENV_FILE_DEFAULT="/opt/listinglive/config/.env.prod"
STATE_FILE_DEFAULT="/opt/listinglive/logs/last_deploy.env"

ENV_FILE="${LISTINGLIVE_ENV_FILE:-${ENV_FILE_DEFAULT}}"
STATE_FILE="${LISTINGLIVE_STATE_FILE:-${STATE_FILE_DEFAULT}}"

log() {
  printf '[listinglive-prod] %s\n' "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

timestamp() {
  date +"%Y%m%d_%H%M%S"
}

ensure_commands() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || fail "Missing required command: ${cmd}"
  done
}

load_env() {
  [[ -f "${ENV_FILE}" ]] || fail "Production env file not found: ${ENV_FILE}"

  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a

  export APP_ENV_FILE="${ENV_FILE}"
  export APP_CONFIG_ROOT="${APP_CONFIG_ROOT:-/opt/listinglive/config}"
  export APP_STORAGE_ROOT="${APP_STORAGE_ROOT:-/opt/listinglive/data/storage}"
  export APP_BACKUP_ROOT="${APP_BACKUP_ROOT:-/opt/listinglive/backups}"
  export AI_PROVIDER_TOML_PATH="${AI_PROVIDER_TOML_PATH:-${APP_CONFIG_ROOT}/ai_provider.toml}"
  export PROXY_PORT="${PROXY_PORT:-3001}"
  export APP_DOMAIN="${APP_DOMAIN:-localhost}"
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://${APP_DOMAIN}/api}"
  export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://${APP_DOMAIN}}"
  export BACKUP_DAILY_RETENTION_DAYS="${BACKUP_DAILY_RETENTION_DAYS:-7}"
  export BACKUP_WEEKLY_RETENTION_DAYS="${BACKUP_WEEKLY_RETENTION_DAYS:-28}"
  export APP_GIT_BRANCH="${APP_GIT_BRANCH:-main}"
  export CONTAINER_TIMEZONE="${CONTAINER_TIMEZONE:-$(detect_host_timezone)}"
}

require_env_values() {
  local name
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || fail "Required environment variable is empty: ${name}"
  done
}

detect_host_timezone() {
  if [[ -n "${CONTAINER_TIMEZONE:-}" ]]; then
    printf '%s\n' "${CONTAINER_TIMEZONE}"
    return 0
  fi

  if [[ -f /etc/timezone ]]; then
    tr -d '[:space:]' < /etc/timezone
    return 0
  fi

  local tz_target
  tz_target="$(readlink -f /etc/localtime 2>/dev/null || true)"
  if [[ -n "${tz_target}" && "${tz_target}" == /usr/share/zoneinfo/* ]]; then
    printf '%s\n' "${tz_target#/usr/share/zoneinfo/}"
    return 0
  fi

  printf 'UTC\n'
}

ensure_prod_dirs() {
  mkdir -p "${APP_STORAGE_ROOT}" "${APP_BACKUP_ROOT}" "$(dirname "${STATE_FILE}")"
}

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

current_git_ref() {
  git -C "${ROOT_DIR}" rev-parse HEAD
}

wait_for_service() {
  local service="$1"
  local attempts="${2:-60}"
  local sleep_seconds="${3:-2}"
  local cid status

  while (( attempts > 0 )); do
    cid="$(compose ps -q "${service}" 2>/dev/null || true)"
    if [[ -n "${cid}" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${cid}" 2>/dev/null || true)"
      if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
        return 0
      fi
    fi
    attempts=$((attempts - 1))
    sleep "${sleep_seconds}"
  done

  fail "Service did not become ready in time: ${service}"
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-60}"
  local sleep_seconds="${3:-2}"

  while (( attempts > 0 )); do
    if curl -fsS --max-time 5 "${url}" >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep "${sleep_seconds}"
  done

  fail "URL did not become ready in time: ${url}"
}

write_state_file() {
  local previous_ref="$1"
  local deployed_ref="$2"
  local backup_stamp="$3"
  local deployed_at="$4"

  cat > "${STATE_FILE}" <<EOF
PREVIOUS_GIT_REF=${previous_ref}
DEPLOYED_GIT_REF=${deployed_ref}
LAST_BACKUP_STAMP=${backup_stamp}
DEPLOYED_AT=${deployed_at}
ENV_FILE=${ENV_FILE}
EOF
}
