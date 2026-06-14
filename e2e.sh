#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/e2e-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

{
  echo "E2E run started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo

  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node is not installed"
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm is not installed"
    exit 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed"
    exit 1
  fi

  NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]')"
  if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "ERROR: Node 20+ is required"
    exit 1
  fi

  if [ -f .env ]; then
    set -a
    . ./.env
    set +a
  else
    set -a
    . ./.env.example
    set +a
  fi
  export SEED_DEMO_DATA=true

  echo "Node: $(node --version)"
  echo "NPM: $(npm --version)"
  echo

  echo "Installing Playwright browser runtime if needed"
  if [ "${PLAYWRIGHT_INSTALL_DEPS:-0}" = "1" ]; then
    npx playwright install --with-deps chromium
  else
    npx playwright install chromium
  fi
  echo

  echo "Resetting docker compose stack for clean browser tests"
  docker compose down -v >/dev/null 2>&1 || true
  docker compose up --build -d
  echo

  echo "Waiting for API readiness"
  for _ in $(seq 1 45); do
    if curl -fsS "http://127.0.0.1:${API_PORT:-4000}/health" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  curl -fsS "http://127.0.0.1:${API_PORT:-4000}/health"
  echo
  echo

  echo "Waiting for web readiness"
  for _ in $(seq 1 45); do
    if curl -fsS "http://127.0.0.1:${WEB_PORT:-8080}/" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  curl -fsS "http://127.0.0.1:${WEB_PORT:-8080}/" >/dev/null
  echo "Web is ready"
  echo

  export E2E_BASE_URL="http://localhost:${WEB_PORT:-8080}"
  export ADMIN_EMAIL
  export ADMIN_PASSWORD
  export DEMO_TECH_EMAIL
  export DEMO_TECH_PASSWORD

  echo "Running Playwright tests"
  npx playwright test
  echo

  echo "E2E run completed: $(date -Iseconds)"
  echo "E2E log written to $LOG_FILE"
} | tee "$LOG_FILE"
