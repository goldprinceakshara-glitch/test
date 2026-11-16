#!/usr/bin/env bash
# ============================================================
#  GP Portal — deploy to Railway
#  Pre-req:  npm i -g @railway/cli  &&  railway login
#  Usage:    bash deploy/deploy-railway.sh [service-name]
# ============================================================
set -euo pipefail

SERVICE="${1:-gp-portal}"
PROJECT="${RAILWAY_PROJECT:-gp-portal}"

log() { printf "\033[1;36m[railway]\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

command -v railway >/dev/null 2>&1 || die "Railway CLI not installed:  npm i -g @railway/cli"
railway whoami >/dev/null 2>&1 || die "Not logged in — run:  railway login"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! railway status >/dev/null 2>&1; then
    log "Linking project '$PROJECT'…"
    railway link --project "$PROJECT" 2>/dev/null || railway init --name "$PROJECT"
fi

# Ensure env vars are set (Railway has no .env in prod)
log "Setting environment variables…"
JWT="${JWT_SECRET:-$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")}"
railway variables set \
    JWT_SECRET="$JWT" \
    JWT_TTL=8h \
    CORS_ORIGIN='*' \
    DB_PATH=/app/data/gp_portal.db >/dev/null

# Attach a persistent volume for the SQLite file
log "Ensuring persistent volume at /app/data…"
railway volume add --mount-path /app/data 2>/dev/null || \
    log "(volume already exists or Railway UI required — verify at railway.app dashboard)"

log "Deploying…"
railway up --service "$SERVICE"

DOMAIN=$(railway domain 2>/dev/null | tail -n1 || true)
[[ -n "$DOMAIN" ]] && log "✅ Deployed:  https://$DOMAIN" || log "✅ Deployed (no public domain yet — add one in Railway UI)."

log "Tail logs:  railway logs -s $SERVICE"