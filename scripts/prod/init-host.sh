#!/usr/bin/env bash

set -Eeuo pipefail

APP_ROOT="${LISTINGLIVE_APP_ROOT:-/opt/listinglive}"
APP_DIR="${APP_ROOT}/app"
CONFIG_DIR="${APP_ROOT}/config"
DATA_DIR="${APP_ROOT}/data/storage"
BACKUP_DIR="${APP_ROOT}/backups"
LOG_DIR="${APP_ROOT}/logs"
REPO_URL="${LISTINGLIVE_REPO_URL:-https://github.com/devB2433/listinglive.git}"
REPO_BRANCH="${LISTINGLIVE_REPO_BRANCH:-main}"
RUN_AS_USER="${SUDO_USER:-${USER}}"

log() {
  printf '[listinglive-init] %s\n' "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || fail "Run this script with sudo/root."
}

install_base_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git rsync gnupg lsb-release
}

install_docker_if_missing() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker already installed."
    return
  fi

  log "Installing Docker via official convenience script."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
}

enable_docker() {
  systemctl enable --now docker
  usermod -aG docker "${RUN_AS_USER}" || true
}

prepare_directories() {
  mkdir -p "${APP_DIR}" "${CONFIG_DIR}" "${DATA_DIR}" "${BACKUP_DIR}" "${LOG_DIR}"
  chown -R "${RUN_AS_USER}:${RUN_AS_USER}" "${APP_ROOT}"
}

sync_repository() {
  if [[ -d "${APP_DIR}/.git" ]]; then
    log "Repository already exists. Fetching latest refs."
    sudo -u "${RUN_AS_USER}" git -C "${APP_DIR}" fetch origin
    sudo -u "${RUN_AS_USER}" git -C "${APP_DIR}" checkout "${REPO_BRANCH}"
    sudo -u "${RUN_AS_USER}" git -C "${APP_DIR}" pull --ff-only origin "${REPO_BRANCH}"
    return
  fi

  if [[ -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    fail "Target app directory is not empty: ${APP_DIR}"
  fi

  log "Cloning repository ${REPO_URL} (${REPO_BRANCH})"
  rm -rf "${APP_DIR}"
  sudo -u "${RUN_AS_USER}" git clone --branch "${REPO_BRANCH}" "${REPO_URL}" "${APP_DIR}"
}

prepare_runtime_files() {
  chmod +x "${APP_DIR}"/scripts/prod/*.sh

  if [[ ! -f "${CONFIG_DIR}/.env.prod" ]]; then
    cp "${APP_DIR}/.env.prod.example" "${CONFIG_DIR}/.env.prod"
    chown "${RUN_AS_USER}:${RUN_AS_USER}" "${CONFIG_DIR}/.env.prod"
    log "Created ${CONFIG_DIR}/.env.prod from example."
  fi

  if [[ ! -f "${CONFIG_DIR}/ai_provider.toml" ]]; then
    cp "${APP_DIR}/config/ai_provider.toml.example" "${CONFIG_DIR}/ai_provider.toml"
    chown "${RUN_AS_USER}:${RUN_AS_USER}" "${CONFIG_DIR}/ai_provider.toml"
    log "Created ${CONFIG_DIR}/ai_provider.toml from example."
  fi
}

install_backup_timer() {
  cp "${APP_DIR}/deploy/systemd/listinglive-backup.service" /etc/systemd/system/listinglive-backup.service
  cp "${APP_DIR}/deploy/systemd/listinglive-backup.timer" /etc/systemd/system/listinglive-backup.timer
  systemctl daemon-reload
  systemctl enable --now listinglive-backup.timer
}

print_next_steps() {
  cat <<EOF

ListingLive host initialization completed.

Next steps:
1. Edit ${CONFIG_DIR}/.env.prod
2. Edit ${CONFIG_DIR}/ai_provider.toml
3. Fill production values for:
   - domain and CORS
   - PostgreSQL password / DATABASE_URL
   - Stripe keys and webhook secret
   - SMTP host / username / password
4. Configure your WAF to forward 443 traffic to this VM on port 3001
5. Deploy:
   cd ${APP_DIR}
   LISTINGLIVE_ENV_FILE=${CONFIG_DIR}/.env.prod ./scripts/prod/deploy.sh

Important:
- Docker group membership for ${RUN_AS_USER} may require a new login session.
- Backups are already scheduled via systemd timer: listinglive-backup.timer
EOF
}

main() {
  require_root
  install_base_packages
  install_docker_if_missing
  enable_docker
  prepare_directories
  sync_repository
  prepare_runtime_files
  install_backup_timer
  print_next_steps
}

main "$@"
