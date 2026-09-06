#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/build-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

{
  echo "Build started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Root: $ROOT_DIR"
  echo

  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node is not installed"
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm is not installed"
    exit 1
  fi

  NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]')"
  if [ "$NODE_MAJOR" -ne 24 ]; then
    echo "ERROR: Node 24 LTS is required"
    exit 1
  fi

  echo "Node: $(node --version)"
  echo "NPM: $(npm --version)"
  echo

  echo "Installing root dependencies"
  npm ci
  echo

  echo "Installing API dependencies"
  npm --prefix apps/api ci
  echo

  echo "Installing web dependencies"
  npm --prefix apps/web ci
  echo

  echo "Generating Prisma client"
  npm --prefix apps/api run db:generate
  echo

  echo "Building API"
  npm --prefix apps/api run build
  echo

  echo "Building web"
  npm --prefix apps/web run build
  echo

  echo "Build completed: $(date -Iseconds)"
} 2>&1 | tee "$LOG_FILE"

echo "Build log written to $LOG_FILE"
