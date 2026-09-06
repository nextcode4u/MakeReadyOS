#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DATABASE_URL=production-database-must-not-be-used
export UPLOADS_HOST_PATH=/production/uploads
export COMPOSE_PROJECT_NAME=production
export COMPOSE_FILE=/production/compose.yml
export SMTP_HOST=production-mail
export ADMIN_PASSWORD=production-password
. "$ROOT_DIR/test-environment.sh"
[[ "$DATABASE_URL" == *"@db:5432/makereadyos?schema=public" ]]
[[ "$COMPOSE_PROJECT_NAME" == "makereadyos-"* && "$COMPOSE_PROJECT_NAME" != production ]]
[[ "$COMPOSE_FILE" == "$ROOT_DIR/docker-compose.yml" ]]
[[ "$COMPOSE_ENV_FILES" == "$ROOT_DIR/.env.example" ]]
[[ "$UPLOADS_HOST_PATH" == uploads_data ]]
[[ "$UPLOAD_DIR" == /app/uploads ]]
[[ -z "$SMTP_HOST" && -z "$SMTP_PASS" ]]
[[ "$ADMIN_PASSWORD" != production-password && "$SEED_DEMO_DATA" == true ]]
echo "Test environment rejects inherited production connection settings"
