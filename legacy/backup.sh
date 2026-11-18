#!/usr/bin/env bash
# ============================================================
#  GP Portal — SQLite backup script
#  Usage:  bash deploy/backup.sh
#  Safe to run while the server is live (uses sqlite3 .backup).
# ============================================================
set -euo pipefail

APP_DIR="/opt/gp-portal"
DB="$APP_DIR/data/gp_portal.db"
BK="$APP_DIR/deploy/backups"
KEEP_DAYS=30

log() { printf "\033[1;36m[backup]\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

[[ -f "$DB" ]] || die "DB not found: $DB"
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 CLI not installed"

mkdir -p "$BK"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BK/gp_portal-$STAMP.db"

log "Backing up $DB → $OUT"
sqlite3 "$DB" ".backup '$OUT'"

# Verify the backup opens and has the expected tables
TABLES=$(sqlite3 "$OUT" ".tables" | tr ' ' '\n' | grep -c accounts || true)
[[ "$TABLES" -ge 1 ]] || die "Backup verification failed (no accounts table)"
log "✅ Backup verified ($(du -h "$OUT" | cut -f1))."

# Prune old backups
log "Pruning backups older than ${KEEP_DAYS} days…"
find "$BK" -name 'gp_portal-*.db' -type f -mtime "+$KEEP_DAYS" -delete

log "Done. Recent backups:"
ls -lht "$BK" | head -n 6