#!/bin/bash
# run_readyscan.sh - READY-SCAN (type 2 of 2): cleanliness / reliability check of the GREEN pile.
# NO browser, zero AI tokens. Proves every Ready job is truly ready (cover PDF on disk + resume +
# cover text + every screening question resolving to a canonical answer), renders any missing cover
# PDFs, and DEMOTES anything that can't prove it. This is the job-ready-eval skill's engine.
# Writes web/public/scan-status.json (kind:ready) so the Ready panel icon spins while it runs.
# (owner split 2026-08-07)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
STATUS="web/public/scan-status.json"
NOW() { node -e 'console.log(Date.now())'; }

echo "{\"kind\":\"ready\",\"running\":true,\"total\":0,\"done\":0,\"active\":[],\"updatedAt\":$(NOW)}" > "$STATUS"
trap 'echo "{\"kind\":\"ready\",\"running\":false,\"total\":0,\"done\":0,\"active\":[],\"updatedAt\":$(NOW)}" > "$STATUS"' EXIT

node verify_ready.mjs --fix --demote 2>&1 | tail -40
