#!/bin/zsh
# Consistent snapshot of jobs.db (the single source of truth), safe to run while the app writes
# (better-sqlite3 online .backup() over WAL = transactionally consistent).
#
# Two destinations, because macOS TCC blocks a launchd-spawned process from ENUMERATING the
# iCloud folder (~/Library/Mobile Documents), even though writing a known path there works:
#   1. LOCAL  ~/.jobs-db-backups  - launchd has full access, so this set is reliably PRUNED to 14.
#      Covers the common losses: corruption, a bad migration, an accidental delete.
#   2. iCLOUD JobsBackups         - best-effort OFF-machine copy so a dead Mac never loses the DB.
#      Writes work under launchd; pruning does not, so it is left unpruned (tiny files, secondary).
set -e

WEB="/Users/bheng/Sites/jobs/web"
SRC="$WEB/jobs.db"

LOCAL_DIR="$HOME/.jobs-db-backups"
mkdir -p "$LOCAL_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$LOCAL_DIR/jobs-$STAMP.db"

cd "$WEB"
node -e '
const D = require("better-sqlite3");
const [src, dest] = process.argv.slice(1);
const db = new D(src, { readonly: true });
db.backup(dest)
  .then(() => { db.close(); console.log("backed up -> " + dest); })
  .catch((e) => { console.error(e); process.exit(1); });
' "$SRC" "$DEST"

# Retention on the LOCAL set (launchd can enumerate this dir). Timestamped names sort
# chronologically, so sort -r | tail -n +15 = everything past the newest 14.
find "$LOCAL_DIR" -name 'jobs-*.db' -type f | sort -r | tail -n +15 | tr '\n' '\0' | xargs -0 -r rm -f
echo "retained: $(find "$LOCAL_DIR" -name 'jobs-*.db' -type f | wc -l | tr -d ' ') local snapshots in $LOCAL_DIR"

# Best-effort off-machine copy to iCloud (survives a dead Mac). Writing a known path works under
# launchd; never fail the backup if iCloud is unavailable, and do NOT try to prune it there.
ICLOUD_BASE="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
if [ -d "$ICLOUD_BASE" ]; then
  ICLOUD_DIR="$ICLOUD_BASE/JobsBackups"
  mkdir -p "$ICLOUD_DIR" 2>/dev/null || true
  if cp "$DEST" "$ICLOUD_DIR/jobs-$STAMP.db" 2>/dev/null; then
    echo "off-machine copy -> iCloud/JobsBackups"
  else
    echo "iCloud copy skipped (grant Full Disk Access to launchd for off-machine backups)"
  fi
fi
