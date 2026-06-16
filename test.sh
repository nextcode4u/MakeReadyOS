#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/test-$TIMESTAMP.txt"
PLANNING_TEST_DATE="$(date -u +%F)"

mkdir -p "$LOG_DIR"

{
  echo "Test run started: $(date -Iseconds)"
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

  NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]')"
  if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "ERROR: Node 20+ is required"
    exit 1
  fi

  echo "Node: $(node --version)"
  echo "NPM: $(npm --version)"
  echo

  echo "Checking database backup/restore helper scripts"
  for helper_script in backup-db.sh restore-db.sh backup-uploads.sh restore-uploads.sh move-uploads.sh route-existing-uploads.sh prune-backups.sh run-automations.sh run-analytics-snapshot.sh run-webhooks.sh seed-large.sh reset-demo.sh check-migration-hygiene.sh doctor.sh update.sh; do
    if [ ! -f "$helper_script" ] || [ ! -x "$helper_script" ]; then
      echo "ERROR: $helper_script is missing or is not executable"
      exit 1
    fi
    bash -n "$helper_script"
  done
  if ./restore-db.sh >/tmp/makereadyos-restore-no-argument.txt 2>&1; then
    echo "ERROR: restore-db.sh accepted a missing backup path"
    exit 1
  fi
  if ! grep -q "a PostgreSQL backup file path is required" /tmp/makereadyos-restore-no-argument.txt; then
    cat /tmp/makereadyos-restore-no-argument.txt
    echo "ERROR: restore-db.sh did not clearly reject a missing backup path"
    exit 1
  fi
  rm -f /tmp/makereadyos-restore-no-argument.txt
  if ./restore-uploads.sh >/tmp/makereadyos-restore-uploads-no-argument.txt 2>&1; then
    echo "ERROR: restore-uploads.sh accepted a missing backup path"
    exit 1
  fi
  if ! grep -q "an upload backup archive path is required" /tmp/makereadyos-restore-uploads-no-argument.txt; then
    cat /tmp/makereadyos-restore-uploads-no-argument.txt
    echo "ERROR: restore-uploads.sh did not clearly reject a missing backup path"
    exit 1
  fi
  rm -f /tmp/makereadyos-restore-uploads-no-argument.txt
  if ./move-uploads.sh >/tmp/makereadyos-move-uploads-no-argument.txt 2>&1; then
    echo "ERROR: move-uploads.sh accepted a missing target path"
    exit 1
  fi
  if ! grep -q "a target upload path is required" /tmp/makereadyos-move-uploads-no-argument.txt; then
    cat /tmp/makereadyos-move-uploads-no-argument.txt
    echo "ERROR: move-uploads.sh did not clearly reject a missing target path"
    exit 1
  fi
  if ./move-uploads.sh /tmp --dry-run >/tmp/makereadyos-move-uploads-unsafe.txt 2>&1; then
    echo "ERROR: move-uploads.sh accepted an unsafe target path"
    exit 1
  fi
  if ! grep -q "refusing unsafe" /tmp/makereadyos-move-uploads-unsafe.txt; then
    cat /tmp/makereadyos-move-uploads-unsafe.txt
    echo "ERROR: move-uploads.sh did not clearly reject an unsafe target path"
    exit 1
  fi
  if ! ./move-uploads.sh /mnt/makereadyos-test-uploads --dry-run >/tmp/makereadyos-move-uploads-dry-run.txt 2>&1; then
    cat /tmp/makereadyos-move-uploads-dry-run.txt
    echo "ERROR: move-uploads.sh dry-run failed"
    exit 1
  fi
  if ! grep -q "Dry run complete" /tmp/makereadyos-move-uploads-dry-run.txt; then
    cat /tmp/makereadyos-move-uploads-dry-run.txt
    echo "ERROR: move-uploads.sh dry-run did not clearly report safe completion"
    exit 1
  fi
  rm -f /tmp/makereadyos-move-uploads-no-argument.txt /tmp/makereadyos-move-uploads-unsafe.txt /tmp/makereadyos-move-uploads-dry-run.txt
  if ! ./route-existing-uploads.sh --help >/tmp/makereadyos-route-existing-uploads-help.txt 2>&1; then
    cat /tmp/makereadyos-route-existing-uploads-help.txt
    echo "ERROR: route-existing-uploads.sh help failed"
    exit 1
  fi
  if ! grep -q "Dry-run is the default" /tmp/makereadyos-route-existing-uploads-help.txt; then
    cat /tmp/makereadyos-route-existing-uploads-help.txt
    echo "ERROR: route-existing-uploads.sh help does not clearly explain dry-run behavior"
    exit 1
  fi
  rm -f /tmp/makereadyos-route-existing-uploads-help.txt
  if ! ./check-migration-hygiene.sh --help >/tmp/makereadyos-migration-hygiene-help.txt 2>&1; then
    cat /tmp/makereadyos-migration-hygiene-help.txt
    echo "ERROR: check-migration-hygiene.sh help failed"
    exit 1
  fi
  if ! grep -q "non-destructive Prisma migration checks" /tmp/makereadyos-migration-hygiene-help.txt; then
    cat /tmp/makereadyos-migration-hygiene-help.txt
    echo "ERROR: check-migration-hygiene.sh help does not clearly explain its purpose"
    exit 1
  fi
  rm -f /tmp/makereadyos-migration-hygiene-help.txt

  RETENTION_TEST_FILE="backups/makereadyos-db-retention-test.dump"
  mkdir -p backups
  : > "$RETENTION_TEST_FILE"
  touch -d "30 days ago" "$RETENTION_TEST_FILE"
  if ! ./prune-backups.sh --dry-run --days 14 >/tmp/makereadyos-prune-dry-run.txt 2>&1; then
    cat /tmp/makereadyos-prune-dry-run.txt
    echo "ERROR: prune-backups.sh dry-run failed"
    exit 1
  fi
  if ! grep -q "Would delete: .*makereadyos-db-retention-test.dump" /tmp/makereadyos-prune-dry-run.txt || [ ! -f "$RETENTION_TEST_FILE" ]; then
    cat /tmp/makereadyos-prune-dry-run.txt
    echo "ERROR: prune-backups.sh dry-run did not preserve the expired test backup"
    exit 1
  fi
  if ./prune-backups.sh --dry-run --days 14 --backup-dir /tmp >/tmp/makereadyos-prune-unsafe-path.txt 2>&1; then
    echo "ERROR: prune-backups.sh accepted an unsafe backup path"
    exit 1
  fi
  if ! grep -q "refusing unsafe backup path" /tmp/makereadyos-prune-unsafe-path.txt; then
    cat /tmp/makereadyos-prune-unsafe-path.txt
    echo "ERROR: prune-backups.sh did not clearly reject an unsafe backup path"
    exit 1
  fi
  rm -f "$RETENTION_TEST_FILE" /tmp/makereadyos-prune-dry-run.txt /tmp/makereadyos-prune-unsafe-path.txt
  if ! ./reset-demo.sh --dry-run >/tmp/makereadyos-reset-demo-dry-run.txt 2>&1; then
    cat /tmp/makereadyos-reset-demo-dry-run.txt
    echo "ERROR: reset-demo.sh dry-run failed"
    exit 1
  fi
  if ! grep -q "Dry run complete" /tmp/makereadyos-reset-demo-dry-run.txt; then
    cat /tmp/makereadyos-reset-demo-dry-run.txt
    echo "ERROR: reset-demo.sh dry-run did not clearly report safe completion"
    exit 1
  fi
  if ./reset-demo.sh >/tmp/makereadyos-reset-demo-no-confirm.txt 2>&1; then
    echo "ERROR: reset-demo.sh ran without --yes"
    exit 1
  fi
  if ! grep -q "requires --yes" /tmp/makereadyos-reset-demo-no-confirm.txt; then
    cat /tmp/makereadyos-reset-demo-no-confirm.txt
    echo "ERROR: reset-demo.sh did not clearly refuse a missing --yes"
    exit 1
  fi
  rm -f /tmp/makereadyos-reset-demo-dry-run.txt /tmp/makereadyos-reset-demo-no-confirm.txt
  if ! grep -q "MAX_UPLOAD_MB=0" .env.example; then
    echo "ERROR: .env.example should default MAX_UPLOAD_MB to 0 for uncapped app-level photo uploads"
    exit 1
  fi
  if ! grep -q "client_max_body_size 0" apps/web/nginx.conf; then
    echo "ERROR: bundled nginx should not impose its own upload body-size cap"
    exit 1
  fi
  echo "Database backup/restore helper validation passed"
  echo

  echo "Checking runtime source does not reference ignored reference assets"
  if rg -n '(^|[\"'\''(])/?reference/' apps --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/*.map'; then
    echo "ERROR: application runtime source must not reference reference/"
    exit 1
  fi
  for frog_asset in assets/frogs/ponds/pond-03.png assets/frogs/ponds/pond-15.png assets/frogs/sprites/frog-green.png assets/frogs/tadpoles/tadpole-1.png assets/frogs/decor/fly.png; do
    if [ ! -s "$frog_asset" ]; then
      echo "ERROR: expected runtime Frog Pond asset is missing: $frog_asset"
      exit 1
    fi
  done
  echo "Runtime reference isolation passed"
  echo

  echo "Checking stabilization documentation"
  for required_doc in \
    docs/ARCHITECTURE_INVENTORY.md \
    docs/FEATURE_STATUS.md \
    docs/ROADMAP.md \
    docs/UX_DEBT.md \
    docs/TECH_DEBT.md \
    docs/RELEASE_CHECKLIST.md \
    docs/API_SPEC_PLAN.md \
    docs/WEBHOOK_DELIVERY_PLAN.md \
    docs/PROPERTY_TEMPLATES.md \
    docs/REFRIGERANT.md \
    docs/ONBOARDING.md \
    docs/DEPLOYMENT.md \
    SECURITY.md \
    SUPPORT.md \
    .github/ISSUE_TEMPLATE/bug_report.md \
    .github/ISSUE_TEMPLATE/feature_request.md; do
    if [ ! -s "$required_doc" ]; then
      echo "ERROR: missing stabilization doc: $required_doc"
      exit 1
    fi
  done
  ./doctor.sh
  echo "Stabilization docs and doctor checks passed"
  echo

  echo "Checking API extension docs, schemas, and examples"
  for required_env in WEBHOOK_ALLOW_PRIVATE_URLS WEBHOOK_ALLOWED_HOSTS WEBHOOK_AUTO_DISABLE_FAILURES; do
    if ! rg -q "^${required_env}=" .env.example; then
      echo "ERROR: .env.example missing $required_env"
      exit 1
    fi
  done
  for required_path in \
    docs/API.md \
    docs/EXTENSIONS.md \
    docs/schemas/makereadyos-library-pack.schema.json \
    docs/schemas/makereadyos-native-backup.schema.json \
    examples/api/curl/list-make-ready-items.sh \
    examples/api/node/list-make-ready-items.mjs \
    examples/operational-library/sample-library-pack.json \
    examples/native-backup/minimal-backup.json; do
    if [ ! -s "$required_path" ]; then
      echo "ERROR: missing integration documentation/example: $required_path"
      exit 1
    fi
  done
  node -e '
    const fs = require("fs");
    for (const path of [
      "docs/schemas/makereadyos-library-pack.schema.json",
      "docs/schemas/makereadyos-native-backup.schema.json",
      "examples/operational-library/sample-library-pack.json",
      "examples/native-backup/minimal-backup.json",
    ]) {
      const body = JSON.parse(fs.readFileSync(path, "utf8"));
      if (!body || typeof body !== "object") throw new Error(`invalid JSON object: ${path}`);
    }
    const pack = JSON.parse(fs.readFileSync("examples/operational-library/sample-library-pack.json", "utf8"));
    if (pack.format !== "makereadyos.libraryPack" || pack.version !== 1 || !pack.packKey) {
      throw new Error("sample library pack does not match the v1 envelope");
    }
    const backup = JSON.parse(fs.readFileSync("examples/native-backup/minimal-backup.json", "utf8"));
    if (backup.format !== "makereadyos.backup" || backup.version !== 1 || backup.source?.app !== "MakeReadyOS") {
      throw new Error("sample native backup does not match the v1 envelope");
    }
  '
  echo "API extension docs, schemas, and examples are present"
  echo

  echo "Running API build verification"
  npm --prefix apps/api run build
  echo

  echo "Running web build verification"
  npm --prefix apps/web run build
  echo

  if command -v docker >/dev/null 2>&1; then
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

    echo "Validating docker compose configuration"
    docker compose config
    echo

    echo "Starting docker compose stack for auth smoke checks"
    cleanup() {
      docker compose down -v >/dev/null 2>&1 || true
    }
    trap cleanup EXIT

    docker compose up --build -d
    echo

  echo "Waiting for health endpoint"
    for _ in $(seq 1 30); do
      if curl -fsS "http://localhost:${API_PORT:-4000}/health" >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
    curl -fsS "http://localhost:${API_PORT:-4000}/health"
    echo
    echo

    echo "Checking public OpenAPI contract"
    OPENAPI_JSON="$(mktemp)"
    curl -fsS "http://localhost:${API_PORT:-4000}/api/openapi.json" >"$OPENAPI_JSON"
    node -e '
      const fs = require("fs");
      const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const schemes = body.components?.securitySchemes || {};
      if (body.openapi !== "3.1.0") throw new Error("unexpected OpenAPI version");
      if (!schemes.cookieSession || !schemes.bearerApiToken) throw new Error("missing auth security schemes");
      if (!body.paths?.["/api/make-ready-items"]) throw new Error("missing make-ready items path");
      if (!body.paths?.["/api/operations/units"]) throw new Error("missing unit directory path");
      if (!body.paths?.["/api/custom-fields"]) throw new Error("missing custom fields path");
      if (!body.paths?.["/api/planning/blocks"]) throw new Error("missing planning blocks path");
      if (!body.paths?.["/api/notifications"]) throw new Error("missing notifications path");
      if (!body.paths?.["/api/property-templates"]) throw new Error("missing property templates path");
      if (!body.paths?.["/api/admin/integrations/api-tokens"]) throw new Error("missing API token path");
      for (const requiredPath of [
        "/api/auth/logout-all",
        "/api/operations/floor-plans",
        "/api/operations/options",
        "/api/operations/schedule-tracks",
        "/api/make-ready-items/batch",
        "/api/calendar",
        "/api/charge-price-sheet-items",
        "/api/checklist-templates",
        "/api/my-work",
        "/api/planning",
        "/api/property-map-areas",
        "/api/automations",
        "/api/operational-library/packs",
        "/api/refrigerant/overview",
        "/api/refrigerant/history",
        "/api/pool/overview",
        "/api/pool/entries",
        "/api/admin/users",
        "/api/admin/storage",
      ]) {
        if (!body.paths?.[requiredPath]) throw new Error(`missing long-tail OpenAPI path: ${requiredPath}`);
      }
      if (!body.components?.schemas?.CustomField) throw new Error("missing CustomField schema");
      if (!body.components?.schemas?.WebhookDeliveryAttempt) throw new Error("missing WebhookDeliveryAttempt schema");
      if (!body.components?.schemas?.WebhookHealthResponse) throw new Error("missing WebhookHealthResponse schema");
      if (!body.components?.schemas?.MakeReadyCreateRequest) throw new Error("missing generated make-ready request schema");
      if (!body.components?.schemas?.UnitImportRequest) throw new Error("missing generated unit import schema");
      if (!body.components?.schemas?.OperationalLibraryPack) throw new Error("missing generated library pack schema");
      if (!body.components?.schemas?.WebhookCreateRequest) throw new Error("missing generated webhook schema");
      if (!body.components?.schemas?.AuthSessionResponse) throw new Error("missing auth response schema");
      if (!body.components?.schemas?.MakeReadyItemResponse) throw new Error("missing make-ready response schema");
      if (!body.components?.schemas?.VendorAssignmentsResponse) throw new Error("missing vendor assignments response schema");
      if (!body.components?.schemas?.AdminStorageResponse) throw new Error("missing admin storage response schema");
      if (!body.components?.schemas?.PlanningSummaryResponse) throw new Error("missing planning summary response schema");
      for (const schemaName of [
        "BoardOption",
        "FloorPlan",
        "ScheduleTrack",
        "OperatingCalendar",
        "ChecklistTemplate",
        "ChargePriceSheetItem",
        "CalendarEvent",
        "AutomationRule",
        "AutomationRunsResponse",
        "OperationalLibraryPackSummary",
        "OperationalLibraryInstallSummary",
        "ApiToken",
        "WebhookEndpoint",
        "RefrigerantOverviewResponse",
        "RefrigerantHistoryResponse",
        "PoolOverviewResponse",
        "PoolEntriesResponse",
      ]) {
        if (!body.components?.schemas?.[schemaName]) throw new Error(`missing exact OpenAPI schema: ${schemaName}`);
      }
      if (!body.components?.schemas?.NativeBackup) throw new Error("missing native backup schema");
      if (!body.components?.schemas?.BackupImportRequest) throw new Error("missing backup import request schema");
      if (!body.paths?.["/api/auth/login"]?.post?.responses?.["200"]?.content) throw new Error("login response is not schema documented");
      if (!body.paths?.["/api/make-ready-items"]?.post?.requestBody) throw new Error("make-ready create request body is not documented");
      if (!body.paths?.["/api/operations/floor-plans"]?.post?.requestBody) throw new Error("floor-plan create request body is not documented");
      if (!body.paths?.["/api/automations/preview"]?.post?.requestBody) throw new Error("automation preview request body is not documented");
      const automationRunsSchema = body.paths?.["/api/automations/runs"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref;
      if (automationRunsSchema !== "#/components/schemas/AutomationRunsResponse") throw new Error("automation run history response is not exact-schema documented");
      if (!body.paths?.["/api/admin/import"]?.post?.requestBody) throw new Error("backup import request body is not documented");
      if (!body.paths?.["/api/admin/integrations/webhooks/{id}/health"]) throw new Error("missing webhook health path");
      const webhookEvents = body.components?.schemas?.WebhookCreateRequest?.properties?.eventTypes?.items?.enum || [];
      for (const eventName of ["item.archived", "item.restored", "attachment.created", "attachment.deleted"]) {
        if (!webhookEvents.includes(eventName)) throw new Error(`missing webhook event enum: ${eventName}`);
      }
    ' "$OPENAPI_JSON"
    rm -f "$OPENAPI_JSON"
    echo "OpenAPI contract is available"
    echo

    echo "Checking unauthorized auth/session access"
    ME_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/auth/me")"
    META_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/meta")"
    ITEMS_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/make-ready-items")"
    echo "Unauthorized statuses: me=$ME_STATUS meta=$META_STATUS items=$ITEMS_STATUS"
    if [ "$ME_STATUS" != "401" ] || [ "$META_STATUS" != "401" ] || [ "$ITEMS_STATUS" != "401" ]; then
      echo "ERROR: unauthorized routes are not blocked correctly"
      exit 1
    fi
    echo

    echo "Checking failed login path"
    BAD_LOGIN_STATUS="$(curl -s -o /tmp/makereadyos-login-bad.json -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"wrong-password-value\"}" \
      "http://localhost:${API_PORT:-4000}/api/auth/login")"
    echo "Bad login status: $BAD_LOGIN_STATUS"
    if [ "$BAD_LOGIN_STATUS" != "401" ]; then
      cat /tmp/makereadyos-login-bad.json
      exit 1
    fi
    echo

    COOKIE_JAR="$(mktemp)"
    ADMIN_LOGIN_JSON="$(mktemp)"
    LOGIN_PAYLOAD="{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}"
    echo "Logging in with seeded admin"
    LOGIN_STATUS="$(curl -s -o "$ADMIN_LOGIN_JSON" -c "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -d "$LOGIN_PAYLOAD" \
      "http://localhost:${API_PORT:-4000}/api/auth/login")"
    echo "Login status: $LOGIN_STATUS"
    if [ "$LOGIN_STATUS" != "200" ]; then
      cat "$ADMIN_LOGIN_JSON"
      exit 1
    fi
    cat "$ADMIN_LOGIN_JSON"
    ADMIN_CSRF_TOKEN="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.csrfToken || "");' "$ADMIN_LOGIN_JSON")"
    ADMIN_STAFF_NAME="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.user?.fullName || "");' "$ADMIN_LOGIN_JSON")"
    ADMIN_USER_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.user?.id || "");' "$ADMIN_LOGIN_JSON")"
    if [ -z "$ADMIN_CSRF_TOKEN" ]; then
      echo "ERROR: missing admin csrf token"
      exit 1
    fi
    echo
    echo

    echo "Checking authenticated session and protected routes"
    curl -fsS -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/auth/me"
    echo
    META_JSON="$(mktemp)"
    curl -fsS -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/meta" >"$META_JSON"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!Array.isArray(body.staff) || !body.staff.some((person) => person.fullName === process.argv[2])) process.exit(1);' "$META_JSON" "$ADMIN_STAFF_NAME"
    curl -fsS -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/make-ready-items" >/dev/null
    PAGINATION_HEADERS="$(mktemp)"
    curl -fsS -D "$PAGINATION_HEADERS" -o /tmp/makereadyos-items-page.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items?limit=1&offset=0&sortBy=unitNumber&sortDirection=asc" >/dev/null
    for header_name in x-total-count x-limit x-offset x-has-more x-next-offset; do
      if ! grep -qi "^$header_name:" "$PAGINATION_HEADERS"; then
        cat "$PAGINATION_HEADERS"
        echo "ERROR: make-ready item pagination header is missing: $header_name"
        exit 1
      fi
    done
    INVALID_SORT_STATUS="$(curl -s -o /tmp/makereadyos-invalid-item-sort.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items?sortBy=notAField")"
    if [ "$INVALID_SORT_STATUS" != "400" ]; then
      cat /tmp/makereadyos-invalid-item-sort.json
      echo "ERROR: invalid make-ready item sort should be rejected"
      exit 1
    fi
    ADMIN_ROUTE_STATUS="$(curl -s -o /tmp/makereadyos-admin.json -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/admin/users")"
    echo "Admin route status as admin: $ADMIN_ROUTE_STATUS"
    if [ "$ADMIN_ROUTE_STATUS" != "200" ]; then
      cat /tmp/makereadyos-admin.json
      exit 1
    fi
    ADMIN_PROPERTIES_JSON="$(mktemp)"
    ADMIN_PROPERTIES_STATUS="$(curl -s -o "$ADMIN_PROPERTIES_JSON" -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/admin/properties")"
    echo "Admin properties status: $ADMIN_PROPERTIES_STATUS"
    if [ "$ADMIN_PROPERTIES_STATUS" != "200" ]; then
      cat "$ADMIN_PROPERTIES_JSON"
      exit 1
    fi
    TEST_PROPERTY_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.properties?.[0]?.id || "");' "$ADMIN_PROPERTIES_JSON")"
    OTHER_PROPERTY_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const selected=process.argv[2]; process.stdout.write(body.properties?.find((property) => property.id !== selected)?.id || "");' "$ADMIN_PROPERTIES_JSON" "$TEST_PROPERTY_ID")"
    if [ -z "$TEST_PROPERTY_ID" ]; then
      echo "ERROR: missing property id for admin tests"
      exit 1
    fi
    STORAGE_STATUS="$(curl -s -o /tmp/makereadyos-storage.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/storage")"
    if [ "$STORAGE_STATUS" != "200" ]; then
      cat /tmp/makereadyos-storage.json
      echo "ERROR: admin storage settings endpoint failed"
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-storage.json","utf8")); if (!body.storage?.uploadDir || !body.storage?.hostPath || typeof body.storage?.current?.writable !== "boolean" || !Array.isArray(body.storage?.propertyRouting)) process.exit(1);'
    STORAGE_VALIDATE_STATUS="$(curl -s -o /tmp/makereadyos-storage-validate.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"hostPath\":\"/mnt/storage/makereadyos-uploads\"}" \
      "http://localhost:${API_PORT:-4000}/api/admin/storage/validate")"
    if [ "$STORAGE_VALIDATE_STATUS" != "200" ]; then
      cat /tmp/makereadyos-storage-validate.json
      echo "ERROR: admin storage validation endpoint failed"
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-storage-validate.json","utf8")); if (!body.safe || !body.commands?.move?.includes("move-uploads.sh")) process.exit(1);'
    STORAGE_ROUTING_STATUS="$(curl -s -o /tmp/makereadyos-storage-routing.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -X PATCH \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"uploadStorageMode\":\"PROPERTY_SUBDIR\",\"uploadSubdir\":\"qa-property-uploads\"}" \
      "http://localhost:${API_PORT:-4000}/api/admin/storage/property-routing")"
    if [ "$STORAGE_ROUTING_STATUS" != "200" ]; then
      cat /tmp/makereadyos-storage-routing.json
      echo "ERROR: admin property upload routing update failed"
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-storage-routing.json","utf8")); if (body.property?.effectiveSubdir !== "qa-property-uploads") process.exit(1);'

    echo "Checking API token and integration management as admin"
    INTEGRATIONS_STATUS="$(curl -s -o /tmp/makereadyos-integrations.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations")"
    if [ "$INTEGRATIONS_STATUS" != "200" ]; then
      cat /tmp/makereadyos-integrations.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-integrations.json","utf8")); for (const eventName of ["item.archived","item.restored","attachment.created","attachment.deleted"]) { if (!body.webhookEvents?.includes(eventName)) process.exit(1); }'
    API_TOKEN_JSON="$(mktemp)"
    API_TOKEN_STATUS="$(curl -s -o "$API_TOKEN_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"Smoke read items $TIMESTAMP\",\"scopes\":[\"read:items\"],\"propertyIds\":[]}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/api-tokens")"
    if [ "$API_TOKEN_STATUS" != "201" ]; then
      cat "$API_TOKEN_JSON"
      exit 1
    fi
    API_TOKEN_VALUE="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (body.apiToken?.tokenHash) process.exit(2); process.stdout.write(body.token || "");' "$API_TOKEN_JSON")"
    API_TOKEN_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.apiToken?.id || "");' "$API_TOKEN_JSON")"
    if [ -z "$API_TOKEN_VALUE" ] || [ -z "$API_TOKEN_ID" ]; then
      echo "ERROR: API token creation did not return one-time token metadata"
      cat "$API_TOKEN_JSON"
      exit 1
    fi
    API_TOKEN_ITEMS_STATUS="$(curl -s -o /tmp/makereadyos-token-items.json -w "%{http_code}" \
      -H "Authorization: Bearer $API_TOKEN_VALUE" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items?limit=1")"
    API_TOKEN_VENDOR_STATUS="$(curl -s -o /tmp/makereadyos-token-vendors.json -w "%{http_code}" \
      -H "Authorization: Bearer $API_TOKEN_VALUE" \
      "http://localhost:${API_PORT:-4000}/api/vendors")"
    if [ "$API_TOKEN_ITEMS_STATUS" != "200" ] || [ "$API_TOKEN_VENDOR_STATUS" != "403" ]; then
      cat /tmp/makereadyos-token-items.json /tmp/makereadyos-token-vendors.json
      echo "ERROR: API token scope enforcement failed"
      exit 1
    fi
    SCOPED_TOKEN_JSON="$(mktemp)"
    SCOPED_TOKEN_STATUS="$(curl -s -o "$SCOPED_TOKEN_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"Smoke scoped token $TIMESTAMP\",\"scopes\":[\"read:items\"],\"propertyIds\":[\"$TEST_PROPERTY_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/api-tokens")"
    if [ "$SCOPED_TOKEN_STATUS" != "201" ]; then
      cat "$SCOPED_TOKEN_JSON"
      exit 1
    fi
    SCOPED_TOKEN_VALUE="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.token || "");' "$SCOPED_TOKEN_JSON")"
    SCOPED_TOKEN_ALLOWED_STATUS="$(curl -s -o /tmp/makereadyos-scoped-token-allowed.json -w "%{http_code}" \
      -H "Authorization: Bearer $SCOPED_TOKEN_VALUE" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items?propertyId=$TEST_PROPERTY_ID&limit=1")"
    if [ "$SCOPED_TOKEN_ALLOWED_STATUS" != "200" ]; then
      cat /tmp/makereadyos-scoped-token-allowed.json
      echo "ERROR: property-scoped API token could not read its allowed property"
      exit 1
    fi
    if [ -n "$OTHER_PROPERTY_ID" ]; then
      SCOPED_TOKEN_DENIED_STATUS="$(curl -s -o /tmp/makereadyos-scoped-token-denied.json -w "%{http_code}" \
        -H "Authorization: Bearer $SCOPED_TOKEN_VALUE" \
        "http://localhost:${API_PORT:-4000}/api/make-ready-items?propertyId=$OTHER_PROPERTY_ID&limit=1")"
      if [ "$SCOPED_TOKEN_DENIED_STATUS" != "403" ]; then
        cat /tmp/makereadyos-scoped-token-denied.json
        echo "ERROR: property-scoped API token was not denied outside its property"
        exit 1
      fi
    fi
    TOKEN_USAGE_STATUS="$(curl -s -o /tmp/makereadyos-integrations-token-usage.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations")"
    if [ "$TOKEN_USAGE_STATUS" != "200" ]; then
      cat /tmp/makereadyos-integrations-token-usage.json
      echo "ERROR: integration token usage snapshot failed"
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const token=body.apiTokens?.find((entry)=>entry.id===process.argv[2]); if (!token || token.useCount < 1 || token.lastUsedMethod !== "GET" || !String(token.lastUsedPath || "").includes("/api/make-ready-items")) process.exit(1);' /tmp/makereadyos-integrations-token-usage.json "$API_TOKEN_ID"
    REVOKE_TOKEN_STATUS="$(curl -s -o /tmp/makereadyos-token-revoke.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/admin/integrations/api-tokens/$API_TOKEN_ID/revoke")"
    REVOKED_TOKEN_STATUS="$(curl -s -o /tmp/makereadyos-token-revoked-use.json -w "%{http_code}" \
      -H "Authorization: Bearer $API_TOKEN_VALUE" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items?limit=1")"
    if [ "$REVOKE_TOKEN_STATUS" != "200" ] || [ "$REVOKED_TOKEN_STATUS" != "401" ]; then
      cat /tmp/makereadyos-token-revoke.json /tmp/makereadyos-token-revoked-use.json
      echo "ERROR: API token revocation failed"
      exit 1
    fi
    WEBHOOK_JSON="$(mktemp)"
    WEBHOOK_STATUS="$(curl -s -o "$WEBHOOK_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"Smoke webhook $TIMESTAMP\",\"url\":\"http://127.0.0.1:9/makereadyos\",\"eventTypes\":[\"item.updated\"],\"propertyIds\":[\"$TEST_PROPERTY_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks")"
    WEBHOOK_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (body.webhook?.secretHash) process.exit(2); process.stdout.write(body.webhook?.id || "");' "$WEBHOOK_JSON")"
    if [ "$WEBHOOK_STATUS" != "201" ] || [ -z "$WEBHOOK_ID" ]; then
      cat "$WEBHOOK_JSON"
      echo "ERROR: webhook scaffold registration failed"
      exit 1
    fi
    WEBHOOK_TEST_PAYLOAD_STATUS="$(curl -s -o /tmp/makereadyos-webhook-test-payload.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"eventType":"item.updated"}' \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks/$WEBHOOK_ID/test-payload")"
    WEBHOOK_DELIVERIES_STATUS="$(curl -s -o /tmp/makereadyos-webhook-deliveries.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks/$WEBHOOK_ID/deliveries?limit=5")"
    WEBHOOK_HEALTH_STATUS="$(curl -s -o /tmp/makereadyos-webhook-health.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks/$WEBHOOK_ID/health")"
    if [ "$WEBHOOK_TEST_PAYLOAD_STATUS" != "201" ] || [ "$WEBHOOK_DELIVERIES_STATUS" != "200" ] || [ "$WEBHOOK_HEALTH_STATUS" != "200" ]; then
      cat /tmp/makereadyos-webhook-test-payload.json /tmp/makereadyos-webhook-deliveries.json
      echo "ERROR: webhook signed test payload or delivery history failed"
      exit 1
    fi
    node -e 'const fs=require("fs"); const created=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const deliveries=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); const health=JSON.parse(fs.readFileSync(process.argv[3],"utf8")); if (created.webhook?.secretHash || created.webhook?.secretCiphertext || created.delivery?.headers?.["x-makereadyos-signature"]?.startsWith("sha256=") !== true || created.delivery?.status !== "DRY_RUN" || created.notice !== "No outbound HTTP delivery was attempted." || deliveries.deliveries.length < 1 || deliveries.deliveries[0].deliveryId !== created.delivery.deliveryId || !health.health?.statusCounts?.DRY_RUN || health.health?.eventCounts?.["item.updated"] < 1) process.exit(1);' /tmp/makereadyos-webhook-test-payload.json /tmp/makereadyos-webhook-deliveries.json /tmp/makereadyos-webhook-health.json
    WEBHOOK_QUEUE_STATUS="$(curl -s -o /tmp/makereadyos-webhook-queued-payload.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"eventType":"item.updated","enqueue":true}' \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks/$WEBHOOK_ID/test-payload")"
    if [ "$WEBHOOK_QUEUE_STATUS" != "201" ]; then
      cat /tmp/makereadyos-webhook-queued-payload.json
      echo "ERROR: webhook queued test payload failed"
      exit 1
    fi
    WEBHOOK_DELIVERY_TIMEOUT_MS=750 WEBHOOK_DELIVERY_MAX_ATTEMPTS=1 ./run-webhooks.sh >/tmp/makereadyos-webhook-run.txt
    WEBHOOK_POST_RUN_DELIVERIES_STATUS="$(curl -s -o /tmp/makereadyos-webhook-deliveries-post-run.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks/$WEBHOOK_ID/deliveries?limit=10")"
    if [ "$WEBHOOK_POST_RUN_DELIVERIES_STATUS" != "200" ]; then
      cat /tmp/makereadyos-webhook-deliveries-post-run.json
      echo "ERROR: webhook delivery history after runner failed"
      exit 1
    fi
    node -e 'const fs=require("fs"); const queued=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const deliveries=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); const found=deliveries.deliveries.find((delivery)=>delivery.deliveryId===queued.delivery.deliveryId); if (queued.delivery.status !== "PENDING" || queued.notice !== "Payload queued for delivery by run-webhooks.sh." || !found || !["FAILED","GAVE_UP"].includes(found.status) || !found.errorMessage) process.exit(1);' /tmp/makereadyos-webhook-queued-payload.json /tmp/makereadyos-webhook-deliveries-post-run.json
    WEBHOOK_REVOKE_STATUS="$(curl -s -o /tmp/makereadyos-webhook-revoke.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks/$WEBHOOK_ID/revoke")"
    if [ "$WEBHOOK_REVOKE_STATUS" != "200" ]; then
      cat /tmp/makereadyos-webhook-revoke.json
      exit 1
    fi
    echo "API token and integration smoke checks passed"
    echo

    echo "Checking operations property, unit, and make-ready lifecycle as admin"
    OPS_PROPERTIES_STATUS="$(curl -s -o /tmp/makereadyos-ops-properties.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operations/properties?includeArchived=true")"
    OPS_PROPERTY_CODE="QAOPS${TIMESTAMP//-/}"
    OPS_PROPERTY_JSON="$(mktemp)"
    CREATE_PROPERTY_STATUS="$(curl -s -o "$OPS_PROPERTY_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"QA Operations Property\",\"code\":\"$OPS_PROPERTY_CODE\",\"occupancyGoalPercent\":94.5}" \
      "http://localhost:${API_PORT:-4000}/api/operations/properties")"
    OPS_PROPERTY_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.property?.id || "");' "$OPS_PROPERTY_JSON")"
    UPDATE_PROPERTY_STATUS="$(curl -s -o /tmp/makereadyos-ops-property-update.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PATCH \
      -d '{"name":"QA Operations Property Updated","occupancyGoalPercent":95}' \
      "http://localhost:${API_PORT:-4000}/api/operations/properties/$OPS_PROPERTY_ID")"
    OPERATING_CALENDAR_LIST_STATUS="$(curl -s -o /tmp/makereadyos-operating-calendars.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operations/operating-calendars?propertyId=$OPS_PROPERTY_ID&includeArchived=true")"
    OPERATING_CALENDAR_UPDATE_STATUS="$(curl -s -o /tmp/makereadyos-operating-calendar-update.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PUT \
      -d '{"name":"QA Operating Calendar","timezone":"America/Chicago","noWeekendScheduling":true,"avoidMondayScheduling":true,"avoidFridayScheduling":true,"maintenanceStartMinute":480,"maintenanceEndMinute":1020,"vendorLeadDays":4,"dailyScheduledUnitLimit":2,"scopeDay":1,"workStartDay":2,"autoPopulateEnabled":false,"notes":"QA schedule guardrails"}' \
      "http://localhost:${API_PORT:-4000}/api/operations/properties/$OPS_PROPERTY_ID/operating-calendar")"
    OPS_FLOOR_PLAN_JSON="$(mktemp)"
    CREATE_FLOOR_PLAN_STATUS="$(curl -s -o "$OPS_FLOOR_PLAN_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$OPS_PROPERTY_ID\",\"name\":\"QA A1 Managed\",\"bedrooms\":1,\"bathrooms\":1,\"squareFeet\":740}" \
      "http://localhost:${API_PORT:-4000}/api/operations/floor-plans")"
    OPS_FLOOR_PLAN_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.floorPlan?.id || "");' "$OPS_FLOOR_PLAN_JSON")"
    UPDATE_FLOOR_PLAN_STATUS="$(curl -s -o /tmp/makereadyos-floor-plan-update.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PATCH -d '{"description":"QA managed plan"}' \
      "http://localhost:${API_PORT:-4000}/api/operations/floor-plans/$OPS_FLOOR_PLAN_ID")"
    OPS_UNIT_JSON="$(mktemp)"
    CREATE_OPS_UNIT_STATUS="$(curl -s -o "$OPS_UNIT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$OPS_PROPERTY_ID\",\"number\":\"101\",\"floorPlanId\":\"$OPS_FLOOR_PLAN_ID\",\"floorPlan\":null,\"squareFeet\":null,\"building\":\"1\",\"area\":\"North\",\"floor\":\"1\",\"occupancyStatus\":\"OCCUPIED\"}" \
      "http://localhost:${API_PORT:-4000}/api/operations/units")"
    OPS_UNIT_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.unit?.id || "");' "$OPS_UNIT_JSON")"
    UPDATE_OPS_UNIT_STATUS="$(curl -s -o /tmp/makereadyos-ops-unit-update.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PATCH \
      -d '{"floorPlan":"QA A1 Updated","squareFeet":745,"building":"2","occupancyStatus":"VACANT_READY"}' \
      "http://localhost:${API_PORT:-4000}/api/operations/units/$OPS_UNIT_ID")"
    IMPORT_UNITS_STATUS="$(curl -s -o /tmp/makereadyos-unit-import.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$OPS_PROPERTY_ID\",\"units\":[{\"number\":\"102\",\"building\":\"2\",\"floorPlan\":\"QA A1\",\"squareFeet\":740,\"occupancyStatus\":\"OCCUPIED\"},{\"number\":\"103\",\"building\":\"2\",\"floorPlan\":\"QA A1\",\"occupancyStatus\":\"NTV_LEASED\"}],\"updateExisting\":true}" \
      "http://localhost:${API_PORT:-4000}/api/operations/units/import")"
    IMPORT_SPARSE_UNITS_STATUS="$(curl -s -o /tmp/makereadyos-unit-import-sparse.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$OPS_PROPERTY_ID\",\"units\":[{\"number\":\"103\",\"floorPlan\":\"QA Sparse\",\"squareFeet\":755}],\"updateExisting\":true}" \
      "http://localhost:${API_PORT:-4000}/api/operations/units/import")"
    OPS_UNITS_AFTER_IMPORT_JSON="$(mktemp)"
    OPS_UNITS_AFTER_IMPORT_STATUS="$(curl -s -o "$OPS_UNITS_AFTER_IMPORT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operations/units?propertyId=$OPS_PROPERTY_ID&includeArchived=true")"
    ARCHIVE_OPS_UNIT_STATUS="$(curl -s -o /tmp/makereadyos-ops-unit-archive.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/operations/units/$OPS_UNIT_ID/archive")"
    RESTORE_OPS_UNIT_STATUS="$(curl -s -o /tmp/makereadyos-ops-unit-restore.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/operations/units/$OPS_UNIT_ID/restore")"
    ARCHIVE_FLOOR_PLAN_STATUS="$(curl -s -o /tmp/makereadyos-floor-plan-archive.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/operations/floor-plans/$OPS_FLOOR_PLAN_ID/archive")"
    ARCHIVE_PROPERTY_STATUS="$(curl -s -o /tmp/makereadyos-ops-property-archive.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/operations/properties/$OPS_PROPERTY_ID/archive")"
    UNSAFE_PROPERTY_DELETE_STATUS="$(curl -s -o /tmp/makereadyos-ops-property-delete.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X DELETE \
      "http://localhost:${API_PORT:-4000}/api/operations/properties/$OPS_PROPERTY_ID")"
    RESTORE_PROPERTY_STATUS="$(curl -s -o /tmp/makereadyos-ops-property-restore.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/operations/properties/$OPS_PROPERTY_ID/restore")"
    echo "Operations property/unit/floor-plan statuses: list=$OPS_PROPERTIES_STATUS property=$CREATE_PROPERTY_STATUS/$UPDATE_PROPERTY_STATUS/$ARCHIVE_PROPERTY_STATUS/$RESTORE_PROPERTY_STATUS delete=$UNSAFE_PROPERTY_DELETE_STATUS calendar=$OPERATING_CALENDAR_LIST_STATUS/$OPERATING_CALENDAR_UPDATE_STATUS floorplan=$CREATE_FLOOR_PLAN_STATUS/$UPDATE_FLOOR_PLAN_STATUS/$ARCHIVE_FLOOR_PLAN_STATUS unit=$CREATE_OPS_UNIT_STATUS/$UPDATE_OPS_UNIT_STATUS/$IMPORT_UNITS_STATUS/$IMPORT_SPARSE_UNITS_STATUS/$OPS_UNITS_AFTER_IMPORT_STATUS/$ARCHIVE_OPS_UNIT_STATUS/$RESTORE_OPS_UNIT_STATUS"
    if [ "$OPS_PROPERTIES_STATUS" != "200" ] || [ "$CREATE_PROPERTY_STATUS" != "201" ] || [ "$UPDATE_PROPERTY_STATUS" != "200" ] || [ "$OPERATING_CALENDAR_LIST_STATUS" != "200" ] || [ "$OPERATING_CALENDAR_UPDATE_STATUS" != "200" ] || [ "$ARCHIVE_PROPERTY_STATUS" != "200" ] || [ "$RESTORE_PROPERTY_STATUS" != "200" ] || [ "$UNSAFE_PROPERTY_DELETE_STATUS" != "409" ] || [ "$CREATE_FLOOR_PLAN_STATUS" != "201" ] || [ "$UPDATE_FLOOR_PLAN_STATUS" != "200" ] || [ "$ARCHIVE_FLOOR_PLAN_STATUS" != "200" ] || [ "$CREATE_OPS_UNIT_STATUS" != "201" ] || [ "$UPDATE_OPS_UNIT_STATUS" != "200" ] || [ "$IMPORT_UNITS_STATUS" != "200" ] || [ "$IMPORT_SPARSE_UNITS_STATUS" != "200" ] || [ "$OPS_UNITS_AFTER_IMPORT_STATUS" != "200" ] || [ "$ARCHIVE_OPS_UNIT_STATUS" != "200" ] || [ "$RESTORE_OPS_UNIT_STATUS" != "200" ]; then
      cat /tmp/makereadyos-ops-properties.json "$OPS_PROPERTY_JSON" /tmp/makereadyos-ops-property-update.json /tmp/makereadyos-operating-calendars.json /tmp/makereadyos-operating-calendar-update.json /tmp/makereadyos-ops-property-delete.json "$OPS_UNIT_JSON" /tmp/makereadyos-unit-import.json /tmp/makereadyos-unit-import-sparse.json "$OPS_UNITS_AFTER_IMPORT_JSON"
      exit 1
    fi
    node -e 'const fs=require("fs"); const calendar=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).calendar; if (!calendar.noWeekendScheduling || !calendar.avoidMondayScheduling || !calendar.avoidFridayScheduling || calendar.vendorLeadDays !== 4 || calendar.dailyScheduledUnitLimit !== 2 || calendar.scopeDay !== 1 || calendar.workStartDay !== 2) process.exit(1);' /tmp/makereadyos-operating-calendar-update.json
    node -e 'const fs=require("fs"); const unit=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).unit; if (!unit.floorPlanId || unit.floorPlan !== "QA A1 Managed" || unit.bedrooms !== 1 || unit.bathrooms !== 1 || unit.squareFeet !== 740) process.exit(1);' "$OPS_UNIT_JSON"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (body.summary.created !== 2 || body.summary.updated !== 0) process.exit(1);' /tmp/makereadyos-unit-import.json
    node -e 'const fs=require("fs"); const units=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).units; const unit=units.find((candidate)=>candidate.number==="103"); if (!unit || unit.floorPlan !== "QA Sparse" || unit.squareFeet !== 755 || unit.occupancyStatus !== "NTV_LEASED" || unit.building !== "2") process.exit(1);' "$OPS_UNITS_AFTER_IMPORT_JSON"

    echo "Checking managed built-in board option lifecycle"
    TEST_OPTION_JSON="$(mktemp)"
    CREATE_OPTION_STATUS="$(curl -s -o "$TEST_OPTION_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"fieldKey":"paintStatus","value":"QA TOUCH UP","color":"#123456","textColor":"#ffffff"}' \
      "http://localhost:${API_PORT:-4000}/api/operations/options")"
    TEST_OPTION_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).option?.id || "");' "$TEST_OPTION_JSON")"
    UPDATE_OPTION_STATUS="$(curl -s -o /tmp/makereadyos-option-update.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"value":"QA PAINT TOUCH UP","color":"#654321"}' \
      "http://localhost:${API_PORT:-4000}/api/operations/options/$TEST_OPTION_ID")"
    ARCHIVE_OPTION_STATUS="$(curl -s -o /tmp/makereadyos-option-archive.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/operations/options/$TEST_OPTION_ID/archive")"
    DELETE_OPTION_STATUS="$(curl -s -o /tmp/makereadyos-option-delete.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X DELETE \
      "http://localhost:${API_PORT:-4000}/api/operations/options/$TEST_OPTION_ID")"
    echo "Board option statuses: create=$CREATE_OPTION_STATUS update=$UPDATE_OPTION_STATUS archive=$ARCHIVE_OPTION_STATUS delete=$DELETE_OPTION_STATUS"
    if [ "$CREATE_OPTION_STATUS" != "201" ] || [ "$UPDATE_OPTION_STATUS" != "200" ] || [ "$ARCHIVE_OPTION_STATUS" != "200" ] || [ "$DELETE_OPTION_STATUS" != "409" ]; then
      cat "$TEST_OPTION_JSON" /tmp/makereadyos-option-update.json /tmp/makereadyos-option-archive.json /tmp/makereadyos-option-delete.json
      exit 1
    fi

    echo "Checking presentation-safe built-in column display labels"
    COLUMN_LABEL_STATUS="$(curl -s -o /tmp/makereadyos-column-label.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"label":"QA Vacated"}' \
      "http://localhost:${API_PORT:-4000}/api/operations/columns/vacatedDate")"
    curl -fsS -o /tmp/makereadyos-meta-columns.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/meta"
    if [ "$COLUMN_LABEL_STATUS" != "200" ]; then
      cat /tmp/makereadyos-column-label.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const meta=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const field=meta.columns.find((column) => column.fieldKey === "vacatedDate"); if (!field || field.label !== "QA Vacated") process.exit(1);' /tmp/makereadyos-meta-columns.json
    echo "Column label metadata validation passed"

    echo "Checking property-owned board section metadata and rename"
    curl -fsS -o /tmp/makereadyos-sections.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/operations/board-sections?propertyId=$TEST_PROPERTY_ID"
    TEST_SECTION_ID="$(node -e 'const fs=require("fs"); const section=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).sections.find((entry) => entry.sectionType === "MAKE_READY"); process.stdout.write(section?.id || "");' /tmp/makereadyos-sections.json)"
    TEST_MAKE_READY_GROUP="$(node -e 'const fs=require("fs"); const section=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).sections.find((entry) => entry.sectionType === "MAKE_READY"); process.stdout.write(section?.key || "");' /tmp/makereadyos-sections.json)"
    TEST_DOWN_GROUP="$(node -e 'const fs=require("fs"); const section=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).sections.find((entry) => entry.sectionType === "DOWN"); process.stdout.write(section?.key || "");' /tmp/makereadyos-sections.json)"
    if [ -z "$TEST_SECTION_ID" ] || [ -z "$TEST_MAKE_READY_GROUP" ] || [ -z "$TEST_DOWN_GROUP" ]; then
      echo "ERROR: selected property is missing standard board sections"
      cat /tmp/makereadyos-sections.json
      exit 1
    fi
    SECTION_RENAME_STATUS="$(curl -s -o /tmp/makereadyos-section-rename.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"displayName":"QA Turns"}' \
      "http://localhost:${API_PORT:-4000}/api/operations/board-sections/$TEST_SECTION_ID")"
    curl -fsS -o /tmp/makereadyos-section-meta.json -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/meta"
    node -e 'const fs=require("fs"); const meta=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!meta.boardSections.some((section) => section.id === process.argv[2] && section.displayName === "QA Turns")) process.exit(1);' /tmp/makereadyos-section-meta.json "$TEST_SECTION_ID"
    if [ "$SECTION_RENAME_STATUS" != "200" ]; then cat /tmp/makereadyos-section-rename.json; exit 1; fi
    curl -fsS -o /tmp/makereadyos-section-restore-name.json -b "$COOKIE_JAR" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"displayName":"Make Ready"}' \
      "http://localhost:${API_PORT:-4000}/api/operations/board-sections/$TEST_SECTION_ID" >/dev/null

    echo "Checking scoped dashboard summary"
    DASHBOARD_STATUS="$(curl -s -o /tmp/makereadyos-dashboard.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/dashboard?propertyId=$TEST_PROPERTY_ID")"
    if [ "$DASHBOARD_STATUS" != "200" ]; then cat /tmp/makereadyos-dashboard.json; exit 1; fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (typeof body.kpis?.active !== "number" || typeof body.kpis?.riskHigh !== "number" || !Array.isArray(body.needsAttention) || !body.riskByLevel || !body.riskByCategory || Object.keys(body.propertyComparison).length > 1) process.exit(1);' /tmp/makereadyos-dashboard.json
    echo "Checking analytics summary and idempotent snapshot endpoint"
    ANALYTICS_SUMMARY_STATUS="$(curl -s -o /tmp/makereadyos-analytics-summary.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/analytics/summary?propertyId=$TEST_PROPERTY_ID")"
    ANALYTICS_SNAPSHOT_STATUS="$(curl -s -o /tmp/makereadyos-analytics-snapshot.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/analytics/snapshot/run?propertyId=$TEST_PROPERTY_ID")"
    ANALYTICS_SNAPSHOT_AGAIN_STATUS="$(curl -s -o /tmp/makereadyos-analytics-snapshot-again.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/analytics/snapshot/run?propertyId=$TEST_PROPERTY_ID")"
    ANALYTICS_SNAPSHOTS_STATUS="$(curl -s -o /tmp/makereadyos-analytics-snapshots.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/analytics/snapshots?propertyId=$TEST_PROPERTY_ID&limit=5")"
    echo "Analytics statuses: summary=$ANALYTICS_SUMMARY_STATUS snapshot=$ANALYTICS_SNAPSHOT_STATUS/$ANALYTICS_SNAPSHOT_AGAIN_STATUS snapshots=$ANALYTICS_SNAPSHOTS_STATUS"
    if [ "$ANALYTICS_SUMMARY_STATUS" != "200" ] || [ "$ANALYTICS_SNAPSHOT_STATUS" != "200" ] || [ "$ANALYTICS_SNAPSHOT_AGAIN_STATUS" != "200" ] || [ "$ANALYTICS_SNAPSHOTS_STATUS" != "200" ]; then
      cat /tmp/makereadyos-analytics-summary.json /tmp/makereadyos-analytics-snapshot.json /tmp/makereadyos-analytics-snapshots.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const summary=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const run=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); const snapshots=JSON.parse(fs.readFileSync(process.argv[3],"utf8")); if (typeof summary.metrics?.averageDaysVacant !== "number" || !Array.isArray(summary.trends) || run.count !== 1 || !Array.isArray(snapshots.snapshots) || snapshots.snapshots.length < 1) process.exit(1);' /tmp/makereadyos-analytics-summary.json /tmp/makereadyos-analytics-snapshot.json /tmp/makereadyos-analytics-snapshots.json

    echo "Checking SLA/risk evaluation summary and scoped risk items"
    RISK_POLICIES_STATUS="$(curl -s -o /tmp/makereadyos-risk-policies.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/risk/policies?propertyId=$TEST_PROPERTY_ID")"
    RISK_POLICY_UPDATE_STATUS="$(curl -s -o /tmp/makereadyos-risk-policy-update.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PUT \
      -d '{"moveInCriticalDays":1,"moveInHighDays":3,"moveInMediumDays":7,"unassignedHighDays":7,"staleActivityDays":4,"agingMediumDays":14,"agingHighDays":21,"vendorNearMoveInDays":3,"checklistNearMoveInDays":7,"planningNearMoveInDays":7}' \
      "http://localhost:${API_PORT:-4000}/api/risk/policies/$TEST_PROPERTY_ID")"
    RISK_EVALUATE_STATUS="$(curl -s -o /tmp/makereadyos-risk-evaluate.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"notify\":true}" \
      "http://localhost:${API_PORT:-4000}/api/risk/evaluate")"
    RISK_SUMMARY_STATUS="$(curl -s -o /tmp/makereadyos-risk-summary.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/risk/summary?propertyId=$TEST_PROPERTY_ID")"
    RISK_ITEMS_STATUS="$(curl -s -o /tmp/makereadyos-risk-items.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/risk/items?propertyId=$TEST_PROPERTY_ID&level=HIGH&limit=10")"
    echo "Risk statuses: policies=$RISK_POLICIES_STATUS update=$RISK_POLICY_UPDATE_STATUS evaluate=$RISK_EVALUATE_STATUS summary=$RISK_SUMMARY_STATUS items=$RISK_ITEMS_STATUS"
    if [ "$RISK_POLICIES_STATUS" != "200" ] || [ "$RISK_POLICY_UPDATE_STATUS" != "200" ] || [ "$RISK_EVALUATE_STATUS" != "200" ] || [ "$RISK_SUMMARY_STATUS" != "200" ] || [ "$RISK_ITEMS_STATUS" != "200" ]; then
      cat /tmp/makereadyos-risk-policies.json /tmp/makereadyos-risk-policy-update.json /tmp/makereadyos-risk-evaluate.json /tmp/makereadyos-risk-summary.json /tmp/makereadyos-risk-items.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const policies=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const update=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); const evalBody=JSON.parse(fs.readFileSync(process.argv[3],"utf8")); const summary=JSON.parse(fs.readFileSync(process.argv[4],"utf8")); const items=JSON.parse(fs.readFileSync(process.argv[5],"utf8")); if (!Array.isArray(policies.policies) || update.policy?.staleActivityDays !== 4 || typeof evalBody.evaluated !== "number" || !summary.byLevel || !summary.byCategory || !Array.isArray(summary.topRiskItems) || !Array.isArray(items.items) || items.items.some((item) => item.riskLevel !== "HIGH")) process.exit(1);' /tmp/makereadyos-risk-policies.json /tmp/makereadyos-risk-policy-update.json /tmp/makereadyos-risk-evaluate.json /tmp/makereadyos-risk-summary.json /tmp/makereadyos-risk-items.json
    RISK_QUERY_CATEGORY="$(node -e 'const fs=require("fs"); const summary=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const entry=Object.entries(summary.byCategory || {}).find(([, count]) => Number(count) > 0); process.stdout.write(entry ? entry[0] : "");' /tmp/makereadyos-risk-summary.json)"
    RISK_CATEGORY_QUERY_STATUS="$(curl -s -o /tmp/makereadyos-risk-category-items.json -b "$COOKIE_JAR" -w "%{http_code}" --get \
      --data-urlencode "propertyId=$TEST_PROPERTY_ID" --data-urlencode "riskCategory=$RISK_QUERY_CATEGORY" \
      --data-urlencode "limit=5" --data-urlencode "offset=0" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items")"
    if [ -z "$RISK_QUERY_CATEGORY" ] || [ "$RISK_CATEGORY_QUERY_STATUS" != "200" ]; then
      cat /tmp/makereadyos-risk-summary.json /tmp/makereadyos-risk-category-items.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const items=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const category=process.argv[2]; if (!Array.isArray(items) || items.length < 1 || items.length > 5 || items.some((item) => !Array.isArray(item.riskReasons) || !item.riskReasons.some((reason) => reason.category === category))) process.exit(1);' /tmp/makereadyos-risk-category-items.json "$RISK_QUERY_CATEGORY"

    TURN_UNIT_NUMBER="QA${TIMESTAMP//-/}"
    TURN_UNIT_JSON="$(mktemp)"
    CREATE_TURN_UNIT_STATUS="$(curl -s -o "$TURN_UNIT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"number\":\"$TURN_UNIT_NUMBER\",\"floorPlan\":\"QA TURN\",\"squareFeet\":800}" \
      "http://localhost:${API_PORT:-4000}/api/operations/units")"
    TURN_UNIT_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.unit?.id || "");' "$TURN_UNIT_JSON")"
    TURN_ITEM_JSON="$(mktemp)"
    CREATE_TURN_STATUS="$(curl -s -o "$TURN_ITEM_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"unitId\":\"$TURN_UNIT_ID\",\"boardGroup\":\"$TEST_MAKE_READY_GROUP\",\"itemName\":\"$TURN_UNIT_NUMBER\",\"unitNumber\":\"$TURN_UNIT_NUMBER\",\"floorPlan\":\"QA TURN\",\"vacancyStatus\":\"TO WALK\",\"makeReadyStatus\":\"LITE\",\"completionStatus\":\"NO\"}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items")"
    TURN_ITEM_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.id || "");' "$TURN_ITEM_JSON")"
    UNIT_HISTORY_STATUS="$(curl -s -o /tmp/makereadyos-unit-history.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/units/$TURN_UNIT_ID/history")"
    if [ "$UNIT_HISTORY_STATUS" != "200" ]; then cat /tmp/makereadyos-unit-history.json; exit 1; fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!Array.isArray(body.turns) || body.turns.length < 1 || !Array.isArray(body.events) || body.events.length < 1 || !body.recurringSignals) process.exit(1);' /tmp/makereadyos-unit-history.json
    ARCHIVE_TURN_STATUS="$(curl -s -o /tmp/makereadyos-turn-archive.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/archive")"
    HIDDEN_AFTER_ARCHIVE="$(curl -fsS -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/make-ready-items" | node -e 'let value=""; process.stdin.on("data", (data) => value += data); process.stdin.on("end", () => { const items=JSON.parse(value); process.stdout.write(String(items.some((item) => item.id === process.argv[1]))); });' "$TURN_ITEM_ID")"
    RESTORE_TURN_STATUS="$(curl -s -o /tmp/makereadyos-turn-restore.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/restore")"
    BATCH_ARCHIVE_STATUS="$(curl -s -o /tmp/makereadyos-batch-archive.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"action\":\"ARCHIVE\",\"ids\":[\"$TURN_ITEM_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/batch")"
    BATCH_RESTORE_STATUS="$(curl -s -o /tmp/makereadyos-batch-restore.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"action\":\"RESTORE\",\"ids\":[\"$TURN_ITEM_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/batch")"
    BATCH_INVALID_OPTION_STATUS="$(curl -s -o /tmp/makereadyos-batch-invalid-option.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"action\":\"SET_FIELD\",\"ids\":[\"$TURN_ITEM_ID\"],\"field\":\"makeReadyStatus\",\"value\":\"NOT A MANAGED OPTION\"}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/batch")"
    BATCH_ASSIGN_STATUS="$(curl -s -o /tmp/makereadyos-batch-assign.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"action\":\"ASSIGN_TECH\",\"ids\":[\"$TURN_ITEM_ID\"],\"value\":\"$ADMIN_STAFF_NAME\"}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/batch")"
    NOTIFICATIONS_STATUS="$(curl -s -o /tmp/makereadyos-notifications.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/notifications?limit=1&offset=0")"
    TEST_NOTIFICATION_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.notifications?.[0]?.id || "");' /tmp/makereadyos-notifications.json)"
    READ_NOTIFICATION_STATUS="$(curl -s -o /tmp/makereadyos-notification-read.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/notifications/$TEST_NOTIFICATION_ID/read")"
    DISMISS_NOTIFICATION_STATUS="$(curl -s -o /tmp/makereadyos-notification-dismiss.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X DELETE \
      "http://localhost:${API_PORT:-4000}/api/notifications/$TEST_NOTIFICATION_ID")"
    BATCH_MOVE_STATUS="$(curl -s -o /tmp/makereadyos-batch-move.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"action\":\"MOVE_GROUP\",\"ids\":[\"$TURN_ITEM_ID\"],\"boardGroup\":\"$TEST_DOWN_GROUP\"}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/batch")"
    MOVED_GROUP="$(curl -fsS -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/make-ready-items" | node -e 'let value=""; process.stdin.on("data", (data) => value += data); process.stdin.on("end", () => { const item=JSON.parse(value).find((entry) => entry.id === process.argv[1]); process.stdout.write(item?.boardGroup || ""); });' "$TURN_ITEM_ID")"
    echo "Make-ready create/archive/restore/batch statuses: unit=$CREATE_TURN_UNIT_STATUS item=$CREATE_TURN_STATUS archive=$ARCHIVE_TURN_STATUS restore=$RESTORE_TURN_STATUS batch=$BATCH_ARCHIVE_STATUS/$BATCH_RESTORE_STATUS assign=$BATCH_ASSIGN_STATUS move=$BATCH_MOVE_STATUS group=$MOVED_GROUP invalid-option=$BATCH_INVALID_OPTION_STATUS hidden=$HIDDEN_AFTER_ARCHIVE"
    if [ "$CREATE_TURN_UNIT_STATUS" != "201" ] || [ "$CREATE_TURN_STATUS" != "201" ] || [ "$ARCHIVE_TURN_STATUS" != "200" ] || [ "$RESTORE_TURN_STATUS" != "200" ] || [ "$BATCH_ARCHIVE_STATUS" != "200" ] || [ "$BATCH_RESTORE_STATUS" != "200" ] || [ "$BATCH_ASSIGN_STATUS" != "200" ] || [ "$BATCH_MOVE_STATUS" != "200" ] || [ "$MOVED_GROUP" != "$TEST_DOWN_GROUP" ] || [ "$BATCH_INVALID_OPTION_STATUS" != "400" ] || [ "$HIDDEN_AFTER_ARCHIVE" != "false" ] || [ "$NOTIFICATIONS_STATUS" != "200" ] || [ "$READ_NOTIFICATION_STATUS" != "200" ] || [ "$DISMISS_NOTIFICATION_STATUS" != "200" ]; then
      cat "$TURN_UNIT_JSON" "$TURN_ITEM_JSON" /tmp/makereadyos-turn-archive.json /tmp/makereadyos-turn-restore.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (body.pagination?.limit !== 1 || body.pagination?.offset !== 0 || body.notifications.length > 1) process.exit(1);' /tmp/makereadyos-notifications.json
    ITEM_QUERY_STATUS="$(curl -s -o /tmp/makereadyos-item-query.json -b "$COOKIE_JAR" -w "%{http_code}" --get \
      --data-urlencode "propertyId=$TEST_PROPERTY_ID" --data-urlencode "section=$TEST_DOWN_GROUP" \
      --data-urlencode "updatedSince=2000-01-01T00:00:00.000Z" --data-urlencode "limit=1" --data-urlencode "offset=0" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items")"
    if [ "$ITEM_QUERY_STATUS" != "200" ]; then
      cat /tmp/makereadyos-item-query.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const items=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!Array.isArray(items) || items.length > 1 || items.some((item) => item.propertyId !== process.argv[2] || item.boardGroup !== process.argv[3])) process.exit(1);' /tmp/makereadyos-item-query.json "$TEST_PROPERTY_ID" "$TEST_DOWN_GROUP"
    STRUCTURED_ITEM_HEADERS="$(mktemp)"
    STRUCTURED_ITEM_QUERY_STATUS="$(curl -s -D "$STRUCTURED_ITEM_HEADERS" -o /tmp/makereadyos-structured-item-query.json -b "$COOKIE_JAR" -w "%{http_code}" --get \
      --data-urlencode "propertyId=$TEST_PROPERTY_ID" --data-urlencode "boardSection=type:DOWN" \
      --data-urlencode "assignedTech=$ADMIN_STAFF_NAME" --data-urlencode "includeArchived=true" \
      --data-urlencode "limit=5" --data-urlencode "offset=0" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items")"
    if [ "$STRUCTURED_ITEM_QUERY_STATUS" != "200" ]; then
      cat /tmp/makereadyos-structured-item-query.json
      exit 1
    fi
    for header_name in x-total-count x-limit x-offset x-has-more; do
      if ! grep -qi "^$header_name:" "$STRUCTURED_ITEM_HEADERS"; then
        cat "$STRUCTURED_ITEM_HEADERS"
        echo "ERROR: structured make-ready item query pagination header is missing: $header_name"
        exit 1
      fi
    done
    node -e 'const fs=require("fs"); const items=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!Array.isArray(items) || items.length > 5 || !items.some((item) => item.id === process.argv[2]) || items.some((item) => item.propertyId !== process.argv[3] || item.assignedTech !== process.argv[4] || item.boardGroup !== process.argv[5])) process.exit(1);' /tmp/makereadyos-structured-item-query.json "$TURN_ITEM_ID" "$TEST_PROPERTY_ID" "$ADMIN_STAFF_NAME" "$TEST_DOWN_GROUP"

    echo "Checking real item update webhook event queueing"
    APP_WEBHOOK_JSON="$(mktemp)"
    APP_WEBHOOK_STATUS="$(curl -s -o "$APP_WEBHOOK_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"Smoke app event webhook $TIMESTAMP\",\"url\":\"http://127.0.0.1:9/makereadyos\",\"eventTypes\":[\"item.updated\",\"comment.created\",\"checklist.completed\",\"vendor.assignment.updated\"],\"propertyIds\":[\"$TEST_PROPERTY_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks")"
    APP_WEBHOOK_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).webhook?.id || "");' "$APP_WEBHOOK_JSON")"
    if [ "$APP_WEBHOOK_STATUS" != "201" ] || [ -z "$APP_WEBHOOK_ID" ]; then
      cat "$APP_WEBHOOK_JSON"
      echo "ERROR: application event webhook registration failed"
      exit 1
    fi
    APP_WEBHOOK_PATCH_STATUS="$(curl -s -o /tmp/makereadyos-app-webhook-item-patch.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PATCH \
      -d '{"notes":"QA webhook event queue smoke"}' \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID")"
    if [ "$APP_WEBHOOK_PATCH_STATUS" != "200" ]; then
      cat /tmp/makereadyos-app-webhook-item-patch.json
      echo "ERROR: item patch for webhook queue smoke failed"
      exit 1
    fi
    APP_WEBHOOK_DELIVERIES_STATUS="$(curl -s -o /tmp/makereadyos-app-webhook-deliveries.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks/$APP_WEBHOOK_ID/deliveries?limit=10")"
    if [ "$APP_WEBHOOK_DELIVERIES_STATUS" != "200" ]; then
      cat /tmp/makereadyos-app-webhook-deliveries.json
      echo "ERROR: application event webhook delivery history failed"
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const delivery=body.deliveries?.find((entry)=>entry.eventType==="item.updated" && entry.status==="PENDING"); if (!delivery || delivery.payload?.test || !delivery.payload?.data?.changedKeys?.includes("notes")) process.exit(1);' /tmp/makereadyos-app-webhook-deliveries.json
    WEBHOOK_DELIVERY_TIMEOUT_MS=750 WEBHOOK_DELIVERY_MAX_ATTEMPTS=1 ./run-webhooks.sh >/tmp/makereadyos-app-webhook-run.txt
    APP_WEBHOOK_AFTER_RUN_STATUS="$(curl -s -o /tmp/makereadyos-app-webhook-deliveries-post-run.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks/$APP_WEBHOOK_ID/deliveries?limit=10")"
    if [ "$APP_WEBHOOK_AFTER_RUN_STATUS" != "200" ]; then
      cat /tmp/makereadyos-app-webhook-deliveries-post-run.json
      echo "ERROR: application event webhook delivery history failed"
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const delivery=body.deliveries?.find((entry)=>entry.eventType==="item.updated" && ["FAILED","GAVE_UP"].includes(entry.status)); if (!delivery || !delivery.errorMessage) process.exit(1);' /tmp/makereadyos-app-webhook-deliveries-post-run.json
    APP_WEBHOOK_REVOKE_STATUS="$(curl -s -o /tmp/makereadyos-app-webhook-revoke.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/admin/integrations/webhooks/$APP_WEBHOOK_ID/revoke")"
    if [ "$APP_WEBHOOK_REVOKE_STATUS" != "200" ]; then
      cat /tmp/makereadyos-app-webhook-revoke.json
      echo "ERROR: application event webhook revoke failed"
      exit 1
    fi

    echo "Checking collaboration comments, local attachments, checklists, preferences, and My Work"
    COMMENT_JSON="$(mktemp)"
    COMMENT_CREATE_STATUS="$(curl -s -o "$COMMENT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"body":"QA field update: paint completed and photos pending."}' \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/comments")"
    COMMENT_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).comment?.id || "");' "$COMMENT_JSON")"
    COMMENT_EDIT_STATUS="$(curl -s -o /tmp/makereadyos-comment-edit.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"body":"QA field update: paint completed; final photos attached."}' \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/comments/$COMMENT_ID")"
    ATTACHMENT_FILE="$(mktemp --suffix=.png)"
    printf 'MakeReadyOS QA png attachment\n' >"$ATTACHMENT_FILE"
    INVALID_ATTACHMENT_FILE="$(mktemp --suffix=.html)"
    printf '<script>unsafe attachment type</script>\n' >"$INVALID_ATTACHMENT_FILE"
    INVALID_ATTACHMENT_STATUS="$(curl -s -o /tmp/makereadyos-attachment-invalid.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -F "file=@$INVALID_ATTACHMENT_FILE;type=text/html" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/attachments")"
    ATTACHMENT_JSON="$(mktemp)"
    ATTACHMENT_CREATE_STATUS="$(curl -s -o "$ATTACHMENT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -F "file=@$ATTACHMENT_FILE;type=image/png" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/attachments")"
    ATTACHMENT_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).attachment?.id || "");' "$ATTACHMENT_JSON")"
    CHARGE_PRICE_JSON="$(mktemp)"
    CHARGE_PRICE_STATUS="$(curl -s -o "$CHARGE_PRICE_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"name\":\"QA Blind Replacement $TIMESTAMP\",\"category\":\"Damage\",\"unitLabel\":\"each\",\"defaultCents\":4500}" \
      "http://localhost:${API_PORT:-4000}/api/charge-price-sheet-items")"
    CHARGE_PRICE_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).item?.id || "");' "$CHARGE_PRICE_JSON")"
    ATTACHMENT_METADATA_STATUS="$(curl -s -o /tmp/makereadyos-attachment-metadata.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d "{\"note\":\"Initial walk damage photo\",\"inspectionStage\":\"INITIAL_WALK\",\"category\":\"Damage\",\"chargeCandidate\":true,\"chargeNote\":\"Review for resident chargeback\",\"chargePriceSheetItemId\":\"$CHARGE_PRICE_ID\",\"chargeQuantity\":1,\"chargeEstimatedCents\":4500}" \
      "http://localhost:${API_PORT:-4000}/api/attachments/$ATTACHMENT_ID")"
    ATTACHMENT_MARKUP_STATUS="$(curl -s -o /tmp/makereadyos-attachment-markup.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d "{\"markupAnnotations\":[{\"id\":\"pin-qa-1\",\"x\":42.5,\"y\":58.25,\"label\":\"Wall damage\",\"category\":\"Damage\",\"chargeCandidate\":true,\"chargePriceSheetItemId\":\"$CHARGE_PRICE_ID\",\"chargePriceSheetItemName\":\"QA Blind Replacement $TIMESTAMP\",\"chargeQuantity\":1,\"chargeEstimatedCents\":4500}]}" \
      "http://localhost:${API_PORT:-4000}/api/attachments/$ATTACHMENT_ID")"
    ATTACHMENT_DOWNLOAD_STATUS="$(curl -s -o /tmp/makereadyos-attachment-download.txt -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/attachments/$ATTACHMENT_ID/download")"
    ATTACHMENT_ARCHIVE_STATUS="$(curl -s -o /tmp/makereadyos-attachment-archive.zip -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/attachments/archive?stage=INITIAL_WALK")"
    TEMPLATE_JSON="$(mktemp)"
    TEMPLATE_STATUS="$(curl -s -o "$TEMPLATE_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"name\":\"QA Final Walk $TIMESTAMP\",\"items\":[{\"title\":\"Verify finish photos\",\"required\":true},{\"title\":\"Confirm keys\",\"required\":true}]}" \
      "http://localhost:${API_PORT:-4000}/api/checklist-templates")"
    TEMPLATE_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).template?.id || "");' "$TEMPLATE_JSON")"
    INSTANCE_JSON="$(mktemp)"
    INSTANCE_STATUS="$(curl -s -o "$INSTANCE_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"templateId\":\"$TEMPLATE_ID\"}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/checklists")"
    CHECKLIST_ITEM_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).instance?.items?.[0]?.id || "");' "$INSTANCE_JSON")"
    CHECKLIST_COMPLETE_STATUS="$(curl -s -o /tmp/makereadyos-checklist-complete.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"completed":true}' "http://localhost:${API_PORT:-4000}/api/checklist-items/$CHECKLIST_ITEM_ID")"
    COLLAB_STATUS="$(curl -s -o /tmp/makereadyos-collaboration.json -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/collaboration?commentLimit=1&attachmentLimit=1&checklistLimit=1")"
    CHARGE_REPORT_STATUS="$(curl -s -o /tmp/makereadyos-charge-report.json -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/charge-report")"
    CHARGE_REPORT_CSV_STATUS="$(curl -s -o /tmp/makereadyos-charge-report.csv -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID/charge-report.csv")"
    PREF_STATUS="$(curl -s -o /tmp/makereadyos-pref.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"enabled":false}' "http://localhost:${API_PORT:-4000}/api/notifications/preferences/COMMENT")"
    MY_WORK_STATUS="$(curl -s -o /tmp/makereadyos-my-work.json -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/my-work")"
    ATTACHMENT_DELETE_STATUS="$(curl -s -o /tmp/makereadyos-attachment-delete.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X DELETE "http://localhost:${API_PORT:-4000}/api/attachments/$ATTACHMENT_ID")"
    rm -f "$ATTACHMENT_FILE" "$INVALID_ATTACHMENT_FILE"
    echo "Collaboration statuses: comment=$COMMENT_CREATE_STATUS/$COMMENT_EDIT_STATUS attachment=$INVALID_ATTACHMENT_STATUS/$ATTACHMENT_CREATE_STATUS price=$CHARGE_PRICE_STATUS metadata=$ATTACHMENT_METADATA_STATUS markup=$ATTACHMENT_MARKUP_STATUS download=$ATTACHMENT_DOWNLOAD_STATUS archive=$ATTACHMENT_ARCHIVE_STATUS chargeReport=$CHARGE_REPORT_STATUS/$CHARGE_REPORT_CSV_STATUS delete=$ATTACHMENT_DELETE_STATUS template=$TEMPLATE_STATUS instance=$INSTANCE_STATUS complete=$CHECKLIST_COMPLETE_STATUS collaboration=$COLLAB_STATUS preference=$PREF_STATUS work=$MY_WORK_STATUS"
    if [ "$COMMENT_CREATE_STATUS" != "201" ] || [ "$COMMENT_EDIT_STATUS" != "200" ] || [ "$INVALID_ATTACHMENT_STATUS" != "415" ] || [ "$ATTACHMENT_CREATE_STATUS" != "201" ] || [ "$CHARGE_PRICE_STATUS" != "201" ] || [ "$ATTACHMENT_METADATA_STATUS" != "200" ] || [ "$ATTACHMENT_MARKUP_STATUS" != "200" ] || [ "$ATTACHMENT_DOWNLOAD_STATUS" != "200" ] || [ "$ATTACHMENT_ARCHIVE_STATUS" != "200" ] || [ "$CHARGE_REPORT_STATUS" != "200" ] || [ "$CHARGE_REPORT_CSV_STATUS" != "200" ] || [ ! -s /tmp/makereadyos-attachment-archive.zip ] || [ ! -s /tmp/makereadyos-charge-report.csv ] || [ "$ATTACHMENT_DELETE_STATUS" != "200" ] || [ "$TEMPLATE_STATUS" != "201" ] || [ "$INSTANCE_STATUS" != "201" ] || [ "$CHECKLIST_COMPLETE_STATUS" != "200" ] || [ "$COLLAB_STATUS" != "200" ] || [ "$PREF_STATUS" != "200" ] || [ "$MY_WORK_STATUS" != "200" ]; then
      cat "$COMMENT_JSON" "$ATTACHMENT_JSON" "$CHARGE_PRICE_JSON" /tmp/makereadyos-attachment-metadata.json /tmp/makereadyos-attachment-markup.json /tmp/makereadyos-charge-report.json "$TEMPLATE_JSON" "$INSTANCE_JSON" /tmp/makereadyos-collaboration.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const created=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).attachment; const body=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); if (!created?.storedName?.startsWith("qa-property-uploads/") || !body.comments.some((comment) => comment.body.includes("final photos")) || !body.attachments.some((attachment) => attachment.inspectionStage === "INITIAL_WALK" && attachment.category === "Damage" && attachment.chargeCandidate === true && attachment.chargeEstimatedCents === 4500 && attachment.chargePriceSheetItem?.name?.includes("QA Blind Replacement") && Array.isArray(attachment.markupAnnotations) && attachment.markupAnnotations.some((pin) => pin.label === "Wall damage" && pin.chargeCandidate === true && pin.chargePriceSheetItemId && pin.chargePriceSheetItemName?.includes("QA Blind Replacement") && pin.chargeQuantity === 1 && pin.chargeEstimatedCents === 4500)) || !body.checklistInstances.some((instance) => instance.items.some((item) => item.completed)) || body.pagination?.comments?.limit !== 1 || body.pagination?.attachments?.limit !== 1) process.exit(1);' "$ATTACHMENT_JSON" /tmp/makereadyos-collaboration.json
    node -e 'const fs=require("fs"); const report=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (report.summary?.fileCount !== 1 || report.summary?.pinCount !== 1 || report.summary?.lineCount !== 2 || report.summary?.totalEstimatedCents !== 9000 || !report.lines?.some((line) => line.type === "PIN" && line.label === "Wall damage" && line.priceSheetItemName?.includes("QA Blind Replacement") && line.estimatedCents === 4500)) process.exit(1);' /tmp/makereadyos-charge-report.json
    node -e 'const fs=require("fs"); const csv=fs.readFileSync(process.argv[1],"utf8"); if (!csv.includes("Property,Unit,Type") || !csv.includes("Wall damage") || !csv.includes("QA Blind Replacement") || !csv.includes("90.00")) process.exit(1);' /tmp/makereadyos-charge-report.csv

    echo "Checking workload planning assignment and coverage foundation"
    PLANNING_BEFORE_STATUS="$(curl -s -o /tmp/makereadyos-planning-before.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/planning?propertyId=$TEST_PROPERTY_ID")"
    CAPACITY_STATUS="$(curl -s -o /tmp/makereadyos-capacity.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PUT \
      -d '{"defaultDailyHours":1,"tradeCategories":["QA"],"unavailableDays":[]}' \
      "http://localhost:${API_PORT:-4000}/api/planning/capacities/$ADMIN_USER_ID")"
    WORK_BLOCK_JSON="$(mktemp)"
    WORK_BLOCK_STATUS="$(curl -s -o "$WORK_BLOCK_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"assignedUserId\":\"$ADMIN_USER_ID\",\"itemId\":\"$TURN_ITEM_ID\",\"category\":\"Make Ready\",\"plannedDate\":\"$PLANNING_TEST_DATE\",\"estimatedHours\":2,\"notes\":\"QA planned work\"}" \
      "http://localhost:${API_PORT:-4000}/api/planning/blocks")"
    WORK_BLOCK_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.block?.id || "");' "$WORK_BLOCK_JSON")"
    WORK_BLOCK_UPDATE_STATUS="$(curl -s -o /tmp/makereadyos-work-block-update.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"status":"IN_PROGRESS","actualHours":0.5}' \
      "http://localhost:${API_PORT:-4000}/api/planning/blocks/$WORK_BLOCK_ID")"
    PLANNING_AFTER_STATUS="$(curl -s -o /tmp/makereadyos-planning-after.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/planning?propertyId=$TEST_PROPERTY_ID")"
    MY_WORK_PLANNING_STATUS="$(curl -s -o /tmp/makereadyos-my-work-planning.json -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/my-work")"
    DASHBOARD_PLANNING_STATUS="$(curl -s -o /tmp/makereadyos-dashboard-planning.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/dashboard?propertyId=$TEST_PROPERTY_ID")"
    echo "Planning statuses: list=$PLANNING_BEFORE_STATUS/$PLANNING_AFTER_STATUS capacity=$CAPACITY_STATUS block=$WORK_BLOCK_STATUS/$WORK_BLOCK_UPDATE_STATUS my-work=$MY_WORK_PLANNING_STATUS dashboard=$DASHBOARD_PLANNING_STATUS"
    if [ "$PLANNING_BEFORE_STATUS" != "200" ] || [ "$CAPACITY_STATUS" != "200" ] || [ "$WORK_BLOCK_STATUS" != "201" ] || [ "$WORK_BLOCK_UPDATE_STATUS" != "200" ] || [ "$PLANNING_AFTER_STATUS" != "200" ] || [ "$MY_WORK_PLANNING_STATUS" != "200" ] || [ "$DASHBOARD_PLANNING_STATUS" != "200" ]; then
      cat /tmp/makereadyos-planning-before.json "$WORK_BLOCK_JSON" /tmp/makereadyos-planning-after.json /tmp/makereadyos-dashboard-planning.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.blocks?.length || body.summary?.plannedBlocks < 1 || body.summary?.moveInsNotCovered === undefined) process.exit(1);' /tmp/makereadyos-planning-after.json
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.items?.some((item) => item.workAssignmentBlocks?.length)) process.exit(1);' /tmp/makereadyos-my-work-planning.json
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (typeof body.kpis?.plannedWorkBlocks !== "number" || typeof body.kpis?.unplannedMoveIns !== "number") process.exit(1);' /tmp/makereadyos-dashboard-planning.json

    echo "Checking vendor directory and assignment lifecycle"
    VENDOR_JSON="$(mktemp)"
    VENDOR_CREATE_STATUS="$(curl -s -o "$VENDOR_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"QA Vendor $TIMESTAMP\",\"trade\":\"Flooring\",\"phone\":\"555-0199\",\"email\":\"qa-vendor@example.test\",\"isPreferred\":true,\"propertyIds\":[\"$TEST_PROPERTY_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/vendors")"
    VENDOR_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).vendor?.id || "");' "$VENDOR_JSON")"
    VENDOR_LIST_STATUS="$(curl -s -o /tmp/makereadyos-vendor-list.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/vendors?propertyId=$TEST_PROPERTY_ID&includeArchived=true")"
    ASSIGNMENT_JSON="$(mktemp)"
    ASSIGNMENT_CREATE_STATUS="$(curl -s -o "$ASSIGNMENT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"vendorId\":\"$VENDOR_ID\",\"itemId\":\"$TURN_ITEM_ID\",\"trade\":\"Flooring\",\"status\":\"SCHEDULED\",\"scheduledDate\":\"2026-06-04\",\"dueDate\":\"2026-06-05\",\"notes\":\"QA vendor work\"}" \
      "http://localhost:${API_PORT:-4000}/api/vendor-assignments")"
    ASSIGNMENT_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).assignment?.id || "");' "$ASSIGNMENT_JSON")"
    ASSIGNMENT_LIST_STATUS="$(curl -s -o /tmp/makereadyos-vendor-assignment-list.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/vendor-assignments?itemId=$TURN_ITEM_ID&includeCompleted=true")"
    ASSIGNMENT_UPDATE_STATUS="$(curl -s -o /tmp/makereadyos-vendor-assignment-update.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"status":"FOLLOW_UP_NEEDED","notes":"QA follow-up needed"}' \
      "http://localhost:${API_PORT:-4000}/api/vendor-assignments/$ASSIGNMENT_ID")"
    ASSIGNMENT_COMPLETE_STATUS="$(curl -s -o /tmp/makereadyos-vendor-assignment-complete.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/vendor-assignments/$ASSIGNMENT_ID/complete")"
    VENDOR_ARCHIVE_STATUS="$(curl -s -o /tmp/makereadyos-vendor-archive.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/vendors/$VENDOR_ID/archive")"
    VENDOR_RESTORE_STATUS="$(curl -s -o /tmp/makereadyos-vendor-restore.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/vendors/$VENDOR_ID/restore")"
    DASHBOARD_VENDOR_STATUS="$(curl -s -o /tmp/makereadyos-dashboard-vendors.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/dashboard?propertyId=$TEST_PROPERTY_ID")"
    echo "Vendor statuses: create=$VENDOR_CREATE_STATUS list=$VENDOR_LIST_STATUS assignment=$ASSIGNMENT_CREATE_STATUS/$ASSIGNMENT_LIST_STATUS update=$ASSIGNMENT_UPDATE_STATUS complete=$ASSIGNMENT_COMPLETE_STATUS archive=$VENDOR_ARCHIVE_STATUS restore=$VENDOR_RESTORE_STATUS dashboard=$DASHBOARD_VENDOR_STATUS"
    if [ "$VENDOR_CREATE_STATUS" != "201" ] || [ "$VENDOR_LIST_STATUS" != "200" ] || [ "$ASSIGNMENT_CREATE_STATUS" != "201" ] || [ "$ASSIGNMENT_LIST_STATUS" != "200" ] || [ "$ASSIGNMENT_UPDATE_STATUS" != "200" ] || [ "$ASSIGNMENT_COMPLETE_STATUS" != "200" ] || [ "$VENDOR_ARCHIVE_STATUS" != "200" ] || [ "$VENDOR_RESTORE_STATUS" != "200" ] || [ "$DASHBOARD_VENDOR_STATUS" != "200" ]; then
      cat "$VENDOR_JSON" "$ASSIGNMENT_JSON" /tmp/makereadyos-vendor-assignment-update.json /tmp/makereadyos-dashboard-vendors.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.vendors?.some((vendor) => vendor.name.includes("QA Vendor"))) process.exit(1);' /tmp/makereadyos-vendor-list.json
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.assignments?.some((assignment) => assignment.vendor.name.includes("QA Vendor"))) process.exit(1);' /tmp/makereadyos-vendor-assignment-list.json

    echo "Checking pool/spa log setup, chemistry evaluation, and CSV export"
    POOL_FACILITY_JSON="$(mktemp)"
    POOL_FACILITY_STATUS="$(curl -s -o "$POOL_FACILITY_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"name\":\"QA Pool $TIMESTAMP\",\"type\":\"POOL\",\"capacityGallons\":12000,\"surfaceType\":\"Plaster\",\"notes\":\"QA daily pool log\"}" \
      "http://localhost:${API_PORT:-4000}/api/pool/facilities")"
    POOL_FACILITY_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).facility?.id || "");' "$POOL_FACILITY_JSON")"
    POOL_CHEMICAL_JSON="$(mktemp)"
    POOL_CHEMICAL_STATUS="$(curl -s -o "$POOL_CHEMICAL_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"name\":\"QA Cal-Hypo $TIMESTAMP\",\"category\":\"CHLORINE\",\"concentrationPercent\":65,\"unit\":\"POUNDS\",\"notes\":\"QA chlorine\"}" \
      "http://localhost:${API_PORT:-4000}/api/pool/chemicals")"
    POOL_CHEMICAL_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).chemical?.id || "");' "$POOL_CHEMICAL_JSON")"
    POOL_ENTRY_JSON="$(mktemp)"
    POOL_ENTRY_STATUS="$(curl -s -o "$POOL_ENTRY_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"facilityId\":\"$POOL_FACILITY_ID\",\"logDate\":\"$PLANNING_TEST_DATE\",\"logTime\":\"09:30\",\"ph\":8.1,\"freeChlorine\":0.5,\"combinedChlorine\":0.4,\"totalChlorine\":0.9,\"totalAlkalinity\":70,\"cyanuricAcid\":25,\"calciumHardness\":180,\"waterTemperature\":82,\"vacuumed\":true,\"skimmerCleaned\":true,\"pumpRunning\":true,\"filterOperating\":true,\"waterCloudy\":true,\"notes\":\"QA pool check\",\"safetyChecks\":[{\"label\":\"Gate/self-closing latch checked\",\"value\":\"FAIL\",\"notes\":\"QA latch issue\",\"sortOrder\":0}],\"chemicalAdditions\":[{\"chemicalId\":\"$POOL_CHEMICAL_ID\",\"chemicalName\":\"QA Cal-Hypo $TIMESTAMP\",\"amount\":70,\"unit\":\"OUNCES\",\"notes\":\"QA addition\"}]}" \
      "http://localhost:${API_PORT:-4000}/api/pool/entries")"
    POOL_ENTRY_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).entry?.id || "");' "$POOL_ENTRY_JSON")"
    POOL_OVERVIEW_STATUS="$(curl -s -o /tmp/makereadyos-pool-overview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pool/overview?propertyId=$TEST_PROPERTY_ID")"
    POOL_ENTRIES_STATUS="$(curl -s -o /tmp/makereadyos-pool-entries.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pool/entries?propertyId=$TEST_PROPERTY_ID&limit=5&offset=0")"
    POOL_EXPORT_STATUS="$(curl -s -o /tmp/makereadyos-pool-log.csv -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pool/export.csv?propertyId=$TEST_PROPERTY_ID")"
    POOL_REPORT_STATUS="$(curl -s -o /tmp/makereadyos-pool-report.html -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pool/report.html?propertyId=$TEST_PROPERTY_ID")"
    POOL_ATTACHMENT_FILE="$(mktemp --suffix=.png)"
    printf 'MakeReadyOS QA pool photo\n' >"$POOL_ATTACHMENT_FILE"
    POOL_ATTACHMENT_JSON="$(mktemp)"
    POOL_ATTACHMENT_STATUS="$(curl -s -o "$POOL_ATTACHMENT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -F "file=@$POOL_ATTACHMENT_FILE;type=image/png" \
      "http://localhost:${API_PORT:-4000}/api/pool/entries/$POOL_ENTRY_ID/attachments")"
    POOL_ATTACHMENT_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).attachment?.id || "");' "$POOL_ATTACHMENT_JSON")"
    POOL_ATTACHMENT_DOWNLOAD_STATUS="$(curl -s -o /tmp/makereadyos-pool-attachment-download.png -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pool/attachments/$POOL_ATTACHMENT_ID/download")"
    POOL_ATTACHMENT_DELETE_STATUS="$(curl -s -o /tmp/makereadyos-pool-attachment-delete.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X DELETE \
      "http://localhost:${API_PORT:-4000}/api/pool/attachments/$POOL_ATTACHMENT_ID")"
    POOL_REVIEW_NOTIFICATION_STATUS="$(curl -s -o /tmp/makereadyos-pool-notifications.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/notifications?limit=25&offset=0")"
    rm -f "$POOL_ATTACHMENT_FILE"
    echo "Pool Log statuses: facility=$POOL_FACILITY_STATUS chemical=$POOL_CHEMICAL_STATUS entry=$POOL_ENTRY_STATUS overview=$POOL_OVERVIEW_STATUS entries=$POOL_ENTRIES_STATUS export=$POOL_EXPORT_STATUS report=$POOL_REPORT_STATUS attachment=$POOL_ATTACHMENT_STATUS/$POOL_ATTACHMENT_DOWNLOAD_STATUS/$POOL_ATTACHMENT_DELETE_STATUS notifications=$POOL_REVIEW_NOTIFICATION_STATUS"
    if [ "$POOL_FACILITY_STATUS" != "201" ] || [ "$POOL_CHEMICAL_STATUS" != "201" ] || [ "$POOL_ENTRY_STATUS" != "201" ] || [ "$POOL_OVERVIEW_STATUS" != "200" ] || [ "$POOL_ENTRIES_STATUS" != "200" ] || [ "$POOL_EXPORT_STATUS" != "200" ] || [ "$POOL_REPORT_STATUS" != "200" ] || [ "$POOL_ATTACHMENT_STATUS" != "201" ] || [ "$POOL_ATTACHMENT_DOWNLOAD_STATUS" != "200" ] || [ "$POOL_ATTACHMENT_DELETE_STATUS" != "200" ] || [ "$POOL_REVIEW_NOTIFICATION_STATUS" != "200" ]; then
      cat "$POOL_FACILITY_JSON" "$POOL_CHEMICAL_JSON" "$POOL_ENTRY_JSON" /tmp/makereadyos-pool-overview.json /tmp/makereadyos-pool-entries.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const entry=body.entry; if (!entry?.evaluationJson?.issues?.length || entry.evaluationJson.status !== "REVIEW" || !entry.evaluationJson.dosage?.length) process.exit(1);' "$POOL_ENTRY_JSON"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const addition=body.entry?.chemicalAdditions?.[0]; if (!addition || addition.amount !== 70 || addition.unit !== "OUNCES") process.exit(1);' "$POOL_ENTRY_JSON"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-pool-overview.json","utf8")); if (body.summary?.logsToday < 1 || body.summary?.safetyFailures < 1 || body.summary?.chemistryIssues < 1) process.exit(1);'
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-pool-entries.json","utf8")); if (!body.entries?.some((entry) => entry.facility?.name?.includes("QA Pool")) || typeof body.pagination?.total !== "number") process.exit(1);'
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.attachment?.storedName?.includes("pool-log/") || body.attachment?.originalName?.length < 1) process.exit(1);' "$POOL_ATTACHMENT_JSON"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.notifications?.some((notification) => notification.title?.includes("Pool review needed"))) process.exit(1);' /tmp/makereadyos-pool-notifications.json
    if ! grep -q "MakeReadyOS Pool Log Report" /tmp/makereadyos-pool-report.html || ! grep -q "QA Pool" /tmp/makereadyos-pool-report.html; then
      cat /tmp/makereadyos-pool-report.html
      echo "ERROR: Pool Log printable report did not include the expected entry"
      exit 1
    fi
    if ! grep -q "QA Pool" /tmp/makereadyos-pool-log.csv; then
      cat /tmp/makereadyos-pool-log.csv
      echo "ERROR: Pool Log CSV export did not include the test entry"
      exit 1
    fi
    if ! grep -q "4 lb 6 oz" /tmp/makereadyos-pool-log.csv || ! grep -q "4 lb 6 oz" /tmp/makereadyos-pool-report.html; then
      cat /tmp/makereadyos-pool-log.csv /tmp/makereadyos-pool-report.html
      echo "ERROR: Pool Log solid chemical additions did not normalize ounces into pounds/ounces"
      exit 1
    fi

    echo "Checking property wiki overview, entries, vendors, uploads, and search"
    PROPERTY_WIKI_PROFILE_STATUS="$(curl -s -o /tmp/makereadyos-wiki-profile.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"address\":\"123 QA Way\",\"unitCount\":24,\"buildingCount\":4,\"officePhone\":\"555-0100\",\"afterHoursPhone\":\"555-0199\",\"propertyManager\":\"QA Manager\",\"maintenanceSupervisor\":\"QA Supervisor\",\"regionalManager\":\"QA Regional\",\"generalNotes\":\"Main water shutoff in building 1 riser room\"}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/profile")"
    PROPERTY_WIKI_ENTRY_JSON="$(mktemp)"
    PROPERTY_WIKI_ENTRY_STATUS="$(curl -s -o "$PROPERTY_WIKI_ENTRY_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"section\":\"UTILITIES\",\"title\":\"QA Main Water Shutoff $TIMESTAMP\",\"category\":\"Domestic Water Shutoffs\",\"locationDescription\":\"Behind leasing office panel\",\"notes\":\"Turn clockwise and notify office\",\"tags\":[\"water\",\"critical\"],\"isPinned\":true}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/entries")"
    PROPERTY_WIKI_ENTRY_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).entry?.id || "");' "$PROPERTY_WIKI_ENTRY_JSON")"
    PROPERTY_WIKI_VENDOR_JSON="$(mktemp)"
    PROPERTY_WIKI_VENDOR_STATUS="$(curl -s -o "$PROPERTY_WIKI_VENDOR_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"vendorType\":\"Plumbing\",\"companyName\":\"QA Plumbing $TIMESTAMP\",\"contactName\":\"QA Contact\",\"phone\":\"555-0200\",\"email\":\"qa-plumbing@example.com\",\"emergencyPhone\":\"555-0201\",\"notes\":\"24/7 emergency vendor\"}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/vendors")"
    PROPERTY_WIKI_VENDOR_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).vendor?.id || "");' "$PROPERTY_WIKI_VENDOR_JSON")"
    PROPERTY_WIKI_FILE="$(mktemp --suffix=.txt)"
    printf 'QA Property Wiki site map note\n' >"$PROPERTY_WIKI_FILE"
    PROPERTY_WIKI_ASSET_JSON="$(mktemp)"
    PROPERTY_WIKI_ASSET_STATUS="$(curl -s -o "$PROPERTY_WIKI_ASSET_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -F "propertyId=$TEST_PROPERTY_ID" \
      -F "kind=DOCUMENT" \
      -F "title=QA Site Map Doc $TIMESTAMP" \
      -F "category=Site Maps" \
      -F "description=Wiki upload smoke" \
      -F "tags=site map, wiki" \
      -F "entryId=$PROPERTY_WIKI_ENTRY_ID" \
      -F "vendorId=$PROPERTY_WIKI_VENDOR_ID" \
      -F "file=@$PROPERTY_WIKI_FILE;type=text/plain" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/assets/upload")"
    PROPERTY_WIKI_ASSET_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).asset?.id || "");' "$PROPERTY_WIKI_ASSET_JSON")"
    PROPERTY_WIKI_OVERVIEW_STATUS="$(curl -s -o /tmp/makereadyos-wiki-overview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/overview?propertyId=$TEST_PROPERTY_ID")"
    PROPERTY_WIKI_ENTRY_LIST_STATUS="$(curl -s -o /tmp/makereadyos-wiki-entries.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/entries?propertyId=$TEST_PROPERTY_ID&section=UTILITIES")"
    PROPERTY_WIKI_VENDOR_LIST_STATUS="$(curl -s -o /tmp/makereadyos-wiki-vendors.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/vendors?propertyId=$TEST_PROPERTY_ID")"
    PROPERTY_WIKI_ASSET_LIST_STATUS="$(curl -s -o /tmp/makereadyos-wiki-assets.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/assets?propertyId=$TEST_PROPERTY_ID&kind=DOCUMENT")"
    PROPERTY_WIKI_SEARCH_STATUS="$(curl -s -o /tmp/makereadyos-wiki-search.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/search?propertyId=$TEST_PROPERTY_ID&q=water")"
    PROPERTY_WIKI_DOWNLOAD_STATUS="$(curl -s -o /tmp/makereadyos-wiki-download.txt -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/assets/$PROPERTY_WIKI_ASSET_ID/download")"
    PROPERTY_WIKI_DELETE_STATUS="$(curl -s -o /tmp/makereadyos-wiki-delete.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X DELETE \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/assets/$PROPERTY_WIKI_ASSET_ID")"
    rm -f "$PROPERTY_WIKI_FILE"
    echo "Property Wiki statuses: profile=$PROPERTY_WIKI_PROFILE_STATUS entry=$PROPERTY_WIKI_ENTRY_STATUS vendor=$PROPERTY_WIKI_VENDOR_STATUS asset=$PROPERTY_WIKI_ASSET_STATUS overview=$PROPERTY_WIKI_OVERVIEW_STATUS entries=$PROPERTY_WIKI_ENTRY_LIST_STATUS vendors=$PROPERTY_WIKI_VENDOR_LIST_STATUS assets=$PROPERTY_WIKI_ASSET_LIST_STATUS search=$PROPERTY_WIKI_SEARCH_STATUS download=$PROPERTY_WIKI_DOWNLOAD_STATUS delete=$PROPERTY_WIKI_DELETE_STATUS"
    if [ "$PROPERTY_WIKI_PROFILE_STATUS" != "200" ] || [ "$PROPERTY_WIKI_ENTRY_STATUS" != "201" ] || [ "$PROPERTY_WIKI_VENDOR_STATUS" != "201" ] || [ "$PROPERTY_WIKI_ASSET_STATUS" != "201" ] || [ "$PROPERTY_WIKI_OVERVIEW_STATUS" != "200" ] || [ "$PROPERTY_WIKI_ENTRY_LIST_STATUS" != "200" ] || [ "$PROPERTY_WIKI_VENDOR_LIST_STATUS" != "200" ] || [ "$PROPERTY_WIKI_ASSET_LIST_STATUS" != "200" ] || [ "$PROPERTY_WIKI_SEARCH_STATUS" != "200" ] || [ "$PROPERTY_WIKI_DOWNLOAD_STATUS" != "200" ] || [ "$PROPERTY_WIKI_DELETE_STATUS" != "200" ]; then
      cat /tmp/makereadyos-wiki-profile.json "$PROPERTY_WIKI_ENTRY_JSON" "$PROPERTY_WIKI_VENDOR_JSON" "$PROPERTY_WIKI_ASSET_JSON" /tmp/makereadyos-wiki-overview.json /tmp/makereadyos-wiki-search.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-wiki-overview.json","utf8")); if (!body.profile?.propertyManager?.includes("QA Manager") || !body.pinnedCriticalInformation?.some((entry) => entry.title.includes("QA Main Water Shutoff")) || !body.recentDocuments?.some((asset) => asset.title.includes("QA Site Map Doc"))) process.exit(1);'
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-wiki-entries.json","utf8")); if (!body.entries?.some((entry) => entry.category === "Domestic Water Shutoffs" && entry.tags?.includes("critical"))) process.exit(1);'
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-wiki-vendors.json","utf8")); if (!body.vendors?.some((vendor) => vendor.companyName.includes("QA Plumbing"))) process.exit(1);'
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-wiki-assets.json","utf8")); if (!body.assets?.some((asset) => asset.originalName.endsWith(".txt") && asset.entry?.title?.includes("QA Main Water Shutoff"))) process.exit(1);'
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-wiki-search.json","utf8")); if (!body.results?.some((result) => result.section === "UTILITIES" && result.title.includes("QA Main Water Shutoff"))) process.exit(1);'

    echo "Checking preventive maintenance templates, tasks, completion, reports, and wiki references"
    PM_TEMPLATE_JSON="$(mktemp)"
    PM_TEMPLATE_STATUS="$(curl -s -o "$PM_TEMPLATE_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"name\":\"QA Pool Filter Cleaning $TIMESTAMP\",\"category\":\"Pool\",\"description\":\"Monthly pool PM\",\"instructions\":\"Check pressure and clean the filter.\",\"frequency\":\"Monthly\",\"assignedRole\":\"TECH\",\"photosRequired\":true,\"notesRequired\":true,\"passFailRequired\":true,\"priority\":\"High\"}" \
      "http://localhost:${API_PORT:-4000}/api/pm/templates")"
    PM_TEMPLATE_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).template?.id || "");' "$PM_TEMPLATE_JSON")"
    PM_OVERVIEW_STATUS="$(curl -s -o /tmp/makereadyos-pm-overview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pm/overview?propertyId=$TEST_PROPERTY_ID")"
    PM_TASKS_STATUS="$(curl -s -o /tmp/makereadyos-pm-tasks.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pm/tasks?propertyId=$TEST_PROPERTY_ID")"
    PM_TASK_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.tasks?.[0]?.id || "");' /tmp/makereadyos-pm-tasks.json)"
    PM_REFERENCE_STATUS="$(curl -s -o /tmp/makereadyos-pm-reference.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"recordType\":\"PM_TEMPLATE\",\"recordId\":\"$PM_TEMPLATE_ID\",\"targetType\":\"ENTRY\",\"targetId\":\"$PROPERTY_WIKI_ENTRY_ID\"}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/references")"
    PM_WIKI_CONTEXT_STATUS="$(curl -s -o /tmp/makereadyos-pm-wiki-context.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-wiki/context?module=PREVENTIVE_MAINTENANCE&propertyId=$TEST_PROPERTY_ID&recordType=PM_TEMPLATE&recordId=$PM_TEMPLATE_ID")"
    PM_FILE="$(mktemp --suffix=.png)"
    printf 'pm-photo' >"$PM_FILE"
    PM_ATTACHMENT_JSON="$(mktemp)"
    PM_ATTACHMENT_STATUS="$(curl -s -o "$PM_ATTACHMENT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -F "file=@$PM_FILE;type=image/png;filename=pm-photo.png" \
      "http://localhost:${API_PORT:-4000}/api/pm/tasks/$PM_TASK_ID/attachments")"
    PM_ATTACHMENT_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).attachment?.id || "");' "$PM_ATTACHMENT_JSON")"
    PM_ATTACHMENT_DOWNLOAD_STATUS="$(curl -s -o /tmp/makereadyos-pm-download.bin -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pm/attachments/$PM_ATTACHMENT_ID/download")"
    PM_COMPLETE_JSON="$(mktemp)"
    PM_COMPLETE_STATUS="$(curl -s -o "$PM_COMPLETE_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"outcome":"PASS","notes":"QA PM completion note"}' \
      "http://localhost:${API_PORT:-4000}/api/pm/tasks/$PM_TASK_ID/complete")"
    PM_HISTORY_STATUS="$(curl -s -o /tmp/makereadyos-pm-history.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pm/history?propertyId=$TEST_PROPERTY_ID")"
    PM_CALENDAR_STATUS="$(curl -s -o /tmp/makereadyos-pm-calendar.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pm/calendar?propertyId=$TEST_PROPERTY_ID")"
    PM_EXPORT_STATUS="$(curl -s -o /tmp/makereadyos-pm-export.csv -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pm/export.csv?propertyId=$TEST_PROPERTY_ID")"
    PM_EXCEL_STATUS="$(curl -s -o /tmp/makereadyos-pm-export.xls -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pm/export.xls?propertyId=$TEST_PROPERTY_ID")"
    PM_REPORT_STATUS="$(curl -s -o /tmp/makereadyos-pm-report.html -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/pm/report.html?propertyId=$TEST_PROPERTY_ID")"
    rm -f "$PM_FILE"
    echo "Preventive Maintenance statuses: template=$PM_TEMPLATE_STATUS overview=$PM_OVERVIEW_STATUS tasks=$PM_TASKS_STATUS wikiRef=$PM_REFERENCE_STATUS wikiContext=$PM_WIKI_CONTEXT_STATUS attachment=$PM_ATTACHMENT_STATUS/$PM_ATTACHMENT_DOWNLOAD_STATUS complete=$PM_COMPLETE_STATUS history=$PM_HISTORY_STATUS calendar=$PM_CALENDAR_STATUS export=$PM_EXPORT_STATUS excel=$PM_EXCEL_STATUS report=$PM_REPORT_STATUS"
    if [ "$PM_TEMPLATE_STATUS" != "201" ] || [ "$PM_OVERVIEW_STATUS" != "200" ] || [ "$PM_TASKS_STATUS" != "200" ] || [ "$PM_REFERENCE_STATUS" != "201" ] || [ "$PM_WIKI_CONTEXT_STATUS" != "200" ] || [ "$PM_ATTACHMENT_STATUS" != "201" ] || [ "$PM_ATTACHMENT_DOWNLOAD_STATUS" != "200" ] || [ "$PM_COMPLETE_STATUS" != "200" ] || [ "$PM_HISTORY_STATUS" != "200" ] || [ "$PM_CALENDAR_STATUS" != "200" ] || [ "$PM_EXPORT_STATUS" != "200" ] || [ "$PM_EXCEL_STATUS" != "200" ] || [ "$PM_REPORT_STATUS" != "200" ]; then
      cat "$PM_TEMPLATE_JSON" /tmp/makereadyos-pm-overview.json /tmp/makereadyos-pm-tasks.json "$PM_ATTACHMENT_JSON" "$PM_COMPLETE_JSON" /tmp/makereadyos-pm-history.json /tmp/makereadyos-pm-calendar.json /tmp/makereadyos-pm-wiki-context.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-pm-overview.json","utf8")); if (body.summary?.dueToday < 1 || body.summary?.dueThisWeek < 1) process.exit(1);'
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (body.task?.status !== "COMPLETED" || body.task?.completionOutcome !== "PASS" || !body.task?.completedByName) process.exit(1);' "$PM_COMPLETE_JSON"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-pm-history.json","utf8")); if (!body.tasks?.some((task) => task.taskName?.includes("QA Pool Filter Cleaning") && task.status === "COMPLETED")) process.exit(1);'
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-pm-calendar.json","utf8")); if (!body.tasks?.length) process.exit(1);'
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync("/tmp/makereadyos-pm-wiki-context.json","utf8")); if (!body.attached?.some((record) => record.title?.includes("QA Main Water Shutoff"))) process.exit(1);'
    if ! grep -q "QA Pool Filter Cleaning" /tmp/makereadyos-pm-export.csv || ! grep -q "QA Pool Filter Cleaning" /tmp/makereadyos-pm-report.html || ! grep -q "QA Pool Filter Cleaning" /tmp/makereadyos-pm-export.xls; then
      cat /tmp/makereadyos-pm-export.csv /tmp/makereadyos-pm-report.html /tmp/makereadyos-pm-export.xls
      echo "ERROR: Preventive Maintenance exports did not include the expected PM task"
      exit 1
    fi

    echo "Checking property map and unit location lifecycle"
    PROPERTY_MAP_JSON="$(mktemp)"
    MAP_CREATE_STATUS="$(curl -s -o "$PROPERTY_MAP_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"name\":\"QA Site Map $TIMESTAMP\",\"width\":1200,\"height\":800,\"notes\":\"QA map metadata\"}" \
      "http://localhost:${API_PORT:-4000}/api/property-maps")"
    PROPERTY_MAP_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).map?.id || "");' "$PROPERTY_MAP_JSON")"
    MAP_FILE="$(mktemp --suffix=.png)"
    printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=' | base64 -d >"$MAP_FILE"
    MAP_UPLOAD_STATUS="$(curl -s -o /tmp/makereadyos-map-upload.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -F "file=@$MAP_FILE;type=image/png" \
      "http://localhost:${API_PORT:-4000}/api/property-maps/$PROPERTY_MAP_ID/upload")"
    MAP_FILE_STATUS="$(curl -s -o /tmp/makereadyos-map-file.png -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-maps/$PROPERTY_MAP_ID/file")"
    MAP_LIST_STATUS="$(curl -s -o /tmp/makereadyos-map-list.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-maps?propertyId=$TEST_PROPERTY_ID&includeArchived=true")"
    UNIT_LOCATION_JSON="$(mktemp)"
    LOCATION_SAVE_STATUS="$(curl -s -o "$UNIT_LOCATION_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"mapId\":\"$PROPERTY_MAP_ID\",\"unitId\":\"$TURN_UNIT_ID\",\"xPercent\":42.5,\"yPercent\":56.25,\"building\":\"B1\",\"area\":\"North\",\"floor\":\"2\"}" \
      -X PUT "http://localhost:${API_PORT:-4000}/api/unit-map-locations")"
    UNIT_LOCATION_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).location?.id || "");' "$UNIT_LOCATION_JSON")"
    MAP_AREA_JSON="$(mktemp)"
    MAP_AREA_STATUS="$(curl -s -o "$MAP_AREA_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"mapId\":\"$PROPERTY_MAP_ID\",\"name\":\"North Building $TIMESTAMP\",\"areaType\":\"BUILDING\",\"xPercent\":35,\"yPercent\":45,\"expectedUnitCount\":12,\"color\":\"#1f8fdb\",\"notes\":\"QA building marker\"}" \
      "http://localhost:${API_PORT:-4000}/api/property-map-areas")"
    MAP_AREA_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).area?.id || "");' "$MAP_AREA_JSON")"
    MAP_AREA_PATCH_STATUS="$(curl -s -o /tmp/makereadyos-map-area-patch.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"xPercent":36,"yPercent":46}' \
      "http://localhost:${API_PORT:-4000}/api/property-map-areas/$MAP_AREA_ID")"
    MAP_AREA_LIST_STATUS="$(curl -s -o /tmp/makereadyos-map-area-list.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-map-areas?propertyId=$TEST_PROPERTY_ID&mapId=$PROPERTY_MAP_ID")"
    LOCATION_LIST_STATUS="$(curl -s -o /tmp/makereadyos-location-list.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/unit-map-locations?propertyId=$TEST_PROPERTY_ID&mapId=$PROPERTY_MAP_ID")"
    DASHBOARD_MAP_STATUS="$(curl -s -o /tmp/makereadyos-dashboard-maps.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/dashboard?propertyId=$TEST_PROPERTY_ID")"
    echo "Property map statuses: create=$MAP_CREATE_STATUS upload=$MAP_UPLOAD_STATUS file=$MAP_FILE_STATUS list=$MAP_LIST_STATUS area=$MAP_AREA_STATUS/$MAP_AREA_PATCH_STATUS/$MAP_AREA_LIST_STATUS location=$LOCATION_SAVE_STATUS/$LOCATION_LIST_STATUS dashboard=$DASHBOARD_MAP_STATUS"
    if [ "$MAP_CREATE_STATUS" != "201" ] || [ "$MAP_UPLOAD_STATUS" != "200" ] || [ "$MAP_FILE_STATUS" != "200" ] || [ "$MAP_LIST_STATUS" != "200" ] || [ "$MAP_AREA_STATUS" != "201" ] || [ "$MAP_AREA_PATCH_STATUS" != "200" ] || [ "$MAP_AREA_LIST_STATUS" != "200" ] || [ "$LOCATION_SAVE_STATUS" != "200" ] || [ "$LOCATION_LIST_STATUS" != "200" ] || [ "$DASHBOARD_MAP_STATUS" != "200" ]; then
      cat "$PROPERTY_MAP_JSON" /tmp/makereadyos-map-upload.json "$MAP_AREA_JSON" /tmp/makereadyos-map-area-patch.json "$UNIT_LOCATION_JSON" /tmp/makereadyos-dashboard-maps.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.areas?.some((area) => area.name.includes("North Building") && area.expectedUnitCount === 12 && area.xPercent === 36)) process.exit(1);' /tmp/makereadyos-map-area-list.json
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.locations?.some((location) => location.area === "North" && location.xPercent === 42.5)) process.exit(1);' /tmp/makereadyos-location-list.json
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (typeof body.kpis?.mappedUnits !== "number" || typeof body.kpis?.unmappedUnits !== "number" || !body.downUnitsByArea) process.exit(1);' /tmp/makereadyos-dashboard-maps.json

    echo "Checking property template create and dry-run apply"
    PROPERTY_TEMPLATE_BODY="$(mktemp)"
    node -e 'const fs=require("fs"); const body={propertyId:process.argv[1],name:`QA Property Template ${process.argv[2]}`,description:"QA reusable property setup",category:"Make Ready",version:1,notes:"Does not include live turns or resident data",include:{boardSections:true,optionSets:true,customFields:true,floorPlans:true,scheduleTracks:true,savedViews:true,dashboardPresets:true,checklistTemplates:true,automationRules:true,notificationDefaults:false,planningDefaults:false}}; fs.writeFileSync(process.argv[3], JSON.stringify(body));' "$TEST_PROPERTY_ID" "$TIMESTAMP" "$PROPERTY_TEMPLATE_BODY"
    PROPERTY_TEMPLATE_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-property-template-preview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d @"$PROPERTY_TEMPLATE_BODY" \
      "http://localhost:${API_PORT:-4000}/api/property-templates/from-property/preview")"
    PROPERTY_TEMPLATE_CREATE_JSON="$(mktemp)"
    PROPERTY_TEMPLATE_CREATE_STATUS="$(curl -s -o "$PROPERTY_TEMPLATE_CREATE_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d @"$PROPERTY_TEMPLATE_BODY" \
      "http://localhost:${API_PORT:-4000}/api/property-templates/from-property")"
    PROPERTY_TEMPLATE_ID="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).template?.id || "");' "$PROPERTY_TEMPLATE_CREATE_JSON")"
    PROPERTY_TEMPLATE_LIST_STATUS="$(curl -s -o /tmp/makereadyos-property-template-list.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-templates")"
    PROPERTY_TEMPLATE_APPLY_STATUS="$(curl -s -o /tmp/makereadyos-property-template-apply.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"dryRun\":true,\"mode\":\"merge\",\"targetPropertyId\":\"$TEST_PROPERTY_ID\",\"enableAutomations\":false}" \
      "http://localhost:${API_PORT:-4000}/api/property-templates/$PROPERTY_TEMPLATE_ID/apply")"
    echo "Property template statuses: preview=$PROPERTY_TEMPLATE_PREVIEW_STATUS create=$PROPERTY_TEMPLATE_CREATE_STATUS list=$PROPERTY_TEMPLATE_LIST_STATUS apply=$PROPERTY_TEMPLATE_APPLY_STATUS"
    if [ "$PROPERTY_TEMPLATE_PREVIEW_STATUS" != "200" ] || [ "$PROPERTY_TEMPLATE_CREATE_STATUS" != "201" ] || [ "$PROPERTY_TEMPLATE_LIST_STATUS" != "200" ] || [ "$PROPERTY_TEMPLATE_APPLY_STATUS" != "200" ]; then
      cat /tmp/makereadyos-property-template-preview.json "$PROPERTY_TEMPLATE_CREATE_JSON" /tmp/makereadyos-property-template-list.json /tmp/makereadyos-property-template-apply.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.template?.manifest?.data || body.template.manifest.data.makeReadyItems || body.template.manifest.data.comments || body.template.manifest.data.attachments) process.exit(1);' "$PROPERTY_TEMPLATE_CREATE_JSON"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.summary?.boardSections || typeof body.summary.boardSections.skipped !== "number") process.exit(1);' /tmp/makereadyos-property-template-apply.json

    ADMIN_EXPORT_JSON="$(mktemp)"
    echo "Exporting native backup as admin"
    ADMIN_EXPORT_STATUS="$(curl -s -o "$ADMIN_EXPORT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/export")"
    echo "Admin export status: $ADMIN_EXPORT_STATUS"
    if [ "$ADMIN_EXPORT_STATUS" != "200" ]; then
      cat "$ADMIN_EXPORT_JSON"
      exit 1
    fi
    node - "$ADMIN_EXPORT_JSON" <<'NODE'
