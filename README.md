# GP Portal

## Quick deploy (one Railway service, from the repo root)

The repo root now deploys as a **single service** that serves the pages *and* the API (same origin, no CORS):

1. Railway → project → **+ New → Database → PostgreSQL**.
2. Service `test` → **Settings → Root Directory: `/`** (leave empty) → **Networking → Generate Domain**.
3. **Variables:** `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `JWT_SECRET` = long random string, `SEED_ADMIN_PASSWORD` = your password.
4. Open `https://<domain>/api/health` → should show `{"ok":true,"db":"up"}`, then open `https://<domain>/` to log in.

**GitHub Pages** (`https://<user>.github.io/test/`) is static only. `.github/workflows/pages.yml` publishes `ui/public` and writes a `config.js` pointing at the Railway URL (repo variable `RAILWAY_URL`). Enable it in repo **Settings → Pages → Source: GitHub Actions**.
Pages logins need the Railway service reachable; CORS defaults to `*`, or set `CORS_ORIGIN=https://<user>.github.io`.

The two-service layout below (separate `api` and `ui`) still works too.

---

Three pieces, all deployed on Railway from this one GitHub repo:

| Railway service | Folder  | What it is                         |
|-----------------|---------|------------------------------------|
| `Postgres`      | —       | Database (Railway's PostgreSQL)    |
| `api`           | `/api`  | Express JSON API (login, accounts, devices) |
| `ui`            | `/ui`   | The HTML/CSS/JS pages (static server) |

```
Browser ──► ui  (pages)
   │
   └──────► api ──► Postgres
```

## 1. Push this code to GitHub

```bash
git clone https://github.com/<you>/<repo>.git && cd <repo>
git rm -r -q --ignore-unmatch .          # clear the old layout
# unzip gp-portal-railway-full-v2.zip so that api/, ui/, .github/ sit in this folder
git add -A
git commit -m "Split into api + ui + Postgres for Railway"
git push origin main
```

(Optional but recommended: `cd api && npm install`, then commit the generated `api/package-lock.json`.)

## 2. Create the project on Railway (pull from GitHub)

1. railway.com → **New Project → Deploy from GitHub repo** → pick the repo (allow the Railway GitHub app if asked). This creates the first service.
2. In the project canvas: **+ New → Database → Add PostgreSQL**. Keep the name `Postgres`.
3. Rename the first service to **`api`** → **Settings**:
   - **Source → Root Directory:** `/api`
   - **Networking → Generate Domain**
   - **Deploy → Healthcheck Path:** `/api/health`
4. **api → Variables**:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `JWT_SECRET` | a long random string — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `SEED_ADMIN_PASSWORD` | your own password for the first `admin` / `developer` accounts |
   | `CORS_ORIGIN` | `https://${{ui.RAILWAY_PUBLIC_DOMAIN}}` (set after step 5) |

5. **+ New → GitHub Repo** → the same repo again → rename it **`ui`** → **Settings**:
   - **Root Directory:** `/ui`
   - **Networking → Generate Domain**
   - **Variables:** `API_URL` = `https://${{api.RAILWAY_PUBLIC_DOMAIN}}`
6. Go back to **api → Variables** and set `CORS_ORIGIN` now that `ui` has a domain. Both services redeploy.
7. Open the `ui` domain → log in. Check `https://<api-domain>/api/health` shows `{"ok":true,"db":"up"}`.

From now on, every `git push` to `main` redeploys the changed service automatically.
(Optional: service **Settings → Deploy → Wait for CI** makes Railway deploy only after the GitHub Actions check passes.)

## 3. First-run behaviour

- The API creates all tables automatically and seeds the default accounts **only when the `accounts` table is empty**.
  Restarts and redeploys never overwrite passwords you changed in the admin panel.
- Change the default passwords (see the seed list in `api/db.js`) after first login.
- **Can't log in as `admin`?** Seeding only runs on an empty database, so an older deploy may have left a different password.
  Fix: Railway → `api` → Variables → add `RESET_ADMIN_PASSWORD` = a new password → wait for the redeploy → log in as `admin` with it → **delete the variable**.
  (The `api` deploy log prints the existing accounts on every start.)
- Full re-seed (**resets all passwords**): `railway run npm run reset` only works against the *public* DB URL (the `.railway.internal` one is unreachable from your PC), so prefer the variable above.

## Local development

```bash
# terminal 1 — API (needs a local Postgres)
cd api && cp .env.example .env && npm install && npm start     # http://localhost:4000

# terminal 2 — UI
cd ui && npm start                                              # http://localhost:3000
```
With no `API_URL` set, the UI on `localhost:3000` talks to `http://localhost:4000` automatically.

## API

- `POST /api/auth/login` · `GET /api/auth/pending-status` · `GET /api/auth/me`
- `GET/POST /api/accounts` · `PUT/DELETE /api/accounts/:id` · `GET /api/accounts/counts`
- `GET /api/device-requests` · `POST /api/device-requests/:id/approve|reject` · `GET /api/devices` · `DELETE /api/devices/:id`
- `GET/PUT /api/settings/admin-mobile` · `GET /api/health`

Roles and rules are unchanged from v1 (admin / developer / branch_incharge / user / workshop / designer / cad_designer / post-production roles / stone_stock; last admin and last stone-stock user are protected).
