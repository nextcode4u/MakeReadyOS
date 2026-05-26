#!/usr/bin/env bash
set -euo pipefail

: "${MAKEREADYOS_URL:=http://localhost:4000}"
: "${MAKEREADYOS_TOKEN:?Set MAKEREADYOS_TOKEN to a MakeReadyOS API token}"

curl -fsS \
  -H "Authorization: Bearer ${MAKEREADYOS_TOKEN}" \
  "${MAKEREADYOS_URL%/}/api/make-ready-items?limit=25"
