#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/webhooks-run-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

run_webhooks() {
  cd "$ROOT_DIR"

  if [ -f .env ]; then
    set -a
    . ./.env
    set +a
  elif [ -f .env.example ]; then
    set -a
    . ./.env.example
    set +a
  else
    echo "ERROR: .env or .env.example is required for Docker Compose configuration"
    return 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed"
    return 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "ERROR: curl is required for API readiness checks"
    return 1
  fi

  echo "Webhook delivery run started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Batch size: ${WEBHOOK_DELIVERY_BATCH_SIZE:-25}"
  echo "Timeout ms: ${WEBHOOK_DELIVERY_TIMEOUT_MS:-5000}"
  echo "Max attempts: ${WEBHOOK_DELIVERY_MAX_ATTEMPTS:-5}"
  docker compose config --quiet

  if ! docker compose ps --status running api | grep -q "api"; then
    echo "Starting database and API containers"
    docker compose up -d db api
  fi

  echo "Waiting for API readiness"
  for _ in $(seq 1 30); do
    if curl -fsS "http://localhost:${API_PORT:-4000}/health" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  if ! curl -fsS "http://localhost:${API_PORT:-4000}/health" >/dev/null 2>&1; then
    echo "ERROR: API did not become healthy before webhook delivery"
    return 1
  fi

  docker compose exec -T api node dist/runWebhookDeliveries.js
  echo "Webhook delivery run completed: $(date -Iseconds)"
}

set +e
run_webhooks 2>&1 | tee "$LOG_FILE"
STATUS=${PIPESTATUS[0]}
set -e

echo "Webhook delivery log written to $LOG_FILE"
exit "$STATUS"
