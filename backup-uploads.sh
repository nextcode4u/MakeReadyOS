#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/makereadyos-uploads-$TIMESTAMP.tgz"
LOG_FILE="$LOG_DIR/backup-uploads-$TIMESTAMP.txt"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

validate_container_upload_dir() {
  local upload_dir="$1"
  if [[ "$upload_dir" != /* ]] || [[ "$upload_dir" == "/" ]] || [[ "$upload_dir" == "/app" ]] || [[ "$upload_dir" == *"'"* ]]; then
    echo "ERROR: refusing unsafe container upload path: $upload_dir"
    echo "Use UPLOAD_DIR=/app/uploads unless you have also reviewed the backup/restore scripts."
    return 1
  fi
}

run_backup() {
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

  echo "Upload backup started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Container upload path: $upload_dir"
  echo "Host upload source: ${UPLOADS_HOST_PATH:-uploads_data}"
  echo "Destination: $BACKUP_FILE"
  echo

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed"
    return 1
  fi

  echo "Validating Docker Compose configuration"
  docker compose config >/dev/null

  echo "Ensuring API service is running"
  docker compose up -d api

  echo "Creating upload archive"
  if ! docker compose exec -T api sh -c "mkdir -p '$upload_dir' && tar -C '$upload_dir' -czf - ." > "$BACKUP_FILE"; then
    rm -f "$BACKUP_FILE"
    echo "ERROR: upload backup failed"
    return 1
  fi

  echo "Backup size: $(du -h "$BACKUP_FILE" | awk '{print $1}')"
  echo "Upload backup completed: $(date -Iseconds)"
  echo "Backup file: $BACKUP_FILE"
}

set +e
run_backup 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Upload backup log written to $LOG_FILE"
exit "$STATUS"
