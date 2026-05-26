#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/makereadyos-db-$TIMESTAMP.dump"
LOG_FILE="$LOG_DIR/backup-db-$TIMESTAMP.txt"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

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

  POSTGRES_DB="${POSTGRES_DB:-makereadyos}"
  POSTGRES_USER="${POSTGRES_USER:-makeready}"

  echo "Database backup started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Database: $POSTGRES_DB"
  echo "Destination: $BACKUP_FILE"
  echo

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed"
    return 1
  fi

  if [[ ! "$POSTGRES_DB" =~ ^[A-Za-z0-9_]+$ ]] || [[ ! "$POSTGRES_USER" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "ERROR: POSTGRES_DB and POSTGRES_USER must contain only letters, numbers, and underscores"
    return 1
  fi

  echo "Validating Docker Compose configuration"
  docker compose config >/dev/null

  echo "Ensuring the PostgreSQL service is running"
  docker compose up -d db

  echo "Waiting for PostgreSQL readiness"
  for _ in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

  echo "Writing PostgreSQL custom-format dump"
  if ! docker compose exec -T db pg_dump \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --format=custom \
    --no-owner \
    --no-acl \
    > "$BACKUP_FILE"; then
    rm -f "$BACKUP_FILE"
    echo "ERROR: database backup failed"
    return 1
  fi

  echo "Backup size: $(du -h "$BACKUP_FILE" | awk '{print $1}')"
  echo "Database backup completed: $(date -Iseconds)"
  echo "Backup file: $BACKUP_FILE"

  if [ -n "${BACKUP_RETENTION_DAYS:-}" ]; then
    echo
    echo "Pruning expired local backups with retention: $BACKUP_RETENTION_DAYS days"
    if ! "$ROOT_DIR/prune-backups.sh" --days "$BACKUP_RETENTION_DAYS"; then
      echo "ERROR: backup was created, but backup retention pruning failed"
      return 1
    fi
  fi
}

set +e
run_backup 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Backup log written to $LOG_FILE"
exit "$STATUS"
