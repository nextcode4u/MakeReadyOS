#!/usr/bin/env bash
set -euo pipefail

: "${MAKEREADYOS_URL:=http://localhost:4000}"
: "${MAKEREADYOS_TOKEN:?Set MAKEREADYOS_TOKEN to a MakeReadyOS API token with write:comments}"
: "${MAKEREADYOS_ITEM_ID:?Set MAKEREADYOS_ITEM_ID to a make-ready item id}"
: "${MAKEREADYOS_COMMENT:=Integration note from curl example}"

curl -fsS \
  -H "Authorization: Bearer ${MAKEREADYOS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"body\":\"${MAKEREADYOS_COMMENT}\",\"category\":\"INTEGRATION\"}" \
  "${MAKEREADYOS_URL%/}/api/make-ready-items/${MAKEREADYOS_ITEM_ID}/comments"
