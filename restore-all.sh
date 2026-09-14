#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/restore-all-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

run_restore() {
  if [ "$#" -ne 2 ]; then
    echo "ERROR: both a database dump and upload archive are required"
    echo "Usage: ./restore-all.sh backups/makereadyos-db-YYYYMMDD-HHMMSS.dump backups/makereadyos-uploads-YYYYMMDD-HHMMSS.tgz"
    return 2
  fi

  local db_backup="$1"
  local upload_backup="$2"

  echo "Full MakeReadyOS restore requested: $(date -Iseconds)"
  echo "Database dump: $db_backup"
  echo "Upload archive: $upload_backup"
  echo
  echo "This runs the destructive database restore first and then restores upload bytes."
  echo "Use matching backup timestamps whenever possible."
  echo

  "$ROOT_DIR/restore-db.sh" "$db_backup"
  echo
  "$ROOT_DIR/restore-uploads.sh" "$upload_backup"
  echo

  echo "Full MakeReadyOS restore completed: $(date -Iseconds)"
}

set +e
# The logging parent collects errors; the worker must still stop on failure.
(
  set -e
  run_restore "$@"
) 2>&1 | tee "$LOG_FILE"
PIPE_STATUSES=("${PIPESTATUS[@]}")
STATUS="${PIPE_STATUSES[0]}"
if [ "$STATUS" -eq 0 ]; then STATUS="${PIPE_STATUSES[1]}"; fi
set -e
echo "Restore log written to $LOG_FILE"
exit "$STATUS"
