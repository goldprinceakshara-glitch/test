#!/usr/bin/env bash
# ============================================================
#  GP Portal — deploy to Render
#  Render has no first-class CLI for create/deploy; this script
#  generates render.yaml and guides the Git-push flow.
#  Usage:  bash deploy/deploy-render.sh
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf "\033[1;36m[render]\033[0m %s\n" "$*"; }

cat > render.yaml <<'YAML'
services:
  - type: web
    name: gp-portal
    runtime: node
    plan: starter
    buildCommand: npm ci --omit=dev && npm run seed
    startCommand: node server.js
    healthCheckPath: /api/health
    disk:
      name: gp-data
      mountPath: /opt/render/project/src/data
      sizeGB: 1
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_TTL
        value: 8h
      - key: CORS_ORIGIN
        value: "*"
      - key: DB_PATH
        value: /opt/render/project/src/data/gp_portal.db
      - key: PUBLIC_DIR
        value: /opt/render/project/src/public
YAML

log "✅ render.yaml written to $ROOT/render.yaml"
cat <<DONE

Next steps for Render:
  1. git add render.yaml && git commit -m "add render blueprint" && git push
  2. Open https://dashboard.render.com/blueprints
  3. Click "New Blueprint Instance" → connect this repo → deploy
  4. Copy the generated URL (https://gp-portal.onrender.com)
  5. In Render dashboard → Environment → set CORS_ORIGIN=https://gp-portal.onrender.com
  6. Redeploy

Health check:  https://gp-portal.onrender.com/api/health
DONE