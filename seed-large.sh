#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/seed-large-$TIMESTAMP.txt"
COUNT="${LARGE_SEED_COUNT:-250}"
PREFIX="${LARGE_SEED_PREFIX:-LOAD}"

mkdir -p "$LOG_DIR"
cd "$ROOT_DIR"

{
  echo "Large seed started: $(date -Iseconds)"
  echo "Count: $COUNT"
  echo "Prefix: $PREFIX"
  if ! docker compose ps --status running api | grep -q "api"; then
    echo "ERROR: the Docker Compose API service must be running before large seed generation"
    exit 1
  fi
  docker compose exec -T -e LARGE_SEED_COUNT="$COUNT" -e LARGE_SEED_PREFIX="$PREFIX" api npm run seed:large
  echo "Large seed finished: $(date -Iseconds)"
} 2>&1 | tee "$LOG_FILE"
