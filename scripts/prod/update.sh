#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENV_FILE_ARG=""
PASS_THROUGH_ARGS=()

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/prod/update.sh [--env-file /opt/listinglive/config/.env.prod] [deploy args...]

Examples:
  bash ./scripts/prod/update.sh
  bash ./scripts/prod/update.sh --skip-backup
  bash ./scripts/prod/update.sh --ref <git-ref>

Notes:
  - Defaults to LISTINGLIVE_ENV_FILE or /opt/listinglive/config/.env.prod
  - Remaining arguments are passed through to deploy.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE_ARG="${2:-}"
      [[ -n "${ENV_FILE_ARG}" ]] || { echo "Missing value for --env-file" >&2; exit 1; }
      shift 2
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      PASS_THROUGH_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -n "${ENV_FILE_ARG}" ]]; then
  export LISTINGLIVE_ENV_FILE="${ENV_FILE_ARG}"
fi

exec "${SCRIPT_DIR}/deploy.sh" "${PASS_THROUGH_ARGS[@]}"