const fs = require("fs");
const body = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const data = body.data;
const required = [
  body.format === "makereadyos.backup",
  body.version === 1,
  data && Array.isArray(data.properties),
  Array.isArray(data.floorPlans) && data.floorPlans.some((plan) => plan.name === "QA A1 Managed"),
  Array.isArray(data.boardOptions) && data.boardOptions.some((option) => option.value === "QA PAINT TOUCH UP" && option.isArchived),
  Array.isArray(data.boardSections) && data.boardSections.some((section) => section.sectionType === "ARCHIVE"),
  data.boardColumns?.some((column) => column.fieldKey === "vacatedDate" && column.label === "QA Vacated"),
  data.scheduleTracks?.some((track) => track.sourceField === "moveOutDate" && "overdueEnabled" in track),
  Array.isArray(data.riskPolicies) && data.riskPolicies.some((policy) => policy.propertyCode && policy.staleActivityDays === 4),
  data.makeReadyItems?.some((item) => typeof item.riskScore === "number" && item.riskLevel),
  Array.isArray(data.chargePriceSheetItems) && data.chargePriceSheetItems.some((entry) => entry.name.includes("QA Blind Replacement")),
  Array.isArray(data.comments) && data.comments.some((comment) => comment.body.includes("final photos")),
  Array.isArray(data.vendors) && data.vendors.some((vendor) => vendor.name.includes("QA Vendor")),
  Array.isArray(data.vendorAssignments) && data.vendorAssignments.some((assignment) => assignment.vendorName.includes("QA Vendor")),
  Array.isArray(data.propertyMaps) && data.propertyMaps.some((map) => map.name.includes("QA Site Map") && !("storedName" in map)),
  Array.isArray(data.propertyMapAreas) && data.propertyMapAreas.some((area) => area.name.includes("North Building") && area.expectedUnitCount === 12),
  Array.isArray(data.unitMapLocations) && data.unitMapLocations.some((location) => location.area === "North"),
  Array.isArray(data.checklistInstances) && data.checklistInstances.some((instance) => instance.name.includes("QA Final Walk")),
  Array.isArray(data.propertyTemplates) && data.propertyTemplates.some((template) => template.name.includes("QA Property Template")),
  Array.isArray(data.poolFacilities) && data.poolFacilities.some((facility) => facility.name.includes("QA Pool")),
  Array.isArray(data.poolChemicals) && data.poolChemicals.some((chemical) => chemical.name.includes("QA Cal-Hypo")),
  Array.isArray(data.poolLogEntries) && data.poolLogEntries.some((entry) => entry.facilityName.includes("QA Pool") && entry.evaluationJson?.status === "REVIEW"),
  Array.isArray(data.poolSafetyChecks) && data.poolSafetyChecks.some((check) => check.label.includes("Gate") && check.value === "FAIL"),
  Array.isArray(data.poolChemicalAdditions) && data.poolChemicalAdditions.some((addition) => addition.chemicalName.includes("QA Cal-Hypo")),
  !("notifications" in data),
  !("users" in data),
  !("attachments" in data),
];
if (required.some((condition) => !condition)) process.exit(1);
NODE
    LOCATION_REMOVE_STATUS="$(curl -s -o /tmp/makereadyos-location-remove.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X DELETE \
      "http://localhost:${API_PORT:-4000}/api/unit-map-locations/$UNIT_LOCATION_ID")"
    echo "Unit map location remove status: $LOCATION_REMOVE_STATUS"
    if [ "$LOCATION_REMOVE_STATUS" != "200" ]; then
      cat /tmp/makereadyos-location-remove.json
      exit 1
    fi
    rm -f "$MAP_FILE"
    curl -fsS -o /tmp/makereadyos-column-label-restore.json -b "$COOKIE_JAR" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"reset":true}' \
      "http://localhost:${API_PORT:-4000}/api/operations/columns/vacatedDate" >/dev/null
    curl -fsS -o /tmp/makereadyos-meta-columns-reset.json -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/meta"
    node -e 'const fs=require("fs"); const meta=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const field=meta.columns.find((column) => column.fieldKey === "vacatedDate"); if (!field || field.label !== "Vacated" || field.fieldKey !== "vacatedDate") process.exit(1);' /tmp/makereadyos-meta-columns-reset.json

    ADMIN_ACTIVITY_JSON="$(mktemp)"
    echo "Checking activity retrieval and action filtering as admin"
    ADMIN_ACTIVITY_STATUS="$(curl -s -o "$ADMIN_ACTIVITY_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/activity?limit=10&action=BACKUP_EXPORTED")"
    echo "Admin activity status: $ADMIN_ACTIVITY_STATUS"
    if [ "$ADMIN_ACTIVITY_STATUS" != "200" ]; then
      cat "$ADMIN_ACTIVITY_JSON"
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!Array.isArray(body.activity) || !body.activity.some((event) => event.action === "BACKUP_EXPORTED") || body.pagination?.limit !== 10 || !Array.isArray(body.filterOptions?.actions)) process.exit(1);' "$ADMIN_ACTIVITY_JSON"
    echo "Checking daily manager report endpoints as admin"
    DAILY_REPORT_DATE="$(date +%F)"
    curl -fsS -o /tmp/makereadyos-daily-report.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/activity/daily-report?date=$DAILY_REPORT_DATE&propertyId=$TEST_PROPERTY_ID"
    curl -fsS -o /tmp/makereadyos-daily-report.csv -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/activity/daily-report.csv?date=$DAILY_REPORT_DATE&propertyId=$TEST_PROPERTY_ID"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const csv=fs.readFileSync(process.argv[2],"utf8"); if (body.date !== process.argv[3] || typeof body.summary?.totalChanges !== "number" || !Array.isArray(body.records) || !Array.isArray(body.filterOptions?.properties) || !csv.includes("External update hint")) process.exit(1);' /tmp/makereadyos-daily-report.json /tmp/makereadyos-daily-report.csv "$DAILY_REPORT_DATE"

    echo "Checking automation rule management as admin"
    ADMIN_AUTOMATIONS_STATUS="$(curl -s -o /tmp/makereadyos-admin-automations.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    if [ "$ADMIN_AUTOMATIONS_STATUS" != "200" ]; then
      cat /tmp/makereadyos-admin-automations.json
      exit 1
    fi
    echo "Checking automation template catalog and admin installation"
    ADMIN_TEMPLATES_JSON="$(mktemp)"
    ADMIN_TEMPLATES_STATUS="$(curl -s -o "$ADMIN_TEMPLATES_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/automations/templates")"
    MISSING_TEMPLATE_STATUS="$(curl -s -o /tmp/makereadyos-template-missing-setup.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"propertyId":null}' \
      "http://localhost:${API_PORT:-4000}/api/automations/templates/pest-follow-up-needed/install")"
    INSTALLED_TEMPLATE_JSON="$(mktemp)"
    INSTALL_TEMPLATE_STATUS="$(curl -s -o "$INSTALLED_TEMPLATE_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"propertyId":null}' \
      "http://localhost:${API_PORT:-4000}/api/automations/templates/overdue-make-ready/install")"
    curl -fsS -o /tmp/makereadyos-automations-after-template.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/automations"
    echo "Automation template statuses: list=$ADMIN_TEMPLATES_STATUS missing-setup=$MISSING_TEMPLATE_STATUS install=$INSTALL_TEMPLATE_STATUS"
    if [ "$ADMIN_TEMPLATES_STATUS" != "200" ] || [ "$MISSING_TEMPLATE_STATUS" != "409" ] || [ "$INSTALL_TEMPLATE_STATUS" != "201" ]; then
      cat "$ADMIN_TEMPLATES_JSON" /tmp/makereadyos-template-missing-setup.json "$INSTALLED_TEMPLATE_JSON"
      exit 1
    fi
    node -e 'const fs=require("fs"); const catalog=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const missing=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); const installed=JSON.parse(fs.readFileSync(process.argv[3],"utf8")); const rules=JSON.parse(fs.readFileSync(process.argv[4],"utf8")).rules; const pest=catalog.templates.find((template) => template.id === "pest-follow-up-needed"); const weekend=catalog.templates.find((template) => template.id === "no-weekend-make-ready"); const edge=catalog.templates.find((template) => template.id === "no-monday-friday-make-ready"); const sequence=catalog.templates.find((template) => template.id === "turn-date-sequence-review"); const load=catalog.templates.find((template) => template.id === "daily-schedule-load-review"); const routing=catalog.templates.find((template) => template.id === "in-house-or-vendor-work-routing"); const hasWeekend=weekend?.defaultConditions?.all?.some((condition) => condition.operator === "dateOnWeekend"); const hasEdge=edge?.defaultConditions?.all?.some((condition) => condition.operator === "dateOnMondayOrFriday"); if (catalog.templates.length < 16 || !pest || pest.readyToInstall !== false || pest.setupRequirements.length < 1 || !hasWeekend || !hasEdge || !sequence || !load || !routing || missing.setupRequirements.length < 1 || installed.rule.templateId !== "overdue-make-ready" || installed.rule.enabled !== false || !rules.some((rule) => rule.id === installed.rule.id && rule.templateId === "overdue-make-ready")) process.exit(1);' "$ADMIN_TEMPLATES_JSON" /tmp/makereadyos-template-missing-setup.json "$INSTALLED_TEMPLATE_JSON" /tmp/makereadyos-automations-after-template.json
    TEST_AUTOMATION_JSON="$(mktemp)"
    CREATE_AUTOMATION_STATUS="$(curl -s -o "$TEST_AUTOMATION_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"QA Structured Warning $(date +%s)\",\"description\":\"Smoke-test structured rule\",\"enabled\":true,\"triggerType\":\"STATUS_FIELD_CHANGED\",\"propertyId\":\"$TEST_PROPERTY_ID\",\"conditions\":{\"all\":[{\"field\":\"completionStatus\",\"operator\":\"notEquals\",\"value\":\"DONE\"}]},\"actions\":[{\"type\":\"addAuditNote\",\"value\":\"QA rule attention note\"}]}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    echo "Create automation status: $CREATE_AUTOMATION_STATUS"
    if [ "$CREATE_AUTOMATION_STATUS" != "201" ]; then
      cat "$TEST_AUTOMATION_JSON"
      exit 1
    fi
    TEST_AUTOMATION_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.rule?.id || "");' "$TEST_AUTOMATION_JSON")"
    if [ -z "$TEST_AUTOMATION_ID" ]; then
      echo "ERROR: missing created automation id"
      exit 1
    fi
    echo "Previewing stored and draft automation rules without mutating board items"
    ADMIN_AUTOMATION_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-admin-automation-preview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"ruleId\":\"$TEST_AUTOMATION_ID\",\"propertyId\":\"$TEST_PROPERTY_ID\",\"limit\":5}" \
      "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    PREVIEW_ITEMS_BEFORE="$(mktemp)"
    PREVIEW_ITEMS_AFTER="$(mktemp)"
    curl -fsS -o "$PREVIEW_ITEMS_BEFORE" -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/make-ready-items"
    DRAFT_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-draft-automation-preview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"draft\":{\"name\":\"QA Draft Preview\",\"description\":\"Read-only preview test\",\"enabled\":false,\"triggerType\":\"ITEM_UPDATED\",\"propertyId\":\"$TEST_PROPERTY_ID\",\"conditions\":{\"all\":[{\"field\":\"unitNumber\",\"operator\":\"notEmpty\"}]},\"actions\":[{\"type\":\"setField\",\"field\":\"notes\",\"value\":\"THIS MUST NOT BE WRITTEN\"}]},\"limit\":5}" \
      "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    curl -fsS -o "$PREVIEW_ITEMS_AFTER" -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/make-ready-items"
    INVALID_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-invalid-automation-preview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"draft\":{\"name\":\"Invalid Draft\",\"enabled\":false,\"triggerType\":\"ITEM_UPDATED\",\"propertyId\":\"$TEST_PROPERTY_ID\",\"conditions\":{\"all\":[{\"field\":\"notAField\",\"operator\":\"equals\",\"value\":\"x\"}]},\"actions\":[{\"type\":\"executeScript\",\"value\":\"no\"}]}}" \
      "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    echo "Automation preview statuses: stored=$ADMIN_AUTOMATION_PREVIEW_STATUS draft=$DRAFT_PREVIEW_STATUS invalid=$INVALID_PREVIEW_STATUS"
    if [ "$ADMIN_AUTOMATION_PREVIEW_STATUS" != "200" ] || [ "$DRAFT_PREVIEW_STATUS" != "200" ] || [ "$INVALID_PREVIEW_STATUS" != "400" ]; then
      cat /tmp/makereadyos-admin-automation-preview.json /tmp/makereadyos-draft-automation-preview.json /tmp/makereadyos-invalid-automation-preview.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const stored=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const draft=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); const before=fs.readFileSync(process.argv[3],"utf8"); const after=fs.readFileSync(process.argv[4],"utf8"); const invalid=JSON.parse(fs.readFileSync(process.argv[5],"utf8")); if (!stored.preview || stored.notice !== "No changes will be made." || !draft.preview || draft.matchingItemCount < 1 || before !== after || !invalid.message.includes("Invalid automation preview")) process.exit(1);' /tmp/makereadyos-admin-automation-preview.json /tmp/makereadyos-draft-automation-preview.json "$PREVIEW_ITEMS_BEFORE" "$PREVIEW_ITEMS_AFTER" /tmp/makereadyos-invalid-automation-preview.json

    echo "Creating and executing a scheduled automation with cooldown protection"
    TEST_SCHEDULED_AUTOMATION_JSON="$(mktemp)"
    CREATE_SCHEDULED_STATUS="$(curl -s -o "$TEST_SCHEDULED_AUTOMATION_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"QA Scheduled Missing Date $(date +%s)\",\"description\":\"Scheduled smoke-test rule\",\"enabled\":true,\"triggerType\":\"SCHEDULED_CHECK\",\"propertyId\":\"$TEST_PROPERTY_ID\",\"conditions\":{\"all\":[{\"field\":\"makeReadyDate\",\"operator\":\"dateMissing\"}]},\"actions\":[{\"type\":\"addAuditNote\",\"value\":\"QA scheduled cooldown note\"}]}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    if [ "$CREATE_SCHEDULED_STATUS" != "201" ]; then
      cat "$TEST_SCHEDULED_AUTOMATION_JSON"
      exit 1
    fi
    TEST_SCHEDULED_AUTOMATION_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.rule?.id || "");' "$TEST_SCHEDULED_AUTOMATION_JSON")"
    if [ -z "$TEST_SCHEDULED_AUTOMATION_ID" ]; then
      echo "ERROR: missing scheduled automation id"
      exit 1
    fi
    ./run-automations.sh >/tmp/makereadyos-scheduled-run-first.txt
    curl -fsS -o /tmp/makereadyos-scheduled-runs-first.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/automations/runs?ruleId=$TEST_SCHEDULED_AUTOMATION_ID&limit=1"
    curl -fsS -o /tmp/makereadyos-scheduled-activity-first.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/activity?action=AUTOMATION_SCHEDULED_ACTIVITY_NOTE&propertyId=$TEST_PROPERTY_ID&limit=100"
    node -e 'const fs=require("fs"); const runs=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).runs; const activity=JSON.parse(fs.readFileSync(process.argv[2],"utf8")).activity; const run=runs[0]; const notes=activity.filter((entry) => entry.description === "QA scheduled cooldown note").length; if (!run || run.runType !== "SCHEDULED" || run.checkedCount < 1 || run.matchedCount < 1 || run.actionCount < 1 || notes < 1) process.exit(1); process.stdout.write(String(notes));' /tmp/makereadyos-scheduled-runs-first.json /tmp/makereadyos-scheduled-activity-first.json >/tmp/makereadyos-scheduled-note-count.txt
    ./run-automations.sh >/tmp/makereadyos-scheduled-run-second.txt
    curl -fsS -o /tmp/makereadyos-scheduled-runs-second.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/automations/runs?ruleId=$TEST_SCHEDULED_AUTOMATION_ID&limit=5"
    curl -fsS -o /tmp/makereadyos-scheduled-activity-second.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/activity?action=AUTOMATION_SCHEDULED_ACTIVITY_NOTE&propertyId=$TEST_PROPERTY_ID&limit=100"
    node -e 'const fs=require("fs"); const initial=Number(fs.readFileSync(process.argv[1],"utf8")); const runs=JSON.parse(fs.readFileSync(process.argv[2],"utf8")).runs; const activity=JSON.parse(fs.readFileSync(process.argv[3],"utf8")).activity; const run=[...runs].sort((a,b) => new Date(b.ranAt || b.completedAt || b.startedAt) - new Date(a.ranAt || a.completedAt || a.startedAt))[0]; const notes=activity.filter((entry) => entry.description === "QA scheduled cooldown note").length; if (notes !== initial || !run || run.runType !== "SCHEDULED" || run.matchedCount < 1 || run.actionCount !== 0 || !Array.isArray(run.warnings) || run.warnings.length < 1) process.exit(1);' /tmp/makereadyos-scheduled-note-count.txt /tmp/makereadyos-scheduled-runs-second.json /tmp/makereadyos-scheduled-activity-second.json
    echo "Scheduled automation runner and cooldown validation passed"

    echo "Checking operating-calendar business-day date offsets"
    curl -fsS -o /tmp/makereadyos-offset-sections.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/operations/board-sections?propertyId=$OPS_PROPERTY_ID"
    OFFSET_MAKE_READY_GROUP="$(node -e 'const fs=require("fs"); const section=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).sections.find((entry) => entry.sectionType === "MAKE_READY"); process.stdout.write(section?.key || "");' /tmp/makereadyos-offset-sections.json)"
    OFFSET_UNIT_NUMBER="QAOFFSET${TIMESTAMP//-/}"
    OFFSET_UNIT_JSON="$(mktemp)"
    CREATE_OFFSET_UNIT_STATUS="$(curl -s -o "$OFFSET_UNIT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$OPS_PROPERTY_ID\",\"number\":\"$OFFSET_UNIT_NUMBER\",\"floorPlan\":\"QA OFFSET\",\"squareFeet\":801}" \
      "http://localhost:${API_PORT:-4000}/api/operations/units")"
    OFFSET_UNIT_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.unit?.id || "");' "$OFFSET_UNIT_JSON")"
    OFFSET_ITEM_JSON="$(mktemp)"
    CREATE_OFFSET_ITEM_STATUS="$(curl -s -o "$OFFSET_ITEM_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$OPS_PROPERTY_ID\",\"unitId\":\"$OFFSET_UNIT_ID\",\"boardGroup\":\"$OFFSET_MAKE_READY_GROUP\",\"itemName\":\"$OFFSET_UNIT_NUMBER\",\"unitNumber\":\"$OFFSET_UNIT_NUMBER\",\"floorPlan\":\"QA OFFSET\",\"vacancyStatus\":\"TO WALK\",\"makeReadyStatus\":\"LITE\",\"completionStatus\":\"NO\",\"makeReadyDate\":\"2026-05-29\"}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items")"
    OFFSET_ITEM_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.id || "");' "$OFFSET_ITEM_JSON")"
    if [ "$CREATE_OFFSET_UNIT_STATUS" != "201" ] || [ "$CREATE_OFFSET_ITEM_STATUS" != "201" ] || [ -z "$OFFSET_MAKE_READY_GROUP" ] || [ -z "$OFFSET_ITEM_ID" ]; then
      cat /tmp/makereadyos-offset-sections.json "$OFFSET_UNIT_JSON" "$OFFSET_ITEM_JSON"
      exit 1
    fi
    curl -fsS -o /tmp/makereadyos-test-property-operating-calendar.json -b "$COOKIE_JAR" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PUT \
      -d '{"name":"QA Test Property Calendar","timezone":"America/Chicago","noWeekendScheduling":true,"avoidMondayScheduling":true,"avoidFridayScheduling":false,"maintenanceStartMinute":480,"maintenanceEndMinute":1020,"vendorLeadDays":3,"dailyScheduledUnitLimit":2,"scopeDay":1,"workStartDay":2,"autoPopulateEnabled":true,"notes":"QA offset calendar"}' \
      "http://localhost:${API_PORT:-4000}/api/operations/properties/$OPS_PROPERTY_ID/operating-calendar" >/dev/null
    OFFSET_AUTOMATION_JSON="$(mktemp)"
    CREATE_OFFSET_STATUS="$(curl -s -o "$OFFSET_AUTOMATION_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"QA Operating Offset $(date +%s)\",\"description\":\"Business-day date offset smoke test\",\"enabled\":true,\"triggerType\":\"SCHEDULED_CHECK\",\"propertyId\":\"$OPS_PROPERTY_ID\",\"conditions\":{\"all\":[{\"field\":\"unitNumber\",\"operator\":\"equals\",\"value\":\"$OFFSET_UNIT_NUMBER\"},{\"field\":\"makeReadyDate\",\"operator\":\"notEmpty\"},{\"field\":\"flooringDate\",\"operator\":\"dateMissing\"}]},\"actions\":[{\"type\":\"setDateFromField\",\"sourceField\":\"makeReadyDate\",\"targetField\":\"flooringDate\",\"offsetDays\":1,\"respectOperatingCalendar\":true}]}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    OFFSET_AUTOMATION_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.rule?.id || "");' "$OFFSET_AUTOMATION_JSON")"
    OFFSET_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-offset-preview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"ruleId\":\"$OFFSET_AUTOMATION_ID\",\"propertyId\":\"$OPS_PROPERTY_ID\",\"limit\":5}" \
      "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    OFFSET_RUN_STATUS="$(curl -s -o /tmp/makereadyos-offset-run.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/automations/$OFFSET_AUTOMATION_ID/run")"
    curl -fsS -o /tmp/makereadyos-offset-items-after.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items?propertyId=$OPS_PROPERTY_ID&includeArchived=true&limit=200"
    if [ "$CREATE_OFFSET_STATUS" != "201" ] || [ "$OFFSET_PREVIEW_STATUS" != "200" ] || [ "$OFFSET_RUN_STATUS" != "200" ]; then
      cat "$OFFSET_AUTOMATION_JSON" /tmp/makereadyos-offset-preview.json /tmp/makereadyos-offset-run.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const preview=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const run=JSON.parse(fs.readFileSync(process.argv[2],"utf8")).execution; const items=JSON.parse(fs.readFileSync(process.argv[3],"utf8")); const item=items.find((entry) => entry.id === process.argv[4]); if (!preview.preview || preview.matchingItemCount < 1 || !preview.affectedItems[0].proposedActions.some((action) => action.type === "setDateFromField") || run.actionCount < 1 || !item || !String(item.flooringDate || "").startsWith("2026-06-02")) process.exit(1);' /tmp/makereadyos-offset-preview.json /tmp/makereadyos-offset-run.json /tmp/makereadyos-offset-items-after.json "$OFFSET_ITEM_ID"
    echo "Operating-calendar business-day date offset validation passed"

    echo "Checking least-loaded assignment automation preview and execution"
    ASSIGN_UNIT_NUMBER="QAASSIGN${TIMESTAMP//-/}"
    ASSIGN_UNIT_JSON="$(mktemp)"
    CREATE_ASSIGN_UNIT_STATUS="$(curl -s -o "$ASSIGN_UNIT_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"number\":\"$ASSIGN_UNIT_NUMBER\",\"floorPlan\":\"QA ASSIGN\",\"squareFeet\":799}" \
      "http://localhost:${API_PORT:-4000}/api/operations/units")"
    ASSIGN_UNIT_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.unit?.id || "");' "$ASSIGN_UNIT_JSON")"
    ASSIGN_ITEM_JSON="$(mktemp)"
    CREATE_ASSIGN_ITEM_STATUS="$(curl -s -o "$ASSIGN_ITEM_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"unitId\":\"$ASSIGN_UNIT_ID\",\"boardGroup\":\"$TEST_MAKE_READY_GROUP\",\"itemName\":\"$ASSIGN_UNIT_NUMBER\",\"unitNumber\":\"$ASSIGN_UNIT_NUMBER\",\"floorPlan\":\"QA ASSIGN\",\"vacancyStatus\":\"TO WALK\",\"makeReadyStatus\":\"LITE\",\"completionStatus\":\"NO\",\"assignedTech\":null,\"makeReadyDate\":\"2026-06-05\"}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items")"
    ASSIGN_ITEM_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.id || "");' "$ASSIGN_ITEM_JSON")"
    if [ "$CREATE_ASSIGN_UNIT_STATUS" != "201" ] || [ "$CREATE_ASSIGN_ITEM_STATUS" != "201" ] || [ -z "$ASSIGN_ITEM_ID" ]; then
      cat "$ASSIGN_UNIT_JSON" "$ASSIGN_ITEM_JSON"
      echo "ERROR: least-loaded assignment smoke setup failed"
      exit 1
    fi
    ASSIGN_AUTOMATION_JSON="$(mktemp)"
    CREATE_ASSIGN_AUTOMATION_STATUS="$(curl -s -o "$ASSIGN_AUTOMATION_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"QA Least Loaded Assign $(date +%s)\",\"description\":\"Least-loaded assignment smoke test\",\"enabled\":true,\"triggerType\":\"SCHEDULED_CHECK\",\"propertyId\":\"$TEST_PROPERTY_ID\",\"conditions\":{\"all\":[{\"field\":\"unitNumber\",\"operator\":\"equals\",\"value\":\"$ASSIGN_UNIT_NUMBER\"},{\"field\":\"assignedTech\",\"operator\":\"isEmpty\"}]},\"actions\":[{\"type\":\"assignLeastLoadedStaff\",\"eligibleRoles\":[\"ADMIN\"],\"lookAheadDays\":7,\"includePlannedWork\":false,\"onlyWhenUnassigned\":true,\"targetDateField\":\"makeReadyDate\"}]}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    ASSIGN_AUTOMATION_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.rule?.id || "");' "$ASSIGN_AUTOMATION_JSON")"
    ASSIGN_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-assign-preview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"ruleId\":\"$ASSIGN_AUTOMATION_ID\",\"propertyId\":\"$TEST_PROPERTY_ID\",\"limit\":5}" \
      "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    ASSIGN_RUN_STATUS="$(curl -s -o /tmp/makereadyos-assign-run.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/automations/$ASSIGN_AUTOMATION_ID/run")"
    curl -fsS -o /tmp/makereadyos-assign-items-after.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items?propertyId=$TEST_PROPERTY_ID&includeArchived=true&limit=400"
    if [ "$CREATE_ASSIGN_AUTOMATION_STATUS" != "201" ] || [ "$ASSIGN_PREVIEW_STATUS" != "200" ] || [ "$ASSIGN_RUN_STATUS" != "200" ]; then
      cat "$ASSIGN_AUTOMATION_JSON" /tmp/makereadyos-assign-preview.json /tmp/makereadyos-assign-run.json
      echo "ERROR: least-loaded assignment automation smoke failed"
      exit 1
    fi
    node -e 'const fs=require("fs"); const preview=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const run=JSON.parse(fs.readFileSync(process.argv[2],"utf8")).execution; const items=JSON.parse(fs.readFileSync(process.argv[3],"utf8")); const item=items.find((entry) => entry.id === process.argv[4]); const affected=preview.affectedItems?.find((entry) => entry.id === process.argv[4]); const proposed=affected?.proposedActions?.find((action) => action.type === "assignLeastLoadedStaff"); if (!preview.preview || preview.matchingItemCount < 1 || !affected || !proposed || proposed.proposedValue !== process.argv[5] || !String(proposed.summary || "").includes(process.argv[5]) || run.actionCount < 1 || !item || item.assignedTech !== process.argv[5]) process.exit(1);' /tmp/makereadyos-assign-preview.json /tmp/makereadyos-assign-run.json /tmp/makereadyos-assign-items-after.json "$ASSIGN_ITEM_ID" "$ADMIN_STAFF_NAME"
    echo "Least-loaded assignment automation validation passed"

    TOGGLE_AUTOMATION_STATUS="$(curl -s -o /tmp/makereadyos-toggle-automation.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PATCH \
      -d '{"enabled":false}' \
      "http://localhost:${API_PORT:-4000}/api/automations/$TEST_AUTOMATION_ID/enabled")"
    AUTOMATION_RUNS_STATUS="$(curl -s -o /tmp/makereadyos-automation-runs.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/automations/runs?limit=5")"
    echo "Automation toggle/history statuses: $TOGGLE_AUTOMATION_STATUS/$AUTOMATION_RUNS_STATUS"
    if [ "$TOGGLE_AUTOMATION_STATUS" != "200" ] || [ "$AUTOMATION_RUNS_STATUS" != "200" ]; then
      cat /tmp/makereadyos-toggle-automation.json /tmp/makereadyos-automation-runs.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const rule=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).rule; const history=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); if (rule.enabled !== false || !Array.isArray(history.runs) || history.runs.length === 0) process.exit(1);' /tmp/makereadyos-toggle-automation.json /tmp/makereadyos-automation-runs.json

    echo "Rejecting invalid native backup format"
    INVALID_IMPORT_STATUS="$(curl -s -o /tmp/makereadyos-invalid-import.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"dryRun":true,"mode":"merge","backup":{"format":"wrong","version":1}}' \
      "http://localhost:${API_PORT:-4000}/api/admin/import")"
    echo "Invalid import status: $INVALID_IMPORT_STATUS"
    if [ "$INVALID_IMPORT_STATUS" != "400" ]; then
      cat /tmp/makereadyos-invalid-import.json
      exit 1
    fi
    MALFORMED_IMPORT_STATUS="$(curl -s -o /tmp/makereadyos-malformed-import.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"dryRun":' \
      "http://localhost:${API_PORT:-4000}/api/admin/import")"
    echo "Malformed JSON import status: $MALFORMED_IMPORT_STATUS"
    if [ "$MALFORMED_IMPORT_STATUS" != "400" ]; then
      cat /tmp/makereadyos-malformed-import.json
      exit 1
    fi

    DRY_RUN_BODY="$(mktemp)"
    node -e 'const fs=require("fs"); const backup=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); fs.writeFileSync(process.argv[2], JSON.stringify({ dryRun:true, mode:"merge", backup }));' "$ADMIN_EXPORT_JSON" "$DRY_RUN_BODY"
    echo "Dry-running native backup import as admin"
    DRY_RUN_STATUS="$(curl -s -o /tmp/makereadyos-dry-run-import.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      --data-binary "@$DRY_RUN_BODY" \
      "http://localhost:${API_PORT:-4000}/api/admin/import")"
    echo "Dry-run import status: $DRY_RUN_STATUS"
    if [ "$DRY_RUN_STATUS" != "200" ]; then
      cat /tmp/makereadyos-dry-run-import.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.dryRun || body.mode !== "merge" || !body.summary?.properties || typeof body.summary.properties.skipped !== "number") process.exit(1);' /tmp/makereadyos-dry-run-import.json

    TEST_USER_EMAIL="qa-user@example.com"
    TEST_USER_JSON="$(mktemp)"
    echo "Creating admin-managed test user"
    CREATE_USER_STATUS="$(curl -s -o "$TEST_USER_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"fullName\":\"QA User\",\"email\":\"$TEST_USER_EMAIL\",\"role\":\"VIEWER\",\"password\":\"TempUser!23456\",\"isActive\":true,\"propertyIds\":[\"$TEST_PROPERTY_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/admin/users")"
    echo "Create user status: $CREATE_USER_STATUS"
    if [ "$CREATE_USER_STATUS" != "201" ]; then
      cat "$TEST_USER_JSON"
      exit 1
    fi
    TEST_USER_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.user?.id || "");' "$TEST_USER_JSON")"
    if [ -z "$TEST_USER_ID" ]; then
      echo "ERROR: missing test user id"
      exit 1
    fi

    LEASING_USER_EMAIL="qa-leasing@example.com"
    LEASING_USER_JSON="$(mktemp)"
    CLEANER_USER_EMAIL="qa-cleaner@example.com"
    CLEANER_USER_JSON="$(mktemp)"
    echo "Creating leasing and cleaner role users"
    LEASING_CREATE_STATUS="$(curl -s -o "$LEASING_USER_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"fullName\":\"QA Leasing\",\"email\":\"$LEASING_USER_EMAIL\",\"role\":\"LEASING\",\"password\":\"TempLeasing!23456\",\"isActive\":true,\"propertyIds\":[\"$TEST_PROPERTY_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/admin/users")"
    CLEANER_CREATE_STATUS="$(curl -s -o "$CLEANER_USER_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"fullName\":\"QA Cleaner\",\"email\":\"$CLEANER_USER_EMAIL\",\"role\":\"CLEANER\",\"password\":\"TempCleaner!23456\",\"isActive\":true,\"propertyIds\":[\"$TEST_PROPERTY_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/admin/users")"
    echo "Create leasing/cleaner statuses: $LEASING_CREATE_STATUS/$CLEANER_CREATE_STATUS"
    if [ "$LEASING_CREATE_STATUS" != "201" ] || [ "$CLEANER_CREATE_STATUS" != "201" ]; then
      cat "$LEASING_USER_JSON" "$CLEANER_USER_JSON"
      exit 1
    fi

    echo "Checking operational library preview/install as admin"
    LIBRARY_PACK_KEY="qa-library-$TIMESTAMP"
    LIBRARY_RULE_KEY="qa-disabled-rule-$TIMESTAMP"
    LIBRARY_TEMPLATE_ID="pack:$LIBRARY_PACK_KEY:$LIBRARY_RULE_KEY"
    node - "$LIBRARY_PACK_KEY" "$LIBRARY_RULE_KEY" >/tmp/makereadyos-library-pack.json <<'NODE'
