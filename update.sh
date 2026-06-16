#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/update-$TIMESTAMP.txt"

mkdir -p "$LOG_DIR"

usage() {
  cat <<'EOF'
Usage: ./update.sh [options]

Safe self-hosted MakeReadyOS update helper.
By default this script:
  1. backs up the database
  2. backs up uploads
  3. runs doctor.sh
  4. runs check-migration-hygiene.sh
  5. runs npm --prefix apps/api run db:deploy
  6. rebuilds and restarts docker compose

Options:
  --pull                  Run git pull --ff-only before updating.
  --ref <git-ref>         Fetch and checkout the specified git branch/tag/commit before updating.
  --skip-backups          Skip both backup-db.sh and backup-uploads.sh.
  --skip-doctor           Skip doctor.sh.
  --skip-migration-check  Skip check-migration-hygiene.sh.
  --skip-db-deploy        Skip npm --prefix apps/api run db:deploy.
  --skip-rebuild          Skip docker compose up --build -d.
  --yes                   Do not prompt for confirmation.
  -h, --help              Show this help text.

Examples:
  ./update.sh --yes
  ./update.sh --pull --yes
  ./update.sh --ref v0.1.0-rc1 --yes
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1"
    exit 1
  }
}

confirm() {
  local prompt="$1"
  local answer
  printf "%s [y/N]: " "$prompt"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Update cancelled."; exit 0 ;;
  esac
}

run_update() {
  local pull_latest="false"
  local git_ref=""
  local skip_backups="false"
  local skip_doctor="false"
  local skip_migration_check="false"
  local skip_db_deploy="false"
  local skip_rebuild="false"
  local assume_yes="false"

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --pull)
        pull_latest="true"
        ;;
      --ref)
        [ "$#" -gt 1 ] || { echo "ERROR: --ref requires a value"; usage; return 2; }
        git_ref="$2"
        shift
        ;;
      --skip-backups)
        skip_backups="true"
        ;;
      --skip-doctor)
        skip_doctor="true"
        ;;
      --skip-migration-check)
        skip_migration_check="true"
        ;;
      --skip-db-deploy)
        skip_db_deploy="true"
        ;;
      --skip-rebuild)
        skip_rebuild="true"
        ;;
      --yes)
        assume_yes="true"
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

  require_command docker
  require_command node
  require_command npm

  if [ "$pull_latest" = "true" ] || [ -n "$git_ref" ]; then
    require_command git
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
      echo "ERROR: --pull/--ref require a git checkout"
      return 1
    }
  fi

  if [ "$assume_yes" != "true" ]; then
    echo "MakeReadyOS update plan"
    echo "Root: $ROOT_DIR"
    echo "Log: $LOG_FILE"
    echo "Pull latest: $pull_latest"
    echo "Git ref: ${git_ref:-current working tree}"
    echo "Backups: $([ "$skip_backups" = "true" ] && echo "skip" || echo "run")"
    echo "Doctor: $([ "$skip_doctor" = "true" ] && echo "skip" || echo "run")"
    echo "Migration hygiene: $([ "$skip_migration_check" = "true" ] && echo "skip" || echo "run")"
    echo "db:deploy: $([ "$skip_db_deploy" = "true" ] && echo "skip" || echo "run")"
    echo "docker compose up --build -d: $([ "$skip_rebuild" = "true" ] && echo "skip" || echo "run")"
    echo
    confirm "Proceed with the MakeReadyOS update?"
  fi

  echo "Update started: $(date -Iseconds)"
  echo "Project: MakeReadyOS"
  echo "Root: $ROOT_DIR"
  echo "Log: $LOG_FILE"
  echo

  if [ "$pull_latest" = "true" ]; then
    echo "Pulling latest changes on current branch"
    git pull --ff-only
    echo
  fi

  if [ -n "$git_ref" ]; then
    echo "Fetching git ref: $git_ref"
    git fetch --tags origin "$git_ref"
    echo "Checking out git ref: $git_ref"
    git checkout "$git_ref"
    echo
  fi

  if [ "$skip_backups" != "true" ]; then
    echo "Running database backup"
    "$ROOT_DIR/backup-db.sh"
    echo
    echo "Running uploads backup"
    "$ROOT_DIR/backup-uploads.sh"
    echo
  else
    echo "Skipping backups"
    echo
  fi

  if [ "$skip_doctor" != "true" ]; then
    echo "Running doctor checks"
    "$ROOT_DIR/doctor.sh"
    echo
  else
    echo "Skipping doctor checks"
    echo
  fi

  if [ "$skip_migration_check" != "true" ]; then
    echo "Running migration hygiene checks"
    "$ROOT_DIR/check-migration-hygiene.sh"
    echo
  else
    echo "Skipping migration hygiene checks"
    echo
  fi

  docker compose config --quiet
  docker compose up -d db api

  if [ "$skip_db_deploy" != "true" ]; then
    echo "Running Prisma db:deploy"
    npm --prefix apps/api run db:deploy
    echo
  else
    echo "Skipping Prisma db:deploy"
    echo
  fi

  if [ "$skip_rebuild" != "true" ]; then
    echo "Rebuilding and restarting Docker Compose services"
    docker compose up --build -d
    echo
  else
    echo "Skipping docker compose rebuild/start"
    echo
  fi

  echo "Update completed: $(date -Iseconds)"
  echo
  echo "Recommended quick verification:"
  echo "  curl -s http://localhost:4000/health"
  echo "  docker compose ps"
  echo
  echo "Rollback note: restore both the database and uploads from the same backup point if this upgrade needs to be reversed."
}

set +e
run_update "$@" 2>&1 | tee "$LOG_FILE"
STATUS="${PIPESTATUS[0]}"
set -e
echo "Update log written to $LOG_FILE"
exit "$STATUS"
