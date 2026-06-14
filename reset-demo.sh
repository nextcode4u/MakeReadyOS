#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/reset-demo-$TIMESTAMP.txt"
mkdir -p "$LOG_DIR"

YES=false
DRY_RUN=false
WIPE_UPLOADS=false
WITH_DEMO=false

usage() {
  cat <<'USAGE'
Usage: ./reset-demo.sh [--dry-run] [--yes] [--wipe-uploads] [--with-demo]

Resets the local Docker demo database volume and starts the stack again.

Options:
  --dry-run       Show planned actions without changing Docker volumes.
  --yes           Required for destructive reset.
  --wipe-uploads  Also remove the Docker uploads volume. Omit to preserve local attachments.
  --with-demo      Seed sample properties, units, and make-ready turns after reset.
  --help          Show this help.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --yes) YES=true ;;
    --wipe-uploads) WIPE_UPLOADS=true ;;
    --with-demo) WITH_DEMO=true ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

{
  echo "MakeReadyOS demo reset"
  echo "Timestamp: $TIMESTAMP"
  echo "Root: $ROOT_DIR"
  echo "Dry run: $DRY_RUN"
  echo "Wipe uploads: $WIPE_UPLOADS"
  echo "With demo data: $WITH_DEMO"
  echo

  if [ "$DRY_RUN" != "true" ] && [ "$YES" != "true" ]; then
    echo "ERROR: reset-demo.sh is destructive and requires --yes."
    echo "Run ./reset-demo.sh --dry-run first to inspect the planned reset."
    exit 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is required for demo reset."
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: docker compose is required for demo reset."
    exit 1
  fi

  COMPOSE_ENV_ARGS=()
  if [ -f "$ROOT_DIR/.env" ]; then
    COMPOSE_ENV_ARGS+=(--env-file "$ROOT_DIR/.env")
  elif [ -f "$ROOT_DIR/.env.example" ]; then
    COMPOSE_ENV_ARGS+=(--env-file "$ROOT_DIR/.env.example")
  fi

  if [ "$WITH_DEMO" = "true" ]; then
    export SEED_DEMO_DATA=true
  else
    export SEED_DEMO_DATA=false
  fi

  PROJECT_NAME="$(docker compose "${COMPOSE_ENV_ARGS[@]}" config | awk '/^name:/ { print $2; exit }')"
  if [ -z "$PROJECT_NAME" ]; then
    PROJECT_NAME="$(basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]')"
  fi

  DB_VOLUME="${PROJECT_NAME}_postgres_data"
  UPLOAD_VOLUME="${PROJECT_NAME}_uploads_data"

  echo "Compose project: $PROJECT_NAME"
  echo "Database volume: $DB_VOLUME"
  echo "Uploads volume: $UPLOAD_VOLUME"
  echo
  echo "Planned actions:"
  echo "- docker compose ${COMPOSE_ENV_ARGS[*]} down"
  echo "- docker volume rm $DB_VOLUME"
  if [ "$WIPE_UPLOADS" = "true" ]; then
    echo "- docker volume rm $UPLOAD_VOLUME"
  else
    echo "- preserve uploads volume"
  fi
  echo "- SEED_DEMO_DATA=$SEED_DEMO_DATA docker compose ${COMPOSE_ENV_ARGS[*]} up --build -d"
  echo

  if [ "$DRY_RUN" = "true" ]; then
    echo "Dry run complete. No data changed."
    exit 0
  fi

  docker compose "${COMPOSE_ENV_ARGS[@]}" down
  docker volume rm "$DB_VOLUME" >/dev/null 2>&1 || echo "Database volume did not exist or was already removed."
  if [ "$WIPE_UPLOADS" = "true" ]; then
    docker volume rm "$UPLOAD_VOLUME" >/dev/null 2>&1 || echo "Uploads volume did not exist or was already removed."
  fi
  docker compose "${COMPOSE_ENV_ARGS[@]}" up --build -d
  echo
  echo "Demo reset complete."
} 2>&1 | tee "$LOG_FILE"
