#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/migration-hygiene-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

usage() {
  echo "Usage: ./check-migration-hygiene.sh [--strict] [--skip-start]"
  echo
  echo "Runs non-destructive Prisma migration checks against the current Docker Compose database."
  echo "This helper does not create, apply, or reset migrations."
  echo
  echo "Options:"
  echo "  --strict      Return non-zero when Prisma reports pending drift/history issues."
  echo "  --skip-start  Do not start db/api containers automatically before checking."
}

run_check() {
  local strict="false"
  local skip_start="false"

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --strict)
        strict="true"
        ;;
      --skip-start)
        skip_start="true"
        ;;
      -h|--help)
        usage
        return 0
        ;;
      *)
        echo "ERROR: unknown option: $1"
        usage
        return 2
        ;;
    esac
    shift
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

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed"
    return 1
  fi

  echo "Migration hygiene check started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Strict mode: $strict"
  echo "Auto-start services: $([ "$skip_start" = "true" ] && echo "no" || echo "yes")"
  echo

  docker compose config --quiet

  if [ "$skip_start" != "true" ]; then
    echo "Ensuring database and API containers are running"
    docker compose up -d db api
  fi

  if ! docker compose ps --status running api | grep -q "api"; then
    echo "ERROR: api container is not running. Start the stack or omit --skip-start."
    return 1
  fi

  echo
  echo "Prisma migrate status"
  echo "---------------------"
  set +e
  docker compose exec -T api sh -lc 'cd /app && npx prisma migrate status --schema prisma/schema.prisma'
  local status_code=$?
  set -e
  echo

  echo "Prisma live DB vs schema diff"
  echo "-----------------------------"
  set +e
  docker compose exec -T api sh -lc 'cd /app && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code'
  local diff_code=$?
  set -e
  echo

  echo "Applied migration checksum audit"
  echo "-------------------------------"
  local checksum_output checksum_code
  local tmp_db tmp_fs
  tmp_db="$(mktemp)"
  tmp_fs="$(mktemp)"
  set +e
  docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -c "select migration_name, checksum from \"_prisma_migrations\" where finished_at is not null and rolled_back_at is null order by migration_name"' > "$tmp_db"
  local db_dump_code=$?
  if [ "$db_dump_code" -eq 0 ]; then
    find "$ROOT_DIR/apps/api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | while read -r dir; do
      name="$(basename "$dir")"
      if [ -f "$dir/migration.sql" ]; then
        checksum="$(sha256sum "$dir/migration.sql" | awk '{print $1}')"
        printf "%s|%s\n" "$name" "$checksum"
      fi
    done | sort > "$tmp_fs"
    checksum_output="$(
      awk -F '|' '
        NR==FNR { db[$1]=$2; next }
        {
          fs[$1]=$2
          if (!($1 in db)) next
          if (db[$1] != $2) {
            printf "CHECKSUM_MISMATCH %s db=%s local=%s\n", $1, db[$1], $2
            mismatch=1
          }
        }
        END {
          for (name in db) {
            if (!(name in fs)) {
              printf "MISSING_LOCAL %s db=%s\n", name, db[name]
              mismatch=1
            }
          }
          for (name in fs) {
            if (!(name in db)) {
              printf "UNAPPLIED_LOCAL %s local=%s\n", name, fs[name]
            }
          }
          exit mismatch ? 1 : 0
        }
      ' "$tmp_db" "$tmp_fs" 2>&1
    )"
    checksum_code=$?
  else
    checksum_output="Unable to query _prisma_migrations from the database container."
    checksum_code=1
  fi
  set -e
  rm -f "$tmp_db" "$tmp_fs"
  if [ -n "$checksum_output" ]; then
    printf "%s\n" "$checksum_output"
  else
    echo "No applied migration checksum mismatches detected."
  fi
  echo

  if [ "$status_code" -eq 0 ] && [ "$diff_code" -eq 0 ] && [ "$checksum_code" -eq 0 ]; then
    echo "Result: Prisma migration status is clean, the live database matches prisma/schema.prisma, and applied migration checksums match local files."
    echo "Next step for release rehearsal: run npm --prefix apps/api run db:deploy against a restored backup before tagging."
    return 0
  fi

  if [ "$status_code" -ne 0 ]; then
    echo "Result: Prisma reported migration drift, missing history, or another status failure."
  else
    echo "Result: Prisma migration history looks clean."
  fi

  if [ "$diff_code" -ne 0 ]; then
    echo "Result: The live database schema differs from prisma/schema.prisma or Prisma could not complete the schema diff."
  else
    echo "Result: The live database schema matches prisma/schema.prisma."
  fi

  if [ "$checksum_code" -ne 0 ]; then
    echo "Result: One or more applied migration files no longer match the checksums recorded in _prisma_migrations."
  else
    echo "Result: Applied migration file checksums match the database record."
  fi

  echo "Recommended cleanup sequence:"
  echo "1. Take fresh ./backup-db.sh and ./backup-uploads.sh archives."
  echo "2. Rehearse restore on a disposable copy."
  echo "3. Restore modified migration files from a known-good source or replace/reset the drifted local dev history."
  echo "4. Reset or replace drifted local dev volumes if needed."
  echo "5. Re-run ./check-migration-hygiene.sh --strict until history, schema diff, and checksums are clean."
  echo "6. Only then treat releases as migration-only (db:deploy without db:push fallback)."
  if [ "$strict" = "true" ]; then
    if [ "$status_code" -ne 0 ]; then
      return "$status_code"
    fi
    if [ "$diff_code" -ne 0 ]; then
      return "$diff_code"
    fi
    return "$checksum_code"
  fi

  echo "Non-strict mode is active, so this helper is reporting the issue without failing the run."
  return 0
}

set +e
run_check "$@" 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Migration hygiene log written to $LOG_FILE"
exit "$STATUS"
