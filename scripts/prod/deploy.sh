#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

SKIP_PULL=0
SKIP_BACKUP=0
TARGET_REF=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)
      SKIP_PULL=1
      shift
      ;;
    --skip-backup)
      SKIP_BACKUP=1
      shift
      ;;
    --ref)
      TARGET_REF="${2:-}"
      [[ -n "${TARGET_REF}" ]] || fail "Missing value for --ref"
      shift 2
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

load_env
ensure_commands docker git curl
require_env_values APP_GIT_BRANCH PROXY_PORT
ensure_prod_dirs

log "Using container timezone: ${CONTAINER_TIMEZONE}"

PREVIOUS_REF="$(current_git_ref)"

if [[ "${SKIP_PULL}" -eq 0 ]]; then
  git -c core.filemode=false -C "${ROOT_DIR}" diff --quiet || fail "Working tree is dirty. Commit or stash changes before deploy."
  git -c core.filemode=false -C "${ROOT_DIR}" diff --cached --quiet || fail "Staged changes detected. Clean the repository before deploy."
  git -c core.filemode=false -C "${ROOT_DIR}" fetch origin

  if [[ -n "${TARGET_REF}" ]]; then
    git -c core.filemode=false -C "${ROOT_DIR}" checkout "${TARGET_REF}"
  else
    git -c core.filemode=false -C "${ROOT_DIR}" checkout "${APP_GIT_BRANCH}"
    git -c core.filemode=false -C "${ROOT_DIR}" pull --ff-only origin "${APP_GIT_BRANCH}"
  fi
elif [[ -n "${TARGET_REF}" ]]; then
  git -c core.filemode=false -C "${ROOT_DIR}" checkout "${TARGET_REF}"
fi

DEPLOYED_REF="$(current_git_ref)"
BACKUP_STAMP="skipped"

if [[ "${SKIP_BACKUP}" -eq 0 ]]; then
  BACKUP_STAMP="$("${SCRIPT_DIR}/backup.sh" --quiet | tail -n 1)"
fi

# Frontend image copies content/media into public/media; ensure it exists so build does not fail
if [[ ! -d "${ROOT_DIR}/content/media" ]]; then
  log "WARNING: content/media not found. Frontend Hero media may be missing. Create it or add placeholder files."
  mkdir -p "${ROOT_DIR}/content/media/pic" "${ROOT_DIR}/content/media/video"
  log "Created empty content/media directories. Replace with real assets if needed."
fi

log "Building production images"
compose build frontend api worker beat

log "Starting database and redis"
compose up -d postgres redis
wait_for_service postgres 60 2
wait_for_service redis 60 2

log "Running database migrations"
compose run --rm api alembic upgrade head

log "Starting application services"
compose up -d api worker beat frontend reverse-proxy

wait_for_service api 60 2
wait_for_service frontend 60 2
wait_for_url "http://127.0.0.1:${PROXY_PORT}/health" 60 2
wait_for_url "http://127.0.0.1:${PROXY_PORT}/" 60 2

DEPLOYED_AT="$(date -Is)"
write_state_file "${PREVIOUS_REF}" "${DEPLOYED_REF}" "${BACKUP_STAMP}" "${DEPLOYED_AT}"

compose ps
docker image prune -f >/dev/null 2>&1 || true

log "Deploy succeeded"
log "Current git ref: ${DEPLOYED_REF}"
log "Backup stamp: ${BACKUP_STAMP}"
