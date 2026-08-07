#!/bin/bash
# run_prescan.sh - PRE-SCAN (type 1 of 2): headless FORM-FILL of jobs that still need it.
# 2 lanes + a live watcher that writes web/public/scan-status.json (kind:prescan) so the board
# shows a spinner ON each row being filled. Zero AI tokens (pure browser automation + SQLite).
# Bash shebang so $(cat) word-splits the id list correctly (zsh would not).
#
# Only touches rows whose form is NOT yet green: never-scanned OR still leaving >2 fields for the
# human. Already-green Ready rows and unfillable ones (Cloudflare wall / no-form) are SKIPPED -
# re-filling a proven-green form wastes a browser run. Cleanliness of the green pile is a SEPARATE
# scan (run_readyscan.sh). (owner split 2026-08-07)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
SP="/tmp/jobs-prescan"
mkdir -p "$SP"

sqlite3 web/jobs.db "SELECT id FROM applications
  WHERE status='kit_ready'
    AND url LIKE 'http%' AND url NOT LIKE '%linkedin.com%' AND url NOT LIKE '%indeed.com%'
    AND url NOT LIKE '%news.ycombinator.com%'
    AND COALESCE(pf_status,'') NOT IN ('wall','noform')
    AND (pf_total IS NULL OR (pf_total - COALESCE(pf_covered,0)) > 2)
  ORDER BY score DESC;" > "$SP/all.txt"
[ -s "$SP/all.txt" ] || { echo "nothing to prescan - every fillable form is already green"; exit 0; }

awk 'NR%2==1' "$SP/all.txt" > "$SP/A.txt"
awk 'NR%2==0' "$SP/all.txt" > "$SP/B.txt"

# 2 lanes, each its own browser profile (never collide), + the watcher for the row spinners.
PRERUN_PROFILE="$HOME/.cache/jobfill-prerun-A" node prerun.mjs $(cat "$SP/A.txt") > "$SP/A.log" 2>&1 &
PRERUN_PROFILE="$HOME/.cache/jobfill-prerun-B" node prerun.mjs $(cat "$SP/B.txt") > "$SP/B.log" 2>&1 &
node scan_watch.mjs A "$SP/A.txt" "$SP/A.log" B "$SP/B.txt" "$SP/B.log" > "$SP/watch.log" 2>&1 &
wait
