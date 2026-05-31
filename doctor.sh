#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "MakeReadyOS doctor"
echo "Root: $ROOT_DIR"
echo

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

warn() {
  echo "WARN: $*" >&2
}

need_file() {
  [ -s "$1" ] || fail "missing required file: $1"
}

need_dir() {
  mkdir -p "$1"
  [ -d "$1" ] || fail "missing required directory: $1"
}

need_file README.md
need_file SECURITY.md
need_file SUPPORT.md
need_file docker-compose.yml
need_file apps/api/package.json
need_file apps/web/package.json
need_file apps/api/prisma/schema.prisma
need_file docs/ARCHITECTURE_INVENTORY.md
need_file docs/FEATURE_STATUS.md
need_file docs/ROADMAP.md
need_file docs/UX_DEBT.md
need_file docs/TECH_DEBT.md
need_file docs/RELEASE_CHECKLIST.md
need_file docs/API.md
need_file docs/API_SPEC_PLAN.md
need_file docs/ANALYTICS_AND_HISTORY.md
need_file docs/EXTENSIONS.md
need_file docs/WEBHOOK_DELIVERY_PLAN.md
need_file docs/WORKLOAD_PLANNING.md
need_file docs/PROPERTY_TEMPLATES.md
need_file docs/ONBOARDING.md
need_file docs/DEPLOYMENT.md
need_file docs/UPLOAD_STORAGE.md
need_file .github/ISSUE_TEMPLATE/bug_report.md
need_file .github/ISSUE_TEMPLATE/feature_request.md
need_file examples/api/curl/list-make-ready-items.sh
need_file examples/api/node/list-make-ready-items.mjs
need_file examples/operational-library/sample-library-pack.json

need_dir logs
need_dir backups

[ -w logs ] || fail "logs/ is not writable"
[ -w backups ] || fail "backups/ is not writable"
AVAILABLE_KB="$(df -Pk "$ROOT_DIR" | awk 'NR==2 { print $4 }')"
if [ "${AVAILABLE_KB:-0}" -lt 1048576 ]; then
  warn "less than 1GB free on the project filesystem; backups, uploads, and Docker images may fail"
fi

if [ ! -f .env ]; then
  warn ".env is missing; Docker Compose can run with exported .env.example values for tests, but real deployments should create .env"
fi

if ! command -v node >/dev/null 2>&1; then
  fail "node is not installed"
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node 20+ is required; found $(node --version)"
fi
echo "Node: $(node --version)"

if ! command -v npm >/dev/null 2>&1; then
  fail "npm is not installed"
fi
echo "NPM: $(npm --version)"

if ! command -v docker >/dev/null 2>&1; then
  warn "docker is not installed or not on PATH"
else
  echo "Docker: $(docker --version)"
fi

if docker compose version >/dev/null 2>&1; then
  echo "Docker Compose: $(docker compose version --short 2>/dev/null || docker compose version)"
else
  warn "docker compose is not available"
fi

for script in build.sh test.sh e2e.sh run-automations.sh run-analytics-snapshot.sh backup-db.sh restore-db.sh backup-uploads.sh restore-uploads.sh move-uploads.sh prune-backups.sh seed-large.sh reset-demo.sh; do
  [ -x "$script" ] || fail "$script is missing or not executable"
  bash -n "$script"
done

echo "Checking runtime source for reference/ imports"
if rg -n '(^|["'\''(])/?reference/' apps --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/*.map'; then
  fail "application runtime source must not reference reference/"
fi

if [ ! -s assets/fonts/opendyslexic/OFL.txt ]; then
  warn "OpenDyslexic license asset is missing"
fi
if [ ! -s assets/frogs/ponds/pond-03.png ] || [ ! -s assets/frogs/ponds/pond-15.png ] || [ ! -s assets/frogs/sprites/frog-green.png ] || [ ! -s assets/frogs/tadpoles/tadpole-1.png ] || [ ! -s assets/frogs/decor/fly.png ]; then
  warn "Frog Pond runtime assets are missing"
fi

if [ ! -d apps/api/prisma/migrations ] || ! find apps/api/prisma/migrations -mindepth 2 -name migration.sql -print -quit | grep -q migration.sql; then
  fail "Prisma migration files are missing"
fi
echo "Prisma migrations: present. For deployed updates run npm --prefix apps/api run db:deploy before starting the API."

if [ "${UPLOAD_DIR:-/app/uploads}" != "/app/uploads" ]; then
  warn "UPLOAD_DIR is customized; verify backup-uploads.sh/restore-uploads.sh and host volume backups cover this path"
fi
if [ -n "${UPLOADS_HOST_PATH:-}" ] && [ "${UPLOADS_HOST_PATH:-uploads_data}" != "uploads_data" ]; then
  if [[ "$UPLOADS_HOST_PATH" != /* ]]; then
    warn "UPLOADS_HOST_PATH should be an absolute host path or the default named volume uploads_data"
  elif [ ! -d "$UPLOADS_HOST_PATH" ]; then
    warn "UPLOADS_HOST_PATH does not exist yet: $UPLOADS_HOST_PATH"
  elif [ ! -w "$UPLOADS_HOST_PATH" ]; then
    warn "UPLOADS_HOST_PATH is not writable by the current user; Docker may still write depending on mount ownership"
  else
    echo "Host upload path: $UPLOADS_HOST_PATH"
  fi
fi

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a && . ./.env && set +a
  [ -n "${ADMIN_EMAIL:-}" ] || warn "ADMIN_EMAIL is empty"
  [ -n "${ADMIN_PASSWORD:-}" ] || warn "ADMIN_PASSWORD is empty"
  [ -n "${DATABASE_URL:-}" ] || warn "DATABASE_URL is empty"
  SESSION_SECRET_LENGTH="${#SESSION_COOKIE_SECRET}"
  if [ "$SESSION_SECRET_LENGTH" -lt 32 ]; then
    warn "SESSION_COOKIE_SECRET should be at least 32 characters"
  fi
  if [ -n "${BACKUP_RETENTION_DAYS:-}" ] && ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
    warn "BACKUP_RETENTION_DAYS should be a number of days"
  fi
fi

echo
echo "Doctor checks completed."
