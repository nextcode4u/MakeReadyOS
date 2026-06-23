#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/backup-all-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

run_backup() {
  cd "$ROOT_DIR"

  echo "Full MakeReadyOS backup started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Working directory: $ROOT_DIR"
  echo

  echo "Step 1/2: backing up PostgreSQL"
  "$ROOT_DIR/backup-db.sh"
  echo

  echo "Step 2/2: backing up upload bytes"
  "$ROOT_DIR/backup-uploads.sh"
  echo

  echo "Full MakeReadyOS backup completed: $(date -Iseconds)"
  echo "Review the latest files in:"
  echo "  $ROOT_DIR/backups/"
}

set +e
run_backup 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Backup log written to $LOG_FILE"
exit "$STATUS"
