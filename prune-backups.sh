#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAFE_BACKUP_DIR="$ROOT_DIR/backups"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/prune-backups-$TIMESTAMP.txt"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_DIR="$SAFE_BACKUP_DIR"
DRY_RUN=false

usage() {
  echo "Usage: ./prune-backups.sh [--dry-run] [--days DAYS] [--backup-dir PATH]"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --days)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --days requires a value"
        usage
        exit 2
      fi
      RETENTION_DAYS="$2"
      shift 2
      ;;
    --backup-dir)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --backup-dir requires a value"
        usage
        exit 2
      fi
      BACKUP_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1"
      usage
      exit 2
      ;;
  esac
done

mkdir -p "$LOG_DIR"
if [ -e "$LOG_FILE" ]; then
  LOG_FILE="$LOG_DIR/prune-backups-$TIMESTAMP-$$.txt"
fi

run_prune() {
  if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$RETENTION_DAYS" -lt 1 ]; then
    echo "ERROR: retention days must be a positive whole number"
    return 2
  fi

  mkdir -p "$SAFE_BACKUP_DIR"

  local safe_dir requested_dir
  safe_dir="$(realpath -m "$SAFE_BACKUP_DIR")"
  requested_dir="$(realpath -m "$BACKUP_DIR")"
  if [ -L "$SAFE_BACKUP_DIR" ] || [ "$safe_dir" != "$SAFE_BACKUP_DIR" ] || [ "$requested_dir" != "$safe_dir" ]; then
    echo "ERROR: refusing unsafe backup path: $BACKUP_DIR"
    echo "Allowed backup path: $SAFE_BACKUP_DIR"
    return 2
  fi

  echo "Backup prune started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Backup directory: $safe_dir"
  echo "Retention days: $RETENTION_DAYS"
  echo "Mode: $([ "$DRY_RUN" = true ] && echo "dry-run" || echo "delete")"
  echo

  local count=0
  while IFS= read -r -d '' backup_file; do
    count=$((count + 1))
    if [ "$DRY_RUN" = true ]; then
      echo "Would delete: $backup_file"
    else
      if ! rm -f -- "$backup_file"; then
        echo "ERROR: failed to delete expired backup: $backup_file"
        return 1
      fi
      echo "Deleted: $backup_file"
    fi
  done < <(find "$safe_dir" -maxdepth 1 -type f -name 'makereadyos-db-*.dump' ! -newermt "$RETENTION_DAYS days ago" -print0)

  if [ "$count" -eq 0 ]; then
    echo "No expired database backups found."
  fi
  echo
  echo "Backup prune completed: $(date -Iseconds)"
  echo "Expired files matched: $count"
}

set +e
run_prune 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Prune log written to $LOG_FILE"
exit "$STATUS"
