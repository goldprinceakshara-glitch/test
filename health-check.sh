#!/usr/bin/env bash
# ============================================================
#  GP Portal — health check (usable from CI or cron)
# ============================================================
set -euo pipefail

BASE="${1:-http://127.0.0.1:4000}"
TIMEOUT="${2:-5}"

say() { printf "\033[1;36m[health]\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m[health]\033[0m %s\n" "$*" >&2; exit 1; }

say "GET $BASE/api/health"
RESP=$(curl -fsS --max-time "$TIMEOUT" "$BASE/api/health" || die "health endpoint unreachable")
echo "$RESP" | grep -q '"ok":true' || die "health response did not contain ok:true"
say "✅ /api/health OK"

say "GET $BASE/ (static index)"
curl -fsS --max-time "$TIMEOUT" "$BASE/" -o /dev/null || die "static index unreachable"
say "✅ static index OK"

say "GET $BASE/index.html"
curl -fsS --max-time "$TIMEOUT" "$BASE/index.html" -o /dev/null || die "index.html unreachable"
say "✅ index.html OK"

say "POST $BASE/api/auth/login (bad creds — expect 401)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" \
  -H 'Content-Type: application/json' \
  -d '{"username":"__nope__","password":"__nope__","deviceId":"__test__"}' \
  "$BASE/api/auth/login")
[[ "$CODE" == "401" ]] || die "expected 401 for bad creds, got $CODE"
say "✅ login rejects bad creds (401)"

say "✅ All checks passed."