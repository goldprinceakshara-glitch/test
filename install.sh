#!/usr/bin/env bash
# ============================================================
#  GP Portal — one-shot installer for a fresh Ubuntu/Debian VPS
#  Usage:  sudo bash deploy/install.sh
# ============================================================
set -euo pipefail

# ---- Config (edit these) ------------------------------------
APP_USER="gp"
APP_DIR="/opt/gp-portal"
APP_PORT="4000"
DOMAIN=""                     # e.g. gp.yourdomain.com — leave empty to skip nginx/certbot
NODE_MAJOR="20"
# -------------------------------------------------------------

log()  { printf "\033[1;36m[install]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash deploy/install.sh"

# 1. System packages -----------------------------------------
log "Installing system packages…"
apt-get update -y
apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg lsb-release \
    python3 make g++ sqlite3 ufw

# 2. Node.js --------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
    log "Installing Node.js ${NODE_MAJOR}.x…"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
fi
log "Node: $(node -v) · npm: $(npm -v)"

# 3. App user ------------------------------------------------
if ! id "$APP_USER" >/dev/null 2>&1; then
    log "Creating system user $APP_USER…"
    useradd --system --create-home --shell /bin/bash "$APP_USER"
fi

# 4. Copy app files -----------------------------------------
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$SRC_DIR/server.js" ]] || die "server.js not found in $SRC_DIR"

log "Deploying from $SRC_DIR → $APP_DIR"
mkdir -p "$APP_DIR" "$APP_DIR/data" "$APP_DIR/deploy/backups"

# Preserve existing .env and DB on re-run
if [[ -d "$APP_DIR" && -f "$APP_DIR/server.js" ]]; then
    warn "Existing install detected — keeping $APP_DIR/.env and $APP_DIR/data"
fi

rsync -a --delete \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude 'data/' \
    --exclude 'deploy/backups' \
    "$SRC_DIR"/ "$APP_DIR"/

# 5. .env ----------------------------------------------------
if [[ ! -f "$APP_DIR/.env" ]]; then
    log "Generating .env with a fresh JWT secret…"
    JWT="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
    cat > "$APP_DIR/.env" <<EOF
PORT=${APP_PORT}
JWT_SECRET=${JWT}
JWT_TTL=8h
CORS_ORIGIN=*
DB_PATH=./data/gp_portal.db
PUBLIC_DIR=./public
EOF
    chmod 600 "$APP_DIR/.env"
fi

# 6. Install deps -------------------------------------------
log "Installing npm dependencies…"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev

# 7. Seed DB ------------------------------------------------
if [[ ! -f "$APP_DIR/data/gp_portal.db" ]]; then
    log "Seeding SQLite database…"
    sudo -u "$APP_USER" npm run seed
fi

# 8. Permissions --------------------------------------------
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chmod -R u+rwX,go-rwx "$APP_DIR/data" "$APP_DIR/.env"

# 9. systemd ------------------------------------------------
log "Installing systemd unit…"
cp "$APP_DIR/deploy/gp-portal.service" /etc/systemd/system/gp-portal.service
systemctl daemon-reload
systemctl enable --now gp-portal

sleep 2
if systemctl is-active --quiet gp-portal; then
    log "✅ gp-portal service is running."
else
    journalctl -u gp-portal -n 40 --no-pager || true
    die "gp-portal failed to start. See logs above."
fi

# 10. Firewall ----------------------------------------------
if command -v ufw >/dev/null 2>&1; then
    log "Configuring UFW…"
    ufw allow OpenSSH >/dev/null || true
    ufw allow 80/tcp   >/dev/null || true
    ufw allow 443/tcp  >/dev/null || true
    ufw --force enable >/dev/null || true
fi

# 11. Nginx + Let's Encrypt (optional) ----------------------
if [[ -n "$DOMAIN" ]]; then
    log "Installing nginx + certbot for $DOMAIN…"
    apt-get install -y nginx certbot python3-certbot-nginx

    cat > /etc/nginx/sites-available/gp-portal <<NGINX
upstream gp_portal { server 127.0.0.1:${APP_PORT}; keepalive 16; }

server {
  listen 80;
  server_name ${DOMAIN};
  client_max_body_size 20m;

  location /api/ {
    proxy_pass http://gp_portal;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Connection "";
  }
  location / {
    proxy_pass http://gp_portal;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Connection "";
  }
}
NGINX

    ln -sf /etc/nginx/sites-available/gp-portal /etc/nginx/sites-enabled/gp-portal
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl reload nginx

    log "Requesting Let's Encrypt certificate (needs DNS already pointing here)…"
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN#*.}" || \
        warn "certbot failed — retry manually:  certbot --nginx -d $DOMAIN"
fi

# 12. Smoke test --------------------------------------------
log "Health check…"
if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" | grep -q '"ok":true'; then
    log "✅ /api/health responded OK."
else
    warn "Health endpoint did not respond as expected — check:  journalctl -u gp-portal -f"
fi

cat <<DONE

════════════════════════════════════════════════════════════
 GP Portal is installed and running.
════════════════════════════════════════════════════════════
 App directory : $APP_DIR
 Service       : systemctl status gp-portal
 Logs          : journalctl -u gp-portal -f
 Local URL     : http://127.0.0.1:${APP_PORT}
${DOMAIN:+(Public URL    : https://$DOMAIN)}
────────────────────────────────────────────────────────────
 Default accounts (change passwords immediately!):
   admin / admin123
   developer / developer123
────────────────────────────────────────────────────────────
 Next steps:
   1. Edit $APP_DIR/.env  →  set CORS_ORIGIN=https://<your-domain>
   2. sudo systemctl restart gp-portal
   3. Test login at the URL above
════════════════════════════════════════════════════════════
DONE