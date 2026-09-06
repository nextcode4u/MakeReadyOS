#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$ROOT_DIR/test-environment.sh"
export API_PORT=14999
export WEB_PORT=18080
docker compose config --format json | node -e '
const assert = require("node:assert/strict");
const config = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
assert.equal(String(config.services.api.environment.PORT), "4000");
assert.equal(config.services.api.ports[0].target, 4000);
assert.equal(String(config.services.api.ports[0].published), "14999");
assert.equal(config.services.web.ports[0].target, 80);
assert.equal(String(config.services.web.ports[0].published), "18080");
assert.equal(config.services.web.depends_on.api.condition, "service_healthy");
assert.ok(config.services.api.healthcheck.test.join(" ").includes("127.0.0.1:4000/health"));
console.log("Compose keeps internal ports stable and waits for API health");
'

if [[ "${1:-}" == "--startup" ]]; then
  trap 'docker compose down -v >/dev/null 2>&1 || true' EXIT
  docker compose up --build -d --wait --wait-timeout 180
  curl --fail --silent --show-error "http://127.0.0.1:$API_PORT/health"
  curl --fail --silent --show-error "http://127.0.0.1:$WEB_PORT/" >/dev/null
  status="$(curl --silent --show-error -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/api/auth/me")"
  [[ "$status" == "401" ]]
  echo "Custom-port API and web proxy startup checks passed"
fi
