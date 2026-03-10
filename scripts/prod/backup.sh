#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

QUIET=0
if [[ "${1:-}" == "--quiet" ]]; then
  QUIET=1
fi

load_env
ensure_commands docker git tar gzip curl mktemp cp find
require_env_values POSTGRES_USER POSTGRES_DB APP_STORAGE_ROOT APP_BACKUP_ROOT APP_CONFIG_ROOT
ensure_prod_dirs

STAMP="$(timestamp)"
POSTGRES_DAILY_DIR="${APP_BACKUP_ROOT}/postgres/daily"
POSTGRES_WEEKLY_DIR="${APP_BACKUP_ROOT}/postgres/weekly"
STORAGE_DAILY_DIR="${APP_BACKUP_ROOT}/storage/daily"
STORAGE_WEEKLY_DIR="${APP_BACKUP_ROOT}/storage/weekly"
CONFIG_DAILY_DIR="${APP_BACKUP_ROOT}/config/daily"
CONFIG_WEEKLY_DIR="${APP_BACKUP_ROOT}/config/weekly"
MANIFEST_DIR="${APP_BACKUP_ROOT}/manifests"

mkdir -p \
  "${POSTGRES_DAILY_DIR}" "${POSTGRES_WEEKLY_DIR}" \
  "${STORAGE_DAILY_DIR}" "${STORAGE_WEEKLY_DIR}" \
  "${CONFIG_DAILY_DIR}" "${CONFIG_WEEKLY_DIR}" \
  "${MANIFEST_DIR}"

POSTGRES_BACKUP="${POSTGRES_DAILY_DIR}/postgres_${STAMP}.sql.gz"
STORAGE_BACKUP="${STORAGE_DAILY_DIR}/storage_${STAMP}.tar.gz"
CONFIG_BACKUP="${CONFIG_DAILY_DIR}/config_${STAMP}.tar.gz"
MANIFEST_FILE="${MANIFEST_DIR}/backup_${STAMP}.txt"

log "Creating deployment backup ${STAMP}"

compose up -d postgres >/dev/null
wait_for_service postgres 60 2

compose exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip -c > "${POSTGRES_BACKUP}"

if [[ -d "${APP_STORAGE_ROOT}" ]]; then
  tar -C "$(dirname "${APP_STORAGE_ROOT}")" -czf "${STORAGE_BACKUP}" "$(basename "${APP_STORAGE_ROOT}")"
else
  log "Storage root not found, creating empty archive marker: ${APP_STORAGE_ROOT}"
  mkdir -p "${APP_STORAGE_ROOT}"
  tar -C "$(dirname "${APP_STORAGE_ROOT}")" -czf "${STORAGE_BACKUP}" "$(basename "${APP_STORAGE_ROOT}")"
fi

TMP_CONFIG_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_CONFIG_DIR}"' EXIT

mkdir -p "${TMP_CONFIG_DIR}/config"
cp "${ENV_FILE}" "${TMP_CONFIG_DIR}/config/.env.prod"

if [[ -f "${AI_PROVIDER_TOML_PATH}" ]]; then
  cp "${AI_PROVIDER_TOML_PATH}" "${TMP_CONFIG_DIR}/config/ai_provider.toml"
fi

if [[ -f "${APP_CONFIG_ROOT}/stripe_price_ids.local.json" ]]; then
  cp "${APP_CONFIG_ROOT}/stripe_price_ids.local.json" "${TMP_CONFIG_DIR}/config/stripe_price_ids.local.json"
fi

tar -C "${TMP_CONFIG_DIR}" -czf "${CONFIG_BACKUP}" .

cat > "${MANIFEST_FILE}" <<EOF
stamp=${STAMP}
created_at=$(date -Is)
git_ref=$(current_git_ref)
postgres_backup=${POSTGRES_BACKUP}
storage_backup=${STORAGE_BACKUP}
config_backup=${CONFIG_BACKUP}
EOF

if [[ "$(date +%u)" == "7" ]]; then
  cp "${POSTGRES_BACKUP}" "${POSTGRES_WEEKLY_DIR}/"
  cp "${STORAGE_BACKUP}" "${STORAGE_WEEKLY_DIR}/"
  cp "${CONFIG_BACKUP}" "${CONFIG_WEEKLY_DIR}/"
fi

find "${POSTGRES_DAILY_DIR}" -type f -mtime +"${BACKUP_DAILY_RETENTION_DAYS}" -delete
find "${STORAGE_DAILY_DIR}" -type f -mtime +"${BACKUP_DAILY_RETENTION_DAYS}" -delete
find "${CONFIG_DAILY_DIR}" -type f -mtime +"${BACKUP_DAILY_RETENTION_DAYS}" -delete
find "${POSTGRES_WEEKLY_DIR}" -type f -mtime +"${BACKUP_WEEKLY_RETENTION_DAYS}" -delete
find "${STORAGE_WEEKLY_DIR}" -type f -mtime +"${BACKUP_WEEKLY_RETENTION_DAYS}" -delete
find "${CONFIG_WEEKLY_DIR}" -type f -mtime +"${BACKUP_WEEKLY_RETENTION_DAYS}" -delete
find "${MANIFEST_DIR}" -type f -mtime +"${BACKUP_WEEKLY_RETENTION_DAYS}" -delete

log "Backup completed: ${STAMP}"
if [[ "${QUIET}" -eq 1 ]]; then
  printf '%s\n' "${STAMP}"
else
  printf 'Backup stamp: %s\n' "${STAMP}"
fi
