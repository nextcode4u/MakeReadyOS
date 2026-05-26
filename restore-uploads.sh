#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/restore-uploads-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

run_restore() {
  if [ "$#" -ne 1 ]; then
    echo "ERROR: an upload backup archive path is required"
    echo "Usage: ./restore-uploads.sh backups/makereadyos-uploads-YYYYMMDD-HHMMSS.tgz"
    return 2
  fi

  local backup_file="$1"
  if [ ! -r "$backup_file" ]; then
    echo "ERROR: upload backup archive is not readable: $backup_file"
    return 2
  fi
  backup_file="$(cd "$(dirname "$backup_file")" && pwd)/$(basename "$backup_file")"

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
  if [ "$upload_dir" != "/app/uploads" ]; then
    echo "ERROR: refusing unsupported container upload path: $upload_dir"
    echo "Expected UPLOAD_DIR=/app/uploads for Docker Compose volume restores."
    return 1
  fi

  if ! tar -tzf "$backup_file" >/dev/null 2>&1; then
    echo "ERROR: upload backup is not a readable .tgz archive"
    return 1
  fi

  echo "Upload restore requested: $(date -Iseconds)"
  echo "Source: $backup_file"
  echo "Container upload path: $upload_dir"
  echo
  echo "WARNING: THIS OPERATION REPLACES LOCAL UPLOAD FILES."
  echo "WARNING: Existing attachments/photos/property map files in the upload volume will be removed."
  read -r -p "Type RESTORE_UPLOADS to continue: " confirmation
  if [ "$confirmation" != "RESTORE_UPLOADS" ]; then
    echo "Restore cancelled. No upload files were changed."
    return 1
  fi

  docker compose config >/dev/null
  docker compose up -d api

  echo "Clearing upload directory"
  docker compose exec -T api sh -c "rm -rf '$upload_dir'/* '$upload_dir'/.??* 2>/dev/null || true; mkdir -p '$upload_dir'"

  echo "Restoring upload archive"
  docker compose exec -T api tar -C "$upload_dir" -xzf - < "$backup_file"
  echo "Upload restore completed: $(date -Iseconds)"
}

set +e
run_restore "$@" 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Upload restore log written to $LOG_FILE"
exit "$STATUS"
