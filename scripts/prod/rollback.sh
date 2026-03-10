#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

TARGET_REF=""
BACKUP_STAMP=""
RESTORE_DATA=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      TARGET_REF="${2:-}"
      [[ -n "${TARGET_REF}" ]] || fail "Missing value for --ref"
      shift 2
      ;;
    --backup-stamp)
      BACKUP_STAMP="${2:-}"
      [[ -n "${BACKUP_STAMP}" ]] || fail "Missing value for --backup-stamp"
      shift 2
      ;;
    --restore-data)
      RESTORE_DATA=1
      shift
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

load_env
ensure_commands docker git tar gzip mktemp cp
require_env_values POSTGRES_USER POSTGRES_DB APP_STORAGE_ROOT APP_CONFIG_ROOT
ensure_prod_dirs

if [[ -z "${TARGET_REF}" && -f "${STATE_FILE}" ]]; then
  # shellcheck disable=SC1090
  . "${STATE_FILE}"
  TARGET_REF="${PREVIOUS_GIT_REF:-}"
fi

if [[ -z "${TARGET_REF}" ]]; then
  fail "No rollback target ref available. Pass --ref explicitly."
fi

if [[ "${RESTORE_DATA}" -eq 1 && -z "${BACKUP_STAMP}" && -f "${STATE_FILE}" ]]; then
  # shellcheck disable=SC1090
  . "${STATE_FILE}"
  BACKUP_STAMP="${LAST_BACKUP_STAMP:-}"
fi

resolve_backup_file() {
  local base_dir="$1"
  local prefix="$2"
  local stamp="$3"
  local daily="${base_dir}/daily/${prefix}_${stamp}"
  local weekly="${base_dir}/weekly/${prefix}_${stamp}"

  if [[ -f "${daily}" ]]; then
    printf '%s\n' "${daily}"
    return 0
  fi

  if [[ -f "${weekly}" ]]; then
    printf '%s\n' "${weekly}"
    return 0
  fi

  return 1
}

restore_from_backup() {
  [[ -n "${BACKUP_STAMP}" ]] || fail "Backup stamp is required when using --restore-data."

  local db_backup storage_backup config_backup temp_dir
  db_backup="$(resolve_backup_file "${APP_BACKUP_ROOT}/postgres" "postgres" "${BACKUP_STAMP}.sql.gz")" || fail "Postgres backup not found for stamp ${BACKUP_STAMP}"
  storage_backup="$(resolve_backup_file "${APP_BACKUP_ROOT}/storage" "storage" "${BACKUP_STAMP}.tar.gz")" || fail "Storage backup not found for stamp ${BACKUP_STAMP}"
  config_backup="$(resolve_backup_file "${APP_BACKUP_ROOT}/config" "config" "${BACKUP_STAMP}.tar.gz")" || fail "Config backup not found for stamp ${BACKUP_STAMP}"

  log "Stopping running containers before data restore"
  compose down || true

  log "Starting postgres for restore"
  compose up -d postgres redis
  wait_for_service postgres 60 2

  compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${POSTGRES_DB}' AND pid <> pg_backend_pid();"
  compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};"
  compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE ${POSTGRES_DB};"

  gzip -dc "${db_backup}" | compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1

  rm -rf "${APP_STORAGE_ROOT}"
  mkdir -p "$(dirname "${APP_STORAGE_ROOT}")"
  tar -xzf "${storage_backup}" -C "$(dirname "${APP_STORAGE_ROOT}")"

  temp_dir="$(mktemp -d)"
  tar -xzf "${config_backup}" -C "${temp_dir}"
  mkdir -p "${APP_CONFIG_ROOT}"

  if [[ -f "${temp_dir}/config/.env.prod" ]]; then
    cp "${temp_dir}/config/.env.prod" "${ENV_FILE}"
  fi
  if [[ -f "${temp_dir}/config/ai_provider.toml" ]]; then
    cp "${temp_dir}/config/ai_provider.toml" "${AI_PROVIDER_TOML_PATH}"
  fi
  if [[ -f "${temp_dir}/config/stripe_price_ids.local.json" ]]; then
    cp "${temp_dir}/config/stripe_price_ids.local.json" "${APP_CONFIG_ROOT}/stripe_price_ids.local.json"
  fi

  rm -rf "${temp_dir}"
}

if [[ "${RESTORE_DATA}" -eq 1 ]]; then
  restore_from_backup
fi

log "Rolling back code to ${TARGET_REF}"
"${SCRIPT_DIR}/deploy.sh" --skip-pull --skip-backup --ref "${TARGET_REF}"
