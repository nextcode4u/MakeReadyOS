#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/move-uploads-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

usage() {
  echo "Usage: ./move-uploads.sh /absolute/host/upload/path [--dry-run] [--merge]"
  echo
  echo "Copies the current Docker upload volume contents into a host/NAS path."
  echo "After a successful copy, set UPLOADS_HOST_PATH to that path in .env and restart Compose."
}

refuse_unsafe_host_path() {
  local target="$1"
  case "$target" in
    ""|"/"|"/tmp"|"/var/tmp"|"/root"|"/home"|"/mnt"|"/media"|"/srv"|"$ROOT_DIR"|"$ROOT_DIR/"*)
      echo "ERROR: refusing unsafe or overly broad upload target: $target"
      echo "Use a dedicated directory such as /mnt/storage/makereadyos-uploads."
      return 1
      ;;
  esac
  if [[ "$target" != /* ]]; then
    echo "ERROR: upload target must be an absolute host path"
    return 1
  fi
}

validate_container_upload_dir() {
  local upload_dir="$1"
  if [[ "$upload_dir" != /* ]] || [[ "$upload_dir" == "/" ]] || [[ "$upload_dir" == "/app" ]] || [[ "$upload_dir" == *"'"* ]]; then
    echo "ERROR: refusing unsafe container upload path: $upload_dir"
    return 1
  fi
}

run_move() {
  local target=""
  local dry_run="false"
  local merge="false"

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dry-run)
        dry_run="true"
        ;;
      --merge)
        merge="true"
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
      *)
        if [ -n "$target" ]; then
          echo "ERROR: only one target path is supported"
          usage
          return 2
        fi
        target="$1"
        ;;
    esac
    shift
  done

  if [ -z "$target" ]; then
    echo "ERROR: a target upload path is required"
    usage
    return 2
  fi

  target="$(realpath -m "$target")"
  refuse_unsafe_host_path "$target" || return 1

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

  local upload_dir="${UPLOAD_DIR:-/app/uploads}"
  validate_container_upload_dir "$upload_dir" || return 1

  echo "Upload storage move started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Container upload path: $upload_dir"
  echo "Current host upload source: ${UPLOADS_HOST_PATH:-uploads_data}"
  echo "Target host path: $target"
  echo "Dry run: $dry_run"
  echo "Merge into non-empty target: $merge"
  echo

  if [ "$dry_run" = "true" ]; then
    echo "Dry run complete. No files were copied."
    echo "Next step after a real run: set UPLOADS_HOST_PATH=$target in .env and run docker compose up -d."
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed"
    return 1
  fi

  mkdir -p "$target"
  if [ ! -d "$target" ] || [ ! -w "$target" ]; then
    echo "ERROR: target path is not writable: $target"
    return 1
  fi
  if [ "$merge" != "true" ] && find "$target" -mindepth 1 -print -quit | grep -q .; then
    echo "ERROR: target path is not empty. Re-run with --merge if you intentionally want to merge files."
    return 1
  fi

  echo "Validating Docker Compose configuration"
  docker compose config >/dev/null

  echo "Ensuring API service is running"
  docker compose up -d api

  echo "Backing up current upload volume before copy"
  ./backup-uploads.sh

  echo "Copying upload bytes into target path"
  docker compose exec -T api sh -c "mkdir -p '$upload_dir' && tar -C '$upload_dir' -czf - ." | tar -C "$target" -xzf -

  echo
  echo "Upload storage copy completed: $(date -Iseconds)"
  echo "Copied to: $target"
  echo
  echo "Manual activation steps:"
  echo "1. Set UPLOADS_HOST_PATH=$target in .env"
  echo "2. Keep UPLOAD_DIR=/app/uploads"
  echo "3. Run docker compose up -d"
  echo "4. Verify existing attachments and map files still open"
}

set +e
run_move "$@" 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Upload storage move log written to $LOG_FILE"
exit "$STATUS"
