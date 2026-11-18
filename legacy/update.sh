#!/usr/bin/env bash
# ============================================================
#  GP Portal — update script
#  Pulls latest code, reinstalls deps, restarts service.
#  Run as root:  sudo bash deploy/update.sh
# ============================================================
set -euo pipefail

APP_USER="gp"
APP_DIR="/opt/gp-portal"

log()  { printf "\033[1;36m[update]\033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash deploy/update.sh"
[[ -d "$APP_DIR" ]] || die "$APP_DIR not found — run install.sh first"
cd "$APP_DIR"

# Backup DB before touch
if [[ -f data/gp_portal.db ]]; then
    STAMP=$(date +%Y%m%d-%H%M%S)
    mkdir -p deploy/backups
    log "Backing up DB → deploy/backups/gp_portal-$STAMP.db"
    cp -p data/gp_portal.db "deploy/backups/gp_portal-$STAMP.db"
fi

# Sync latest source (assumes you rsync/scp files first,
# or run `git pull` here if /opt/gp-portal is a git repo)
if [[ -d .git ]]; then
    log "git pull…"
    sudo -u "$APP_USER" git pull --ff-only
else
    log "No .git folder — assuming caller has already synced files."
fi

log "Installing dependencies…"
sudo -u "$APP_USER" npm ci --omit=dev

log "Restarting service…"
systemctl restart gp-portal
sleep 2
if systemctl is-active --quiet gp-portal; then
    log "✅ gp-portal restarted cleanly."
else
    journalctl -u gp-portal -n 40 --no-pager || true
    die "gp-portal failed to restart."
fi

log "Health check…"
curl -fsS "http://127.0.0.1:$(grep -E '^PORT=' .env | cut -d= -f2)/api/health" \
    && echo || echo "(health endpoint did not respond)"