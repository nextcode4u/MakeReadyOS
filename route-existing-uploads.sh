#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/route-existing-uploads-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

usage() {
  echo "Usage: ./route-existing-uploads.sh [--apply] [--property-id PROPERTY_ID]"
  echo
  echo "Dry-run is the default. This reorganizes existing root-level upload files into"
  echo "configured per-property upload subfolders and updates database storedName values."
  echo "Run after enabling property upload routing in Admin > Storage."
}

validate_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --apply)
        ;;
      --property-id)
        shift
        if [ "${1:-}" = "" ]; then
          echo "ERROR: --property-id requires a value"
          return 2
        fi
        ;;
      -h|--help)
        usage
        return 0
        ;;
      -*)
        echo "ERROR: unknown option: $1"
        usage
        return 2
        ;;
    esac
    shift
  done
}

run_route() {
  if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    usage
    return 0
  fi
  validate_args "$@" || return "$?"
  local apply="false"
  for arg in "$@"; do
    if [ "$arg" = "--apply" ]; then
      apply="true"
    fi
  done

  cd "$ROOT_DIR"
  if [ -f .env ]; then
    set -a
    . ./.env
    set +a
  elif [ -f .env.example ]; then
    set -a
    . ./.env.example
    set +a
  fi

  echo "Existing upload route migration started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Mode: $([ "$apply" = "true" ] && echo "apply" || echo "dry-run")"
  echo "Upload source: ${UPLOADS_HOST_PATH:-uploads_data}"
  echo

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed"
    return 1
  fi

  echo "Validating Docker Compose configuration"
  docker compose config >/dev/null

  echo "Ensuring API service is running"
  docker compose up -d api

  echo "Applying database migrations before reading upload metadata"
  docker compose exec -T api npm run db:deploy

  if [ "$apply" = "true" ]; then
    echo "Backing up uploads before applying route migration"
    ./backup-uploads.sh
  fi

  echo "Running route migration inside API container"
  docker compose exec -T api npm run uploads:route-existing -- "$@"
}

set +e
run_route "$@" 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Existing upload route migration log written to $LOG_FILE"
exit "$STATUS"
