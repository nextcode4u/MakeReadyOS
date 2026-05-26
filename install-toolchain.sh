#!/usr/bin/env bash
set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer currently supports apt-based environments only."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y curl ca-certificates gnupg

if ! command -v node >/dev/null 2>&1; then
  apt-get install -y nodejs npm
fi

if ! command -v npm >/dev/null 2>&1; then
  apt-get install -y npm
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  npm install -g n
  n 20.19.5
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io docker-compose-v2
fi

echo "Node: $(/usr/local/bin/node --version 2>/dev/null || node --version)"
echo "NPM: $(/usr/local/bin/npm --version 2>/dev/null || npm --version)"
echo "Docker: $(docker --version)"
echo "Docker Compose: $(docker compose version)"
