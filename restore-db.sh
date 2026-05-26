#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/restore-db-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

run_restore() {
  if [ "$#" -ne 1 ]; then
    echo "ERROR: a PostgreSQL backup file path is required"
    echo "Usage: ./restore-db.sh backups/makereadyos-db-YYYYMMDD-HHMMSS.dump"
    return 2
  fi

  local backup_file="$1"
  if [ ! -r "$backup_file" ]; then
    echo "ERROR: backup file is not readable: $backup_file"
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

  POSTGRES_DB="${POSTGRES_DB:-makereadyos}"
  POSTGRES_USER="${POSTGRES_USER:-makeready}"

  echo "Database restore requested: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Source: $backup_file"
  echo "Target database: $POSTGRES_DB"
  echo

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed"
    return 1
  fi

  if [[ ! "$POSTGRES_DB" =~ ^[A-Za-z0-9_]+$ ]] || [[ ! "$POSTGRES_USER" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "ERROR: POSTGRES_DB and POSTGRES_USER must contain only letters, numbers, and underscores"
    return 1
  fi

  if [ "$POSTGRES_DB" = "postgres" ] || [ "$POSTGRES_DB" = "template0" ] || [ "$POSTGRES_DB" = "template1" ]; then
    echo "ERROR: refusing to replace PostgreSQL maintenance database: $POSTGRES_DB"
    return 1
  fi

  echo "Validating Docker Compose configuration"
  docker compose config >/dev/null
  echo "Ensuring the PostgreSQL service is running for backup inspection"
  docker compose up -d db

  local restore_format
  if docker compose exec -T db pg_restore --list < "$backup_file" >/dev/null 2>&1; then
    restore_format="custom"
  elif head -n 30 "$backup_file" | grep -Eq '^-- PostgreSQL database dump|^SET '; then
    restore_format="sql"
  else
    echo "ERROR: backup is not a recognized PostgreSQL custom dump or plain SQL dump"
    return 1
  fi
  echo "Detected backup format: $restore_format"
  echo
  echo "WARNING: THIS OPERATION IS DESTRUCTIVE."
  echo "WARNING: The current '$POSTGRES_DB' database will be dropped and recreated."
  echo "WARNING: Current MakeReadyOS sessions, users, audit history, and all operational data will be replaced."
  echo "WARNING: API and web services will be stopped during restore."
  echo
  read -r -p "Type RESTORE to continue: " confirmation
  if [ "$confirmation" != "RESTORE" ]; then
    echo "Restore cancelled. No database changes were made."
    return 1
  fi

  echo "Stopping application services"
  docker compose stop api web >/dev/null

  echo "Waiting for PostgreSQL readiness"
  docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d postgres

  echo "Dropping and recreating database '$POSTGRES_DB'"
  docker compose exec -T db dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB"
  docker compose exec -T db createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"

  if [ "$restore_format" = "custom" ]; then
    echo "Restoring custom-format dump with pg_restore"
    docker compose exec -T db pg_restore \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      --exit-on-error \
      --no-owner \
      --no-acl \
      < "$backup_file"
  else
    echo "Restoring plain SQL dump with psql"
    docker compose exec -T db psql \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -v ON_ERROR_STOP=1 \
      < "$backup_file"
  fi

  echo "Restarting application services"
  docker compose up -d api web
  echo "Database restore completed: $(date -Iseconds)"
}

set +e
run_restore "$@" 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Restore log written to $LOG_FILE"
exit "$STATUS"