const [packKey, ruleKey] = process.argv.slice(2);
const pack = {
  format: "makereadyos.libraryPack",
  version: 1,
  packKey,
  name: `QA Library ${packKey}`,
  description: "Deterministic smoke-test library pack.",
  category: "Make Ready",
  items: {
    automationTemplates: [
      {
        key: ruleKey,
        name: `QA Disabled Rule ${ruleKey}`,
        description: "Verifies imported automation rules are installed disabled.",
        enabled: true,
        triggerType: "SCHEDULED_CHECK",
        conditions: { all: [{ field: "moveInDate", operator: "dateWithinNextDays", value: 7 }] },
        actions: [{ type: "addAuditNote", value: "QA library smoke-test note." }],
      },
    ],
  },
};
process.stdout.write(JSON.stringify({ pack }));
NODE
    LIBRARY_LIST_STATUS="$(curl -s -o /tmp/makereadyos-library-packs.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operational-library/packs")"
    LIBRARY_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-library-preview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      --data-binary @/tmp/makereadyos-library-pack.json \
      "http://localhost:${API_PORT:-4000}/api/operational-library/preview")"
    LIBRARY_INSTALL_STATUS="$(curl -s -o /tmp/makereadyos-library-install.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      --data-binary @/tmp/makereadyos-library-pack.json \
      "http://localhost:${API_PORT:-4000}/api/operational-library/install")"
    LIBRARY_DUPLICATE_STATUS="$(curl -s -o /tmp/makereadyos-library-duplicate.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      --data-binary @/tmp/makereadyos-library-pack.json \
      "http://localhost:${API_PORT:-4000}/api/operational-library/install")"
    echo "Operational library statuses: list=$LIBRARY_LIST_STATUS preview=$LIBRARY_PREVIEW_STATUS install=$LIBRARY_INSTALL_STATUS duplicate=$LIBRARY_DUPLICATE_STATUS"
    if [ "$LIBRARY_LIST_STATUS" != "200" ] || [ "$LIBRARY_PREVIEW_STATUS" != "200" ] || [ "$LIBRARY_INSTALL_STATUS" != "200" ] || [ "$LIBRARY_DUPLICATE_STATUS" != "200" ]; then
      cat /tmp/makereadyos-library-packs.json /tmp/makereadyos-library-preview.json /tmp/makereadyos-library-install.json /tmp/makereadyos-library-duplicate.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const summary=body.summary?.automationTemplates; if (!summary || summary.created + summary.skipped < 1) process.exit(1);' /tmp/makereadyos-library-install.json
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!body.summary?.automationTemplates || body.summary.automationTemplates.skipped < 1) process.exit(1);' /tmp/makereadyos-library-duplicate.json
    LIBRARY_RULE_DISABLED="$(curl -fsS -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/automations" | node -e 'const templateId=process.argv[1]; let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const body=JSON.parse(data); const rule=body.rules.find((entry) => entry.templateId === templateId); process.stdout.write(rule && rule.enabled === false ? "yes" : "no"); });' "$LIBRARY_TEMPLATE_ID")"
    if [ "$LIBRARY_RULE_DISABLED" != "yes" ]; then
      echo "ERROR: imported operational library automation was not installed disabled"
      exit 1
    fi

    VIEWER_COOKIE_JAR="$(mktemp)"
    VIEWER_LOGIN_JSON="$(mktemp)"
    echo "Checking viewer cannot manage automation rules"
    VIEWER_LOGIN_STATUS="$(curl -s -o "$VIEWER_LOGIN_JSON" -c "$VIEWER_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"TempUser!23456\"}" \
      "http://localhost:${API_PORT:-4000}/api/auth/login")"
    VIEWER_AUTOMATION_STATUS="$(curl -s -o /tmp/makereadyos-viewer-automations.json -b "$VIEWER_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    VIEWER_CSRF_TOKEN="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.csrfToken || "");' "$VIEWER_LOGIN_JSON")"
    VIEWER_RUN_STATUS="$(curl -s -o /tmp/makereadyos-viewer-run.json -b "$VIEWER_COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $VIEWER_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/automations/$TEST_SCHEDULED_AUTOMATION_ID/run")"
    VIEWER_TEMPLATE_INSTALL_STATUS="$(curl -s -o /tmp/makereadyos-viewer-template-install.json -b "$VIEWER_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $VIEWER_CSRF_TOKEN" \
      -d '{"propertyId":null}' \
      "http://localhost:${API_PORT:-4000}/api/automations/templates/move-in-within-seven-days/install")"
    VIEWER_OPERATIONS_STATUS="$(curl -s -o /tmp/makereadyos-viewer-operations.json -b "$VIEWER_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operations/properties")"
    echo "Viewer login/automation/run/template-install/operations statuses: $VIEWER_LOGIN_STATUS/$VIEWER_AUTOMATION_STATUS/$VIEWER_RUN_STATUS/$VIEWER_TEMPLATE_INSTALL_STATUS/$VIEWER_OPERATIONS_STATUS"
    if [ "$VIEWER_LOGIN_STATUS" != "200" ] || [ "$VIEWER_AUTOMATION_STATUS" != "403" ] || [ "$VIEWER_RUN_STATUS" != "403" ] || [ "$VIEWER_TEMPLATE_INSTALL_STATUS" != "403" ] || [ "$VIEWER_OPERATIONS_STATUS" != "403" ]; then
      cat "$VIEWER_LOGIN_JSON" /tmp/makereadyos-viewer-automations.json /tmp/makereadyos-viewer-run.json /tmp/makereadyos-viewer-template-install.json /tmp/makereadyos-viewer-operations.json
      exit 1
    fi

    echo "Updating test user role"
    UPDATE_USER_STATUS="$(curl -s -o /tmp/makereadyos-update-user.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PATCH \
      -d '{"role":"MANAGER"}' \
      "http://localhost:${API_PORT:-4000}/api/admin/users/$TEST_USER_ID")"
    echo "Update role status: $UPDATE_USER_STATUS"
    if [ "$UPDATE_USER_STATUS" != "200" ]; then
      cat /tmp/makereadyos-update-user.json
      exit 1
    fi

    echo "Updating property access for test user"
    PROPERTY_ACCESS_STATUS="$(curl -s -o /tmp/makereadyos-property-access.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PUT \
      -d "{\"propertyIds\":[\"$TEST_PROPERTY_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/admin/users/$TEST_USER_ID/property-access")"
    echo "Property access status: $PROPERTY_ACCESS_STATUS"
    if [ "$PROPERTY_ACCESS_STATUS" != "200" ]; then
      cat /tmp/makereadyos-property-access.json
      exit 1
    fi

    echo "Checking last-admin protection"
    LAST_ADMIN_STATUS="$(curl -s -o /tmp/makereadyos-last-admin.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PATCH \
      -d '{"role":"MANAGER"}' \
      "http://localhost:${API_PORT:-4000}/api/admin/users/$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.user?.id || "");' "$ADMIN_LOGIN_JSON")")"
    echo "Last-admin protection status: $LAST_ADMIN_STATUS"
    if [ "$LAST_ADMIN_STATUS" != "400" ]; then
      cat /tmp/makereadyos-last-admin.json
      exit 1
    fi

    echo "Checking saved view routes as admin"
    ADMIN_VIEWS_STATUS="$(curl -s -o /tmp/makereadyos-admin-views.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/saved-views?module=make-ready")"
    echo "Admin saved views status: $ADMIN_VIEWS_STATUS"
    if [ "$ADMIN_VIEWS_STATUS" != "200" ]; then
      cat /tmp/makereadyos-admin-views.json
      exit 1
    fi

    TEST_VIEW_JSON="$(mktemp)"
    echo "Creating shared saved view as admin"
    CREATE_VIEW_STATUS="$(curl -s -o "$TEST_VIEW_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"name":"QA Shared View","module":"make-ready","viewType":"table","filters":{"overdueOnly":true,"vacancyStatus":"VACANT","assignedTech":"__unassigned__","boardSection":"type:DOWN","makeReadyStatus":"LITE","moveInWindow":"7","missingDatesOnly":true,"pestIssuesOnly":true,"flooringNeededOnly":true,"paintNeededOnly":true,"moveInRiskOnly":true,"archiveState":"active"},"sorts":{"key":"moveInDate","direction":"asc"},"grouping":null,"visibleColumns":["unitNumber","moveInDate","completionStatus"],"isShared":true}' \
      "http://localhost:${API_PORT:-4000}/api/saved-views")"
    echo "Create shared view status: $CREATE_VIEW_STATUS"
    if [ "$CREATE_VIEW_STATUS" != "201" ]; then
      cat "$TEST_VIEW_JSON"
      exit 1
    fi
    TEST_VIEW_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.view?.id || "");' "$TEST_VIEW_JSON")"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const columns=body.view?.visibleColumns || []; const filters=body.view?.filters || {}; if (columns.join(",") !== "unitNumber,moveInDate,completionStatus" || filters.vacancyStatus !== "VACANT" || filters.assignedTech !== "__unassigned__" || filters.boardSection !== "type:DOWN" || filters.moveInWindow !== "7" || filters.archiveState !== "active" || filters.moveInRiskOnly !== true) process.exit(1);' "$TEST_VIEW_JSON"

    echo "Checking custom field routes as admin"
    CUSTOM_FIELDS_STATUS="$(curl -s -o /tmp/makereadyos-custom-fields.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/custom-fields?includeArchived=true")"
    echo "Admin custom fields status: $CUSTOM_FIELDS_STATUS"
    if [ "$CUSTOM_FIELDS_STATUS" != "200" ]; then
      cat /tmp/makereadyos-custom-fields.json
      exit 1
    fi

    TEST_FIELD_JSON="$(mktemp)"
    echo "Creating custom status field as admin"
    CREATE_FIELD_STATUS="$(curl -s -o "$TEST_FIELD_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"label":"QA Final Walk","fieldType":"SINGLE_SELECT","options":[{"label":"PENDING","color":"#ffc673","sortOrder":0,"isArchived":false},{"label":"PASSED","color":"#46d39c","sortOrder":1,"isArchived":false}]}' \
      "http://localhost:${API_PORT:-4000}/api/custom-fields")"
    echo "Create custom field status: $CREATE_FIELD_STATUS"
    if [ "$CREATE_FIELD_STATUS" != "201" ]; then
      cat "$TEST_FIELD_JSON"
      exit 1
    fi
    TEST_FIELD_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.field?.id || "");' "$TEST_FIELD_JSON")"
    TEST_ITEM_JSON="$(mktemp)"
    curl -fsS -o "$TEST_ITEM_JSON" -b "$COOKIE_JAR" "http://localhost:${API_PORT:-4000}/api/make-ready-items"
    TEST_ITEM_ID="$(node -e 'const fs=require("fs"); const items=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const item=items.find((entry) => entry.propertyId === process.argv[2]); process.stdout.write(item?.id || "");' "$TEST_ITEM_JSON" "$TEST_PROPERTY_ID")"
    if [ -z "$TEST_FIELD_ID" ] || [ -z "$TEST_ITEM_ID" ]; then
      echo "ERROR: missing custom field or board item id"
      exit 1
    fi

    echo "Updating custom field definition and value"
    UPDATE_FIELD_STATUS="$(curl -s -o /tmp/makereadyos-update-field.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PATCH \
      -d '{"description":"QA field for custom value smoke test"}' \
      "http://localhost:${API_PORT:-4000}/api/custom-fields/$TEST_FIELD_ID")"
    VALUE_FIELD_STATUS="$(curl -s -o /tmp/makereadyos-value-field.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PUT \
      -d '{"value":"PASSED"}' \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TEST_ITEM_ID/custom-fields/$TEST_FIELD_ID")"
    REORDER_FIELD_STATUS="$(curl -s -o /tmp/makereadyos-reorder-field.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PUT \
      -d "{\"fieldIds\":[\"$TEST_FIELD_ID\"]}" \
      "http://localhost:${API_PORT:-4000}/api/custom-fields/reorder")"
    echo "Custom field update/value/reorder statuses: $UPDATE_FIELD_STATUS/$VALUE_FIELD_STATUS/$REORDER_FIELD_STATUS"
    if [ "$UPDATE_FIELD_STATUS" != "200" ] || [ "$VALUE_FIELD_STATUS" != "200" ] || [ "$REORDER_FIELD_STATUS" != "200" ]; then
      cat /tmp/makereadyos-update-field.json /tmp/makereadyos-value-field.json /tmp/makereadyos-reorder-field.json
      exit 1
    fi
    CUSTOM_ITEM_QUERY_STATUS="$(curl -s -o /tmp/makereadyos-custom-item-query.json -b "$COOKIE_JAR" -w "%{http_code}" --get \
      --data-urlencode "propertyId=$TEST_PROPERTY_ID" \
      --data-urlencode "customFieldFilters=[{\"fieldId\":\"$TEST_FIELD_ID\",\"operator\":\"equals\",\"value\":\"PASSED\"}]" \
      --data-urlencode "limit=10" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items")"
    if [ "$CUSTOM_ITEM_QUERY_STATUS" != "200" ]; then
      cat /tmp/makereadyos-custom-item-query.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const items=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const target=process.argv[2]; const field=process.argv[3]; if (!Array.isArray(items) || !items.some((item)=>item.id===target) || items.some((item)=>!item.customFieldValues.some((value)=>value.customFieldId===field && value.value==="PASSED"))) process.exit(1);' /tmp/makereadyos-custom-item-query.json "$TEST_ITEM_ID" "$TEST_FIELD_ID"

    echo "Checking saved view stores custom-field structured filters"
    CUSTOM_FILTER_VIEW_STATUS="$(curl -s -o /tmp/makereadyos-custom-filter-view.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PATCH \
      -d "{\"filters\":{\"archiveState\":\"active\",\"customFieldFilters\":[{\"fieldId\":\"$TEST_FIELD_ID\",\"operator\":\"equals\",\"value\":\"PASSED\"}]}}" \
      "http://localhost:${API_PORT:-4000}/api/saved-views/$TEST_VIEW_ID")"
    echo "Custom filter saved view status: $CUSTOM_FILTER_VIEW_STATUS"
    if [ "$CUSTOM_FILTER_VIEW_STATUS" != "200" ]; then
      cat /tmp/makereadyos-custom-filter-view.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const filters=body.view?.filters || {}; const custom=filters.customFieldFilters || []; if (custom.length !== 1 || custom[0].fieldId !== process.argv[2] || custom[0].operator !== "equals" || custom[0].value !== "PASSED") process.exit(1);' /tmp/makereadyos-custom-filter-view.json "$TEST_FIELD_ID"

    echo "Checking custom-field conditions for preview and scheduled execution"
    TEST_DATE_FIELD_JSON="$(mktemp)"
    CREATE_DATE_FIELD_STATUS="$(curl -s -o "$TEST_DATE_FIELD_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d '{"label":"QA Scheduled Inspection Date","fieldType":"DATE"}' \
      "http://localhost:${API_PORT:-4000}/api/custom-fields")"
    TEST_DATE_FIELD_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.field?.id || "");' "$TEST_DATE_FIELD_JSON")"
    YESTERDAY_DATE="$(date -d yesterday +%F)"
    DATE_VALUE_STATUS="$(curl -s -o /tmp/makereadyos-date-value-field.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X PUT \
      -d "{\"value\":\"$YESTERDAY_DATE\"}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TEST_ITEM_ID/custom-fields/$TEST_DATE_FIELD_ID")"
    if [ "$CREATE_DATE_FIELD_STATUS" != "201" ] || [ -z "$TEST_DATE_FIELD_ID" ] || [ "$DATE_VALUE_STATUS" != "200" ]; then
      cat "$TEST_DATE_FIELD_JSON" /tmp/makereadyos-date-value-field.json
      exit 1
    fi

    echo "Checking configurable schedule track lifecycle"
    SCHEDULE_TRACK_JSON="$(mktemp)"
    CREATE_SCHEDULE_TRACK_STATUS="$(curl -s -o "$SCHEDULE_TRACK_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"sourceField\":\"custom:$TEST_DATE_FIELD_ID\",\"displayName\":\"QA Inspection Track\",\"colorBasis\":\"FIELD\",\"colorSourceField\":\"paintStatus\",\"groupingMode\":\"BOARD_GROUP\",\"overdueEnabled\":false,\"moveInSoonEnabled\":false,\"isEnabled\":true}" \
      "http://localhost:${API_PORT:-4000}/api/operations/schedule-tracks")"
    TEST_SCHEDULE_TRACK_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.track?.id || "");' "$SCHEDULE_TRACK_JSON")"
    DISABLE_SCHEDULE_TRACK_STATUS="$(curl -s -o /tmp/makereadyos-schedule-track-disable.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X PATCH \
      -d '{"displayName":"QA Inspection Disabled","isEnabled":false}' \
      "http://localhost:${API_PORT:-4000}/api/operations/schedule-tracks/$TEST_SCHEDULE_TRACK_ID")"
    ARCHIVE_SCHEDULE_TRACK_STATUS="$(curl -s -o /tmp/makereadyos-schedule-track-archive.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/operations/schedule-tracks/$TEST_SCHEDULE_TRACK_ID/archive")"
    RESTORE_SCHEDULE_TRACK_STATUS="$(curl -s -o /tmp/makereadyos-schedule-track-restore.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" -X POST \
      "http://localhost:${API_PORT:-4000}/api/operations/schedule-tracks/$TEST_SCHEDULE_TRACK_ID/restore")"
    curl -fsS -o /tmp/makereadyos-meta-schedule-tracks.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/meta"
    echo "Schedule track statuses: create=$CREATE_SCHEDULE_TRACK_STATUS disable=$DISABLE_SCHEDULE_TRACK_STATUS archive=$ARCHIVE_SCHEDULE_TRACK_STATUS restore=$RESTORE_SCHEDULE_TRACK_STATUS"
    if [ "$CREATE_SCHEDULE_TRACK_STATUS" != "201" ] || [ "$DISABLE_SCHEDULE_TRACK_STATUS" != "200" ] || [ "$ARCHIVE_SCHEDULE_TRACK_STATUS" != "200" ] || [ "$RESTORE_SCHEDULE_TRACK_STATUS" != "200" ]; then
      cat "$SCHEDULE_TRACK_JSON" /tmp/makereadyos-schedule-track-disable.json /tmp/makereadyos-schedule-track-archive.json /tmp/makereadyos-schedule-track-restore.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const meta=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (meta.scheduleTracks.some((track) => track.id === process.argv[2])) process.exit(1);' /tmp/makereadyos-meta-schedule-tracks.json "$TEST_SCHEDULE_TRACK_ID"
    echo "Disabled schedule track is omitted from active calendar metadata"

    CUSTOM_STATUS_RULE_JSON="$(mktemp)"
    CUSTOM_STATUS_RULE_STATUS="$(curl -s -o "$CUSTOM_STATUS_RULE_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"QA scheduled custom status\",\"triggerType\":\"SCHEDULED_CHECK\",\"enabled\":true,\"propertyId\":\"$TEST_PROPERTY_ID\",\"conditions\":{\"all\":[{\"customFieldId\":\"$TEST_FIELD_ID\",\"operator\":\"equals\",\"value\":\"PASSED\"}]},\"actions\":[{\"type\":\"addAuditNote\",\"value\":\"QA custom status matched.\"}]}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    CUSTOM_STATUS_RULE_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.rule?.id || "");' "$CUSTOM_STATUS_RULE_JSON")"
    CUSTOM_STATUS_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-custom-status-preview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"ruleId\":\"$CUSTOM_STATUS_RULE_ID\",\"propertyId\":\"$TEST_PROPERTY_ID\",\"limit\":5}" \
      "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    CUSTOM_STATUS_MANUAL_STATUS="$(curl -s -o /tmp/makereadyos-custom-status-manual.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/automations/$CUSTOM_STATUS_RULE_ID/run")"

    CUSTOM_DATE_RULE_JSON="$(mktemp)"
    CUSTOM_DATE_RULE_STATUS="$(curl -s -o "$CUSTOM_DATE_RULE_JSON" -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"QA scheduled custom date\",\"triggerType\":\"SCHEDULED_CHECK\",\"enabled\":true,\"propertyId\":\"$TEST_PROPERTY_ID\",\"conditions\":{\"all\":[{\"customFieldId\":\"$TEST_DATE_FIELD_ID\",\"operator\":\"dateBeforeToday\"}]},\"actions\":[{\"type\":\"addAuditNote\",\"value\":\"QA custom date matched.\"}]}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    CUSTOM_DATE_RULE_ID="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.rule?.id || "");' "$CUSTOM_DATE_RULE_JSON")"
    CUSTOM_DATE_DRAFT_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-custom-date-preview.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"draft\":{\"name\":\"QA custom date preview\",\"triggerType\":\"SCHEDULED_CHECK\",\"enabled\":false,\"propertyId\":\"$TEST_PROPERTY_ID\",\"conditions\":{\"all\":[{\"customFieldId\":\"$TEST_DATE_FIELD_ID\",\"operator\":\"dateBeforeToday\"}]},\"actions\":[{\"type\":\"addAuditNote\",\"value\":\"Dry run only.\"}]},\"propertyId\":\"$TEST_PROPERTY_ID\",\"limit\":5}" \
      "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    INVALID_CUSTOM_RULE_STATUS="$(curl -s -o /tmp/makereadyos-invalid-custom-rule.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -d "{\"name\":\"QA invalid status date operator\",\"triggerType\":\"SCHEDULED_CHECK\",\"enabled\":false,\"propertyId\":\"$TEST_PROPERTY_ID\",\"conditions\":{\"all\":[{\"customFieldId\":\"$TEST_FIELD_ID\",\"operator\":\"dateBeforeToday\"}]},\"actions\":[{\"type\":\"addAuditNote\",\"value\":\"Must reject.\"}]}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    echo "Custom condition statuses: status-rule=$CUSTOM_STATUS_RULE_STATUS preview=$CUSTOM_STATUS_PREVIEW_STATUS manual=$CUSTOM_STATUS_MANUAL_STATUS date-rule=$CUSTOM_DATE_RULE_STATUS date-preview=$CUSTOM_DATE_DRAFT_PREVIEW_STATUS invalid=$INVALID_CUSTOM_RULE_STATUS"
    if [ "$CUSTOM_STATUS_RULE_STATUS" != "201" ] || [ "$CUSTOM_STATUS_PREVIEW_STATUS" != "200" ] || [ "$CUSTOM_STATUS_MANUAL_STATUS" != "200" ] || [ "$CUSTOM_DATE_RULE_STATUS" != "201" ] || [ "$CUSTOM_DATE_DRAFT_PREVIEW_STATUS" != "200" ] || [ "$INVALID_CUSTOM_RULE_STATUS" != "400" ]; then
      cat "$CUSTOM_STATUS_RULE_JSON" /tmp/makereadyos-custom-status-preview.json /tmp/makereadyos-custom-status-manual.json "$CUSTOM_DATE_RULE_JSON" /tmp/makereadyos-custom-date-preview.json /tmp/makereadyos-invalid-custom-rule.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const statusPreview=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const manual=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); const datePreview=JSON.parse(fs.readFileSync(process.argv[3],"utf8")); const invalid=JSON.parse(fs.readFileSync(process.argv[4],"utf8")); if (statusPreview.matchingItemCount < 1 || manual.execution.matchedCount < 1 || datePreview.matchingItemCount < 1 || !invalid.message.includes("not valid for custom field")) process.exit(1);' /tmp/makereadyos-custom-status-preview.json /tmp/makereadyos-custom-status-manual.json /tmp/makereadyos-custom-date-preview.json /tmp/makereadyos-invalid-custom-rule.json
    ./run-automations.sh >/tmp/makereadyos-custom-date-scheduled-run.txt
    curl -fsS -o /tmp/makereadyos-custom-date-runs.json -b "$COOKIE_JAR" \
      "http://localhost:${API_PORT:-4000}/api/automations/runs?ruleId=$CUSTOM_DATE_RULE_ID&limit=1"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const run=body.runs?.[0]; if (!run || run.runType !== "SCHEDULED" || run.matchedCount < 1) process.exit(1);' /tmp/makereadyos-custom-date-runs.json
    echo "Custom-field preview, manual run, and scheduled-run validation passed"

    ARCHIVE_FIELD_STATUS="$(curl -s -o /tmp/makereadyos-archive-field.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X DELETE \
      "http://localhost:${API_PORT:-4000}/api/custom-fields/$TEST_FIELD_ID")"
    echo "Archive custom field status: $ARCHIVE_FIELD_STATUS"
    if [ "$ARCHIVE_FIELD_STATUS" != "200" ]; then
      cat /tmp/makereadyos-archive-field.json
      exit 1
    fi
    ACTIVE_FIELDS_AFTER_ARCHIVE_STATUS="$(curl -s -o /tmp/makereadyos-active-fields-after-archive.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/custom-fields")"
    RESTORE_FIELD_STATUS="$(curl -s -o /tmp/makereadyos-restore-field.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X POST \
      "http://localhost:${API_PORT:-4000}/api/custom-fields/$TEST_FIELD_ID/restore")"
    REARCHIVE_FIELD_STATUS="$(curl -s -o /tmp/makereadyos-rearchive-field.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X DELETE \
      "http://localhost:${API_PORT:-4000}/api/custom-fields/$TEST_FIELD_ID")"
    TRASH_FIELD_STATUS="$(curl -s -o /tmp/makereadyos-trash-field.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X POST \
      "http://localhost:${API_PORT:-4000}/api/custom-fields/$TEST_FIELD_ID/trash")"
    DELETED_FIELDS_STATUS="$(curl -s -o /tmp/makereadyos-deleted-fields.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/custom-fields?includeArchived=true&includeDeleted=true")"
    META_AFTER_TRASH_STATUS="$(curl -s -o /tmp/makereadyos-meta-after-trash.json -b "$COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/meta")"
    EARLY_PERMANENT_DELETE_STATUS="$(curl -s -o /tmp/makereadyos-permanent-field-early.json -b "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X DELETE \
      "http://localhost:${API_PORT:-4000}/api/custom-fields/$TEST_FIELD_ID/permanent")"
    echo "Custom field lifecycle statuses: activeAfterArchive=$ACTIVE_FIELDS_AFTER_ARCHIVE_STATUS restore=$RESTORE_FIELD_STATUS rearchive=$REARCHIVE_FIELD_STATUS trash=$TRASH_FIELD_STATUS deletedList=$DELETED_FIELDS_STATUS metaAfterTrash=$META_AFTER_TRASH_STATUS earlyPermanentDelete=$EARLY_PERMANENT_DELETE_STATUS"
    if [ "$ACTIVE_FIELDS_AFTER_ARCHIVE_STATUS" != "200" ] || [ "$RESTORE_FIELD_STATUS" != "200" ] || [ "$REARCHIVE_FIELD_STATUS" != "200" ] || [ "$TRASH_FIELD_STATUS" != "200" ] || [ "$DELETED_FIELDS_STATUS" != "200" ] || [ "$META_AFTER_TRASH_STATUS" != "200" ] || [ "$EARLY_PERMANENT_DELETE_STATUS" != "409" ]; then
      cat /tmp/makereadyos-active-fields-after-archive.json /tmp/makereadyos-restore-field.json /tmp/makereadyos-rearchive-field.json /tmp/makereadyos-trash-field.json /tmp/makereadyos-deleted-fields.json /tmp/makereadyos-meta-after-trash.json /tmp/makereadyos-permanent-field-early.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const active=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const deleted=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); const meta=JSON.parse(fs.readFileSync(process.argv[3],"utf8")); const fieldId=process.argv[4]; if (active.fields.some((field) => field.id === fieldId)) process.exit(1); const trashed=deleted.fields.find((field) => field.id === fieldId); if (!trashed || !trashed.deletedAt || !trashed.deleteAfter) process.exit(1); if (meta.customFields.some((field) => field.id === fieldId)) process.exit(1);' /tmp/makereadyos-active-fields-after-archive.json /tmp/makereadyos-deleted-fields.json /tmp/makereadyos-meta-after-trash.json "$TEST_FIELD_ID"
    echo "Custom field archive, restore, trash, and retention validation passed"
    echo "Checking optional synthetic large-data seed tooling"
    LARGE_SEED_COUNT=3 LARGE_SEED_PREFIX="QA-LARGE-${TIMESTAMP//-/}" ./seed-large.sh
    LARGE_ITEMS_STATUS="$(curl -s -o /tmp/makereadyos-large-items.json -b "$COOKIE_JAR" -w "%{http_code}" --get \
      --data-urlencode "q=QA-LARGE-${TIMESTAMP//-/}" --data-urlencode "limit=10" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items")"
    LARGE_DASHBOARD_STATUS="$(curl -s -o /tmp/makereadyos-large-dashboard.json -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/dashboard")"
    if [ "$LARGE_ITEMS_STATUS" != "200" ] || [ "$LARGE_DASHBOARD_STATUS" != "200" ]; then
      cat /tmp/makereadyos-large-items.json /tmp/makereadyos-large-dashboard.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const items=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!Array.isArray(items) || items.length !== 3) process.exit(1);' /tmp/makereadyos-large-items.json
    echo "Authenticated route checks passed"
    echo

    echo "Checking logout blocks session reuse"
    LOGOUT_STATUS="$(curl -s -o /tmp/makereadyos-logout.json -b "$COOKIE_JAR" -c "$COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $ADMIN_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/auth/logout")"
    echo "Logout status: $LOGOUT_STATUS"
    if [ "$LOGOUT_STATUS" != "200" ]; then
      cat /tmp/makereadyos-logout.json
      exit 1
    fi
    POST_LOGOUT_STATUS="$(curl -s -o /dev/null -b "$COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/auth/me")"
    echo "Post-logout /me status: $POST_LOGOUT_STATUS"
    if [ "$POST_LOGOUT_STATUS" != "401" ]; then
      echo "ERROR: logout did not invalidate current session"
      exit 1
    fi
    echo

    MANAGER_COOKIE_JAR="$(mktemp)"
    MANAGER_LOGIN_JSON="$(mktemp)"
    echo "Checking manager activity is limited to property-scoped events"
    MANAGER_LOGIN_STATUS="$(curl -s -o "$MANAGER_LOGIN_JSON" -c "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"TempUser!23456\"}" \
      "http://localhost:${API_PORT:-4000}/api/auth/login")"
    if [ "$MANAGER_LOGIN_STATUS" != "200" ]; then
      cat "$MANAGER_LOGIN_JSON"
      exit 1
    fi
    MANAGER_CSRF_TOKEN="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.csrfToken || "");' "$MANAGER_LOGIN_JSON")"
    MANAGER_ACTIVITY_JSON="$(mktemp)"
    MANAGER_ACTIVITY_STATUS="$(curl -s -o "$MANAGER_ACTIVITY_JSON" -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/activity?propertyId=$TEST_PROPERTY_ID&limit=5")"
    MANAGER_UNSCOPED_JSON="$(mktemp)"
    MANAGER_UNSCOPED_STATUS="$(curl -s -o "$MANAGER_UNSCOPED_JSON" -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/activity?action=BACKUP_EXPORTED")"
    MANAGER_AUTOMATION_STATUS="$(curl -s -o /tmp/makereadyos-manager-automations.json -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    MANAGER_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-manager-preview.json -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $MANAGER_CSRF_TOKEN" \
      -d "{\"ruleId\":\"$TEST_AUTOMATION_ID\",\"propertyId\":\"$TEST_PROPERTY_ID\",\"limit\":5}" \
      "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    MANAGER_OUT_OF_SCOPE_PREVIEW_STATUS="403"
    if [ -n "$OTHER_PROPERTY_ID" ]; then
      MANAGER_OUT_OF_SCOPE_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-manager-out-of-scope-preview.json -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "X-CSRF-Token: $MANAGER_CSRF_TOKEN" \
        -d "{\"draft\":{\"name\":\"Out of Scope Preview\",\"enabled\":false,\"triggerType\":\"ITEM_UPDATED\",\"propertyId\":\"$OTHER_PROPERTY_ID\",\"conditions\":{\"all\":[{\"field\":\"unitNumber\",\"operator\":\"notEmpty\"}]},\"actions\":[{\"type\":\"addAuditNote\",\"value\":\"No access\"}]}}" \
        "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    fi
    echo "Manager activity/automation statuses: property=$MANAGER_ACTIVITY_STATUS unscoped=$MANAGER_UNSCOPED_STATUS automations=$MANAGER_AUTOMATION_STATUS preview=$MANAGER_PREVIEW_STATUS out-of-scope=$MANAGER_OUT_OF_SCOPE_PREVIEW_STATUS"
    if [ "$MANAGER_ACTIVITY_STATUS" != "200" ] || [ "$MANAGER_UNSCOPED_STATUS" != "200" ] || [ "$MANAGER_AUTOMATION_STATUS" != "200" ] || [ "$MANAGER_PREVIEW_STATUS" != "200" ] || [ "$MANAGER_OUT_OF_SCOPE_PREVIEW_STATUS" != "403" ]; then
      cat "$MANAGER_ACTIVITY_JSON" "$MANAGER_UNSCOPED_JSON"
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (body.activity.length !== 0) process.exit(1);' "$MANAGER_UNSCOPED_JSON"
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const propertyId=process.argv[2]; if (!body.preview || body.affectedItems.some((item) => item.property.id !== propertyId)) process.exit(1);' /tmp/makereadyos-manager-preview.json "$TEST_PROPERTY_ID"
    MANAGER_RUN_STATUS="$(curl -s -o /tmp/makereadyos-manager-run.json -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $MANAGER_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/automations/$TEST_SCHEDULED_AUTOMATION_ID/run")"
    MANAGER_TEMPLATE_INSTALL_STATUS="$(curl -s -o /tmp/makereadyos-manager-template-install.json -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $MANAGER_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\"}" \
      "http://localhost:${API_PORT:-4000}/api/automations/templates/flooring-date-missing/install")"
    MANAGER_UNITS_STATUS="$(curl -s -o /tmp/makereadyos-manager-units.json -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operations/units?propertyId=$TEST_PROPERTY_ID")"
    MANAGER_OUT_OF_SCOPE_UNIT_STATUS="403"
    MANAGER_OUT_OF_SCOPE_ITEMS_STATUS="403"
    if [ -n "$OTHER_PROPERTY_ID" ]; then
      MANAGER_OUT_OF_SCOPE_UNIT_STATUS="$(curl -s -o /tmp/makereadyos-manager-unit-denied.json -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "X-CSRF-Token: $MANAGER_CSRF_TOKEN" \
        -d "{\"propertyId\":\"$OTHER_PROPERTY_ID\",\"number\":\"DENIED-QA\"}" \
        "http://localhost:${API_PORT:-4000}/api/operations/units")"
      MANAGER_OUT_OF_SCOPE_ITEMS_STATUS="$(curl -s -o /tmp/makereadyos-manager-items-denied.json -b "$MANAGER_COOKIE_JAR" -w "%{http_code}" \
        "http://localhost:${API_PORT:-4000}/api/make-ready-items?propertyId=$OTHER_PROPERTY_ID")"
    fi
    echo "Manager scoped manual/template/unit/item statuses: $MANAGER_RUN_STATUS/$MANAGER_TEMPLATE_INSTALL_STATUS/$MANAGER_UNITS_STATUS/$MANAGER_OUT_OF_SCOPE_UNIT_STATUS/$MANAGER_OUT_OF_SCOPE_ITEMS_STATUS"
    if [ "$MANAGER_RUN_STATUS" != "200" ] || [ "$MANAGER_TEMPLATE_INSTALL_STATUS" != "201" ] || [ "$MANAGER_UNITS_STATUS" != "200" ] || [ "$MANAGER_OUT_OF_SCOPE_UNIT_STATUS" != "403" ] || [ "$MANAGER_OUT_OF_SCOPE_ITEMS_STATUS" != "403" ]; then
      cat /tmp/makereadyos-manager-run.json /tmp/makereadyos-manager-template-install.json
      exit 1
    fi
    node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (body.rule.templateId !== "flooring-date-missing" || body.rule.enabled !== false || body.rule.propertyId !== process.argv[2]) process.exit(1);' /tmp/makereadyos-manager-template-install.json "$TEST_PROPERTY_ID"

    LEASING_COOKIE_JAR="$(mktemp)"
    LEASING_LOGIN_JSON="$(mktemp)"
    echo "Checking leasing role field permissions"
    LEASING_LOGIN_STATUS="$(curl -s -o "$LEASING_LOGIN_JSON" -c "$LEASING_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$LEASING_USER_EMAIL\",\"password\":\"TempLeasing!23456\"}" \
      "http://localhost:${API_PORT:-4000}/api/auth/login")"
    LEASING_CSRF_TOKEN="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.csrfToken || "");' "$LEASING_LOGIN_JSON")"
    LEASING_ALLOWED_STATUS="$(curl -s -o /tmp/makereadyos-leasing-allowed.json -b "$LEASING_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $LEASING_CSRF_TOKEN" \
      -X PATCH -d '{"vacancyStatus":"NTV"}' \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID")"
    LEASING_DENIED_STATUS="$(curl -s -o /tmp/makereadyos-leasing-denied.json -b "$LEASING_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $LEASING_CSRF_TOKEN" \
      -X PATCH -d '{"cleaningStatus":"DONE"}' \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID")"
    LEASING_LIBRARY_STATUS="$(curl -s -o /tmp/makereadyos-leasing-library.json -b "$LEASING_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operational-library/packs")"
    echo "Leasing statuses: login=$LEASING_LOGIN_STATUS allowed=$LEASING_ALLOWED_STATUS denied=$LEASING_DENIED_STATUS library=$LEASING_LIBRARY_STATUS"
    if [ "$LEASING_LOGIN_STATUS" != "200" ] || [ "$LEASING_ALLOWED_STATUS" != "200" ] || [ "$LEASING_DENIED_STATUS" != "403" ] || [ "$LEASING_LIBRARY_STATUS" != "403" ]; then
      cat "$LEASING_LOGIN_JSON" /tmp/makereadyos-leasing-allowed.json /tmp/makereadyos-leasing-denied.json /tmp/makereadyos-leasing-library.json
      exit 1
    fi

    CLEANER_COOKIE_JAR="$(mktemp)"
    CLEANER_LOGIN_JSON="$(mktemp)"
    echo "Checking cleaner role field permissions"
    CLEANER_LOGIN_STATUS="$(curl -s -o "$CLEANER_LOGIN_JSON" -c "$CLEANER_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$CLEANER_USER_EMAIL\",\"password\":\"TempCleaner!23456\"}" \
      "http://localhost:${API_PORT:-4000}/api/auth/login")"
    CLEANER_CSRF_TOKEN="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.csrfToken || "");' "$CLEANER_LOGIN_JSON")"
    CLEANER_ALLOWED_STATUS="$(curl -s -o /tmp/makereadyos-cleaner-allowed.json -b "$CLEANER_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $CLEANER_CSRF_TOKEN" \
      -X PATCH -d '{"cleaningStatus":"DONE"}' \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID")"
    CLEANER_DENIED_STATUS="$(curl -s -o /tmp/makereadyos-cleaner-denied.json -b "$CLEANER_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $CLEANER_CSRF_TOKEN" \
      -X PATCH -d '{"moveInDate":"2026-06-01"}' \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TURN_ITEM_ID")"
    echo "Cleaner statuses: login=$CLEANER_LOGIN_STATUS allowed=$CLEANER_ALLOWED_STATUS denied=$CLEANER_DENIED_STATUS"
    if [ "$CLEANER_LOGIN_STATUS" != "200" ] || [ "$CLEANER_ALLOWED_STATUS" != "200" ] || [ "$CLEANER_DENIED_STATUS" != "403" ]; then
      cat "$CLEANER_LOGIN_JSON" /tmp/makereadyos-cleaner-allowed.json /tmp/makereadyos-cleaner-denied.json
      exit 1
    fi

    TECH_COOKIE_JAR="$(mktemp)"
    TECH_LOGIN_JSON="$(mktemp)"
    TECH_LOGIN_PAYLOAD="{\"email\":\"${DEMO_TECH_EMAIL}\",\"password\":\"${DEMO_TECH_PASSWORD}\"}"
    echo "Logging in with demo tech user"
    TECH_LOGIN_STATUS="$(curl -s -o "$TECH_LOGIN_JSON" -c "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -d "$TECH_LOGIN_PAYLOAD" \
      "http://localhost:${API_PORT:-4000}/api/auth/login")"
    echo "Tech login status: $TECH_LOGIN_STATUS"
    if [ "$TECH_LOGIN_STATUS" != "200" ]; then
      cat "$TECH_LOGIN_JSON"
      exit 1
    fi
    TECH_CSRF_TOKEN="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.csrfToken || "");' "$TECH_LOGIN_JSON")"
    if [ -z "$TECH_CSRF_TOKEN" ]; then
      echo "ERROR: missing tech csrf token"
      exit 1
    fi
    NON_ADMIN_STATUS="$(curl -s -o /tmp/makereadyos-non-admin.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/admin/users")"
    echo "Admin route status as tech: $NON_ADMIN_STATUS"
    if [ "$NON_ADMIN_STATUS" != "403" ]; then
      cat /tmp/makereadyos-non-admin.json
      exit 1
    fi
    NON_ADMIN_EXPORT_STATUS="$(curl -s -o /tmp/makereadyos-tech-export.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/admin/export")"
    NON_ADMIN_IMPORT_STATUS="$(curl -s -o /tmp/makereadyos-tech-import.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -d '{"dryRun":true,"mode":"merge","backup":{}}' \
      "http://localhost:${API_PORT:-4000}/api/admin/import")"
    echo "Native backup statuses as tech: export=$NON_ADMIN_EXPORT_STATUS import=$NON_ADMIN_IMPORT_STATUS"
    if [ "$NON_ADMIN_EXPORT_STATUS" != "403" ] || [ "$NON_ADMIN_IMPORT_STATUS" != "403" ]; then
      cat /tmp/makereadyos-tech-export.json /tmp/makereadyos-tech-import.json
      exit 1
    fi
    TECH_ACTIVITY_STATUS="$(curl -s -o /tmp/makereadyos-tech-activity.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/activity")"
    echo "Activity status as tech: $TECH_ACTIVITY_STATUS"
    if [ "$TECH_ACTIVITY_STATUS" != "403" ]; then
      cat /tmp/makereadyos-tech-activity.json
      exit 1
    fi
    TECH_AUTOMATION_STATUS="$(curl -s -o /tmp/makereadyos-tech-automations.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/automations")"
    echo "Automation status as tech: $TECH_AUTOMATION_STATUS"
    if [ "$TECH_AUTOMATION_STATUS" != "403" ]; then
      cat /tmp/makereadyos-tech-automations.json
      exit 1
    fi
    TECH_PREVIEW_STATUS="$(curl -s -o /tmp/makereadyos-tech-preview.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -d "{\"ruleId\":\"$TEST_AUTOMATION_ID\"}" \
      "http://localhost:${API_PORT:-4000}/api/automations/preview")"
    echo "Automation preview status as tech: $TECH_PREVIEW_STATUS"
    if [ "$TECH_PREVIEW_STATUS" != "403" ]; then
      cat /tmp/makereadyos-tech-preview.json
      exit 1
    fi
    TECH_RUN_STATUS="$(curl -s -o /tmp/makereadyos-tech-run.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/automations/$TEST_SCHEDULED_AUTOMATION_ID/run")"
    TECH_TEMPLATE_INSTALL_STATUS="$(curl -s -o /tmp/makereadyos-tech-template-install.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\"}" \
      "http://localhost:${API_PORT:-4000}/api/automations/templates/missing-make-ready-date/install")"
    TECH_LIBRARY_STATUS="$(curl -s -o /tmp/makereadyos-tech-library.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operational-library/packs")"
    TECH_PROPERTY_TEMPLATE_STATUS="$(curl -s -o /tmp/makereadyos-tech-property-templates.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-templates")"
    TECH_PROPERTY_TEMPLATE_CREATE_STATUS="$(curl -s -o /tmp/makereadyos-tech-property-template-create.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"name\":\"Denied Tech Template $TIMESTAMP\",\"include\":{\"boardSections\":true}}" \
      "http://localhost:${API_PORT:-4000}/api/property-templates/from-property")"
    TECH_OPERATIONS_STATUS="$(curl -s -o /tmp/makereadyos-tech-operations.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operations/units")"
    TECH_SECTION_STATUS="$(curl -s -o /tmp/makereadyos-tech-sections.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/operations/board-sections")"
    TECH_DASHBOARD_STATUS="$(curl -s -o /tmp/makereadyos-tech-dashboard.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/dashboard")"
    TECH_MY_WORK_STATUS="$(curl -s -o /tmp/makereadyos-tech-my-work.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/my-work")"
    TECH_PLANNING_STATUS="$(curl -s -o /tmp/makereadyos-tech-planning.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/planning?propertyId=$TEST_PROPERTY_ID")"
    TECH_PLANNING_CREATE_STATUS="$(curl -s -o /tmp/makereadyos-tech-planning-create.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -d "{\"assignedUserId\":\"$ADMIN_USER_ID\",\"itemId\":\"$TURN_ITEM_ID\",\"category\":\"Denied\",\"plannedDate\":\"2026-05-27\",\"estimatedHours\":1}" \
      "http://localhost:${API_PORT:-4000}/api/planning/blocks")"
    TECH_MAP_LIST_STATUS="$(curl -s -o /tmp/makereadyos-tech-map-list.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/property-maps?propertyId=$TEST_PROPERTY_ID")"
    TECH_MAP_CREATE_STATUS="$(curl -s -o /tmp/makereadyos-tech-map-create.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\",\"name\":\"Denied Tech Map\"}" \
      "http://localhost:${API_PORT:-4000}/api/property-maps")"
    TECH_RISK_EVALUATE_STATUS="$(curl -s -o /tmp/makereadyos-tech-risk-evaluate.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $TECH_CSRF_TOKEN" -X POST \
      -d "{\"propertyId\":\"$TEST_PROPERTY_ID\"}" \
      "http://localhost:${API_PORT:-4000}/api/risk/evaluate")"
    TECH_TEMPLATE_CREATE_STATUS="$(curl -s -o /tmp/makereadyos-tech-checklist-template.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -d '{"name":"Denied Template","items":[{"title":"Denied"}]}' \
      "http://localhost:${API_PORT:-4000}/api/checklist-templates")"
    TECH_BATCH_STATUS="$(curl -s -o /tmp/makereadyos-tech-batch.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -d "{\"action\":\"MOVE_GROUP\",\"ids\":[\"$TURN_ITEM_ID\"],\"boardGroup\":\"READY_UNITS_TA\"}" \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/batch")"
    echo "Automation/manual/operations/checklist/library status as tech: $TECH_RUN_STATUS/$TECH_TEMPLATE_INSTALL_STATUS/$TECH_OPERATIONS_STATUS/$TECH_SECTION_STATUS/$TECH_BATCH_STATUS/$TECH_TEMPLATE_CREATE_STATUS/$TECH_LIBRARY_STATUS/$TECH_PROPERTY_TEMPLATE_STATUS/$TECH_PROPERTY_TEMPLATE_CREATE_STATUS; dashboard=$TECH_DASHBOARD_STATUS my-work=$TECH_MY_WORK_STATUS planning=$TECH_PLANNING_STATUS/$TECH_PLANNING_CREATE_STATUS risk-evaluate=$TECH_RISK_EVALUATE_STATUS maps=$TECH_MAP_LIST_STATUS/$TECH_MAP_CREATE_STATUS"
    if [ "$TECH_RUN_STATUS" != "403" ] || [ "$TECH_TEMPLATE_INSTALL_STATUS" != "403" ] || [ "$TECH_LIBRARY_STATUS" != "403" ] || [ "$TECH_PROPERTY_TEMPLATE_STATUS" != "403" ] || [ "$TECH_PROPERTY_TEMPLATE_CREATE_STATUS" != "403" ] || [ "$TECH_OPERATIONS_STATUS" != "403" ] || [ "$TECH_SECTION_STATUS" != "403" ] || [ "$TECH_BATCH_STATUS" != "403" ] || [ "$TECH_TEMPLATE_CREATE_STATUS" != "403" ] || [ "$TECH_RISK_EVALUATE_STATUS" != "403" ] || [ "$TECH_DASHBOARD_STATUS" != "200" ] || [ "$TECH_MY_WORK_STATUS" != "200" ] || [ "$TECH_PLANNING_STATUS" != "200" ] || [ "$TECH_PLANNING_CREATE_STATUS" != "403" ] || [ "$TECH_MAP_LIST_STATUS" != "200" ] || [ "$TECH_MAP_CREATE_STATUS" != "403" ]; then
      cat /tmp/makereadyos-tech-run.json /tmp/makereadyos-tech-template-install.json /tmp/makereadyos-tech-operations.json /tmp/makereadyos-tech-property-templates.json /tmp/makereadyos-tech-property-template-create.json /tmp/makereadyos-tech-map-create.json /tmp/makereadyos-tech-planning-create.json
      exit 1
    fi

    echo "Checking saved view routes as tech"
    TECH_VIEWS_STATUS="$(curl -s -o /tmp/makereadyos-tech-views.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/saved-views?module=make-ready")"
    echo "Tech saved views status: $TECH_VIEWS_STATUS"
    if [ "$TECH_VIEWS_STATUS" != "200" ]; then
      cat /tmp/makereadyos-tech-views.json
      exit 1
    fi

    echo "Checking tech cannot create shared saved view"
    TECH_SHARED_VIEW_STATUS="$(curl -s -o /tmp/makereadyos-tech-shared-view.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -d '{"name":"Tech Shared Attempt","module":"make-ready","viewType":"table","filters":{},"isShared":true}' \
      "http://localhost:${API_PORT:-4000}/api/saved-views")"
    echo "Tech shared saved view status: $TECH_SHARED_VIEW_STATUS"
    if [ "$TECH_SHARED_VIEW_STATUS" != "403" ]; then
      cat /tmp/makereadyos-tech-shared-view.json
      exit 1
    fi

    echo "Checking tech cannot manage custom fields"
    TECH_CUSTOM_FIELD_STATUS="$(curl -s -o /tmp/makereadyos-tech-custom-fields.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      "http://localhost:${API_PORT:-4000}/api/custom-fields")"
    TECH_CUSTOM_VALUE_STATUS="$(curl -s -o /tmp/makereadyos-tech-custom-value.json -b "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -X PUT \
      -d '{"value":"PENDING"}' \
      "http://localhost:${API_PORT:-4000}/api/make-ready-items/$TEST_ITEM_ID/custom-fields/$TEST_FIELD_ID")"
    echo "Tech custom field/value statuses: $TECH_CUSTOM_FIELD_STATUS/$TECH_CUSTOM_VALUE_STATUS"
    if [ "$TECH_CUSTOM_FIELD_STATUS" != "403" ] || [ "$TECH_CUSTOM_VALUE_STATUS" != "403" ]; then
      cat /tmp/makereadyos-tech-custom-fields.json /tmp/makereadyos-tech-custom-value.json
      exit 1
    fi

    LOGOUT_ALL_STATUS="$(curl -s -o /tmp/makereadyos-logout-all.json -b "$TECH_COOKIE_JAR" -c "$TECH_COOKIE_JAR" -w "%{http_code}" \
      -H "X-CSRF-Token: $TECH_CSRF_TOKEN" \
      -X POST "http://localhost:${API_PORT:-4000}/api/auth/logout-all")"
    echo "Logout-all status: $LOGOUT_ALL_STATUS"
    if [ "$LOGOUT_ALL_STATUS" != "200" ]; then
      cat /tmp/makereadyos-logout-all.json
      exit 1
    fi
    POST_LOGOUT_ALL_STATUS="$(curl -s -o /dev/null -b "$TECH_COOKIE_JAR" -w "%{http_code}" "http://localhost:${API_PORT:-4000}/api/auth/me")"
    echo "Post-logout-all /me status: $POST_LOGOUT_ALL_STATUS"
    if [ "$POST_LOGOUT_ALL_STATUS" != "401" ]; then
      echo "ERROR: logout-all did not invalidate current session"
      exit 1
    fi
    echo

    rm -f "$COOKIE_JAR" "$MANAGER_COOKIE_JAR" "$TECH_COOKIE_JAR" "$VIEWER_COOKIE_JAR" "$ADMIN_LOGIN_JSON" "$MANAGER_LOGIN_JSON" "$TECH_LOGIN_JSON" "$VIEWER_LOGIN_JSON" \
      "$TEST_USER_JSON" "$TEST_AUTOMATION_JSON" "$TEST_SCHEDULED_AUTOMATION_JSON" "$ADMIN_TEMPLATES_JSON" "$INSTALLED_TEMPLATE_JSON" "$ADMIN_PROPERTIES_JSON" "$ADMIN_ACTIVITY_JSON" "$MANAGER_ACTIVITY_JSON" "$MANAGER_UNSCOPED_JSON" /tmp/makereadyos-login-bad.json /tmp/makereadyos-admin.json \
      "$PREVIEW_ITEMS_BEFORE" "$PREVIEW_ITEMS_AFTER" /tmp/makereadyos-admin-automation-preview.json /tmp/makereadyos-draft-automation-preview.json /tmp/makereadyos-invalid-automation-preview.json /tmp/makereadyos-manager-preview.json /tmp/makereadyos-tech-preview.json \
      /tmp/makereadyos-manager-out-of-scope-preview.json \
      "$OPS_PROPERTY_JSON" "$OPS_UNIT_JSON" "$TURN_UNIT_JSON" "$TURN_ITEM_JSON" /tmp/makereadyos-ops-properties.json /tmp/makereadyos-ops-property-update.json /tmp/makereadyos-ops-property-archive.json /tmp/makereadyos-ops-property-restore.json /tmp/makereadyos-ops-property-delete.json /tmp/makereadyos-ops-unit-update.json /tmp/makereadyos-ops-unit-archive.json /tmp/makereadyos-ops-unit-restore.json /tmp/makereadyos-turn-archive.json /tmp/makereadyos-turn-restore.json \
      /tmp/makereadyos-update-user.json /tmp/makereadyos-property-access.json /tmp/makereadyos-last-admin.json \
      /tmp/makereadyos-logout.json /tmp/makereadyos-non-admin.json /tmp/makereadyos-logout-all.json \
      "$TEST_FIELD_JSON" "$TEST_DATE_FIELD_JSON" "$CUSTOM_STATUS_RULE_JSON" "$CUSTOM_DATE_RULE_JSON" "$TEST_ITEM_JSON" /tmp/makereadyos-custom-fields.json /tmp/makereadyos-update-field.json \
      /tmp/makereadyos-value-field.json /tmp/makereadyos-reorder-field.json /tmp/makereadyos-custom-item-query.json /tmp/makereadyos-archive-field.json /tmp/makereadyos-tech-custom-fields.json \
      /tmp/makereadyos-active-fields-after-archive.json /tmp/makereadyos-restore-field.json /tmp/makereadyos-rearchive-field.json /tmp/makereadyos-trash-field.json /tmp/makereadyos-deleted-fields.json /tmp/makereadyos-meta-after-trash.json /tmp/makereadyos-permanent-field-early.json \
      /tmp/makereadyos-date-value-field.json /tmp/makereadyos-custom-status-preview.json /tmp/makereadyos-custom-status-manual.json /tmp/makereadyos-custom-date-preview.json /tmp/makereadyos-invalid-custom-rule.json /tmp/makereadyos-custom-date-scheduled-run.txt /tmp/makereadyos-custom-date-runs.json \
      /tmp/makereadyos-tech-custom-value.json /tmp/makereadyos-tech-activity.json /tmp/makereadyos-admin-automations.json \
      /tmp/makereadyos-risk-evaluate.json /tmp/makereadyos-risk-summary.json /tmp/makereadyos-risk-items.json /tmp/makereadyos-tech-risk-evaluate.json \
      /tmp/makereadyos-item-query.json /tmp/makereadyos-structured-item-query.json /tmp/makereadyos-attachment-invalid.json /tmp/makereadyos-attachment-metadata.json /tmp/makereadyos-attachment-markup.json /tmp/makereadyos-attachment-download.txt /tmp/makereadyos-attachment-archive.zip /tmp/makereadyos-attachment-delete.json /tmp/makereadyos-large-items.json /tmp/makereadyos-large-dashboard.json /tmp/makereadyos-manager-items-denied.json \
      /tmp/makereadyos-template-missing-setup.json /tmp/makereadyos-automations-after-template.json /tmp/makereadyos-toggle-automation.json /tmp/makereadyos-automation-runs.json /tmp/makereadyos-manager-automations.json /tmp/makereadyos-manager-run.json /tmp/makereadyos-manager-template-install.json \
      /tmp/makereadyos-tech-automations.json /tmp/makereadyos-viewer-automations.json /tmp/makereadyos-viewer-run.json /tmp/makereadyos-viewer-template-install.json /tmp/makereadyos-viewer-operations.json /tmp/makereadyos-tech-run.json /tmp/makereadyos-tech-template-install.json /tmp/makereadyos-tech-operations.json /tmp/makereadyos-manager-units.json /tmp/makereadyos-manager-unit-denied.json \
      /tmp/makereadyos-scheduled-run-first.txt /tmp/makereadyos-scheduled-run-second.txt /tmp/makereadyos-scheduled-runs-first.json /tmp/makereadyos-scheduled-runs-second.json \
      /tmp/makereadyos-scheduled-activity-first.json /tmp/makereadyos-scheduled-activity-second.json /tmp/makereadyos-scheduled-note-count.txt
  else
    echo "Docker not installed; skipping compose validation"
    echo
  fi

  echo "Test run completed: $(date -Iseconds)"
} 2>&1 | tee "$LOG_FILE"

echo "Test log written to $LOG_FILE"
