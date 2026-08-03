#!/bin/zsh
# Nightly consistent snapshot of jobs.db (the single source of truth).
# Uses better-sqlite3's online .backup() so it is safe to run while the app
# is writing (WAL mode) - the snapshot is transactionally consistent.
# Keeps the last 14 snapshots, off-machine via iCloud/Dropbox when available.
set -e

WEB="/Users/bheng/Sites/jobs/web"
SRC="$WEB/jobs.db"

# Pick an off-machine destination when one exists, else fall back to $HOME.
if [ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ]; then
  BASE="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
elif [ -d "$HOME/Dropbox" ]; then
  BASE="$HOME/Dropbox"
else
  BASE="$HOME"
fi
DEST_DIR="$BASE/JobsBackups"
mkdir -p "$DEST_DIR"

STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$DEST_DIR/jobs-$STAMP.db"

cd "$WEB"
node -e '
const D = require("better-sqlite3");
const [src, dest] = process.argv.slice(1);
const db = new D(src, { readonly: true });
db.backup(dest)
  .then(() => { db.close(); console.log("backed up -> " + dest); })
  .catch((e) => { console.error(e); process.exit(1); });
' "$SRC" "$DEST"

# Retention: keep the 14 most recent snapshots.
ls -1t "$DEST_DIR"/jobs-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "retained: $(ls -1 "$DEST_DIR"/jobs-*.db 2>/dev/null | wc -l | tr -d ' ') snapshots in $DEST_DIR"
