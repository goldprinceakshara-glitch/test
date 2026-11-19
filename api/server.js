// server.js — GP Portal API (Express + PostgreSQL). Serves JSON only; the UI is a separate service.
'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');

const { one, many, query, initSchema, waitForDb, seedIfEmpty, ensureAdminFromEnv, logAccountSummary } = require('./db');

const PORT = process.env.PORT || 4000;
const JWT_TTL = process.env.JWT_TTL || '8h';
const IS_HOSTED = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (IS_HOSTED) { console.error('[api] JWT_SECRET is not set. Add it in Railway → api → Variables.'); process.exit(1); }
  JWT_SECRET = 'dev-only-secret'; console.warn('[api] JWT_SECRET not set — using an insecure dev secret');
}

// CORS_ORIGIN: "*" or a comma-separated list, e.g. https://ui-production-xxxx.up.railway.app,https://portal.yourdomain.com
// Entries are normalised (scheme added if missing, trailing "/" and case ignored) so small typos in the
// Railway variable no longer block every login with "Failed to fetch".
const normOrigin = s => {
  s = String(s || '').trim().replace(/\/+$/, '').toLowerCase();
  if (s && !/^https?:\/\//.test(s)) s = 'https://' + s;
  return s;
};
const CORS_RAW = (process.env.CORS_ORIGIN || '*').trim();
const corsList = CORS_RAW === '*' ? null : CORS_RAW.split(',').map(normOrigin).filter(Boolean);
const corsOrigin = !corsList ? '*' : (origin, cb) => {
  if (!origin) return cb(null, true);                       // curl / server-to-server
  if (corsList.includes(normOrigin(origin))) return cb(null, true);
  console.warn(`[cors] blocked origin ${origin} — add it to CORS_ORIGIN (allowed: ${corsList.join(', ')})`);
  cb(null, false);
};

const app = express();
app.set('trust proxy', 1);                       // Railway sits behind a proxy → real client IP in req.ip
app.use(cors({ origin: corsOrigin, credentials: false }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('tiny'));

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ------------------------------------------------------------------
   ROLE CONFIG
   ------------------------------------------------------------------ */
const ROLE_FAMILY = {
  admin:'core', developer:'core', branch_incharge:'core', user:'core', workshop:'core',
  designer:'designer', cad_designer:'cad_designer',
  stock_jama_incharge:'pp', plating_polish:'pp', packing:'pp', qc_section:'pp', dispatch_section:'pp',
  stone_stock:'stone'
};
const CORE_TAB_ROLES = ['admin','developer','branch_incharge'];
const PP_ROLES = ['stock_jama_incharge','plating_polish','packing','qc_section','dispatch_section'];
const DEVELOPER_FORBIDDEN_ROLES = ['admin','developer','branch_incharge','stone_stock'];

function assertKnownRole(role) {
  if (!ROLE_FAMILY[role]) { const e = new Error('Unknown role: ' + role); e.status = 400; throw e; }
}
function signToken(u) {
  return jwt.sign({ sub:u.id, username:u.username, role:u.role, branch:u.branch || '' }, JWT_SECRET, { expiresIn: JWT_TTL });
}
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'Missing token' });
  try { req.auth = jwt.verify(t, JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ error: 'Invalid or expired token' }); }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
function canModifyRole(actor, target) {
  if (actor === 'admin') return true;
  if (actor === 'developer') return !DEVELOPER_FORBIDDEN_ROLES.includes(target);
  return false;
}
function rowToPublic(r) {
  return {
    id:r.id, username:r.username, role:r.role, phone:r.phone || '',
    mobile:String(r.phone || '').replace(/\D/g, '').slice(-10),
    branch:r.branch || '', section:r.section || '', active:!!r.active,
    createdAt:r.created_at, updatedAt:r.updated_at
  };
}
const findAccountByUsername = u => one('SELECT * FROM accounts WHERE LOWER(username) = LOWER($1)', [u]);
const getAccountById = id => one('SELECT * FROM accounts WHERE id = $1', [id]);
async function countAdmins() { return (await one(`SELECT COUNT(*)::int AS c FROM accounts WHERE role='admin' AND active=1`)).c; }
async function getSetting(k, fb = '') { const r = await one('SELECT value FROM settings WHERE key = $1', [k]); return r ? r.value : fb; }
function generateOTP() { return String(crypto.randomInt(100000, 1000000)); }
const audit = (acct, req, userAgent) =>
  query('INSERT INTO sessions_audit(username,role,ip,user_agent,login_at) VALUES($1,$2,$3,$4,$5)',
        [acct.username, acct.role, req.ip || '', userAgent || '', Date.now()]);
const trustDevice = (acct, fp, userAgent) =>
  query('INSERT INTO device_access(username,device_id,user_agent,approved_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [acct.username, fp, userAgent || '', Date.now()]);

/* ------------------------------------------------------------------
   ROOT + HEALTH
   ------------------------------------------------------------------ */
// If the ../ui/public folder is present (single-service deploy from the repo root) the UI is served from here too.
const UI_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, '..', 'ui', 'public'));
const SERVE_UI = fs.existsSync(path.join(UI_DIR, 'index.html'));
if (!SERVE_UI) app.get('/', (req, res) => res.json({ service: 'gp-portal-api', ok: true, health: '/api/health' }));

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok:true, db:'up', time:Date.now(), roleFamilies:Object.keys(ROLE_FAMILY) });
  } catch (e) {
    console.error('[health] db check failed:', e.message);
    res.status(503).json({ ok:false, db:'down' });
  }
});

/* ------------------------------------------------------------------
   AUTH
   ------------------------------------------------------------------ */
app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password, deviceId, userAgent } = req.body || {};
  if (!username || !password) return res.status(400).json({ error:'username and password required' });
  const acct = await findAccountByUsername(String(username));
  if (!acct || !acct.active) return res.status(401).json({ error:'Invalid username or password' });
  if (!bcrypt.compareSync(String(password), acct.password_hash)) return res.status(401).json({ error:'Invalid username or password' });
  const fp = deviceId || '';
  if (!fp) return res.status(400).json({ error:'deviceId required' });

  const ok = async () => { await audit(acct, req, userAgent); return res.json({ status:'ok', token:signToken(acct), user:rowToPublic(acct) }); };

  const trusted = await one('SELECT id FROM device_access WHERE LOWER(username)=LOWER($1) AND device_id=$2', [acct.username, fp]);
  if (trusted) return ok();

  const isSoloAdmin = acct.role === 'admin' && (await countAdmins()) <= 1;
  if (isSoloAdmin) { await trustDevice(acct, fp, userAgent); return ok(); }

  let pending = await one('SELECT * FROM pending_logins WHERE LOWER(username)=LOWER($1) AND device_id=$2', [acct.username, fp]);
  if (pending && pending.status === 'approved') {
    await trustDevice(acct, fp, userAgent);
    await query('DELETE FROM pending_logins WHERE id=$1', [pending.id]);
    return ok();
  }
  if (pending && pending.status === 'rejected') {
    await query('DELETE FROM pending_logins WHERE id=$1', [pending.id]);
    return res.status(403).json({ status:'rejected', error:'Device rejected by admin' });
  }
  if (!pending) {
    pending = {
      id: 'req_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      username: acct.username, role: acct.role, branch: acct.branch || '',
      device_id: fp, admin_mobile: await getSetting('admin_mobile', ''),
      otp: generateOTP(), status: 'pending', requested_at: Date.now()
    };
    await query(
      `INSERT INTO pending_logins (id,username,role,branch,device_id,admin_mobile,otp,status,requested_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [pending.id, pending.username, pending.role, pending.branch, pending.device_id,
       pending.admin_mobile, pending.otp, pending.status, pending.requested_at]);
  }
  return res.status(202).json({
    status:'pending',
    request:{ id:pending.id, username:pending.username, role:pending.role,
              deviceId:pending.device_id, otp:pending.otp, status:pending.status,
              requestedAt:pending.requested_at }
  });
}));

app.get('/api/auth/pending-status', wrap(async (req, res) => {
  const { username, deviceId } = req.query;
  if (!username || !deviceId) return res.status(400).json({ error:'username and deviceId required' });
  const p = await one('SELECT * FROM pending_logins WHERE LOWER(username)=LOWER($1) AND device_id=$2', [String(username), String(deviceId)]);
  if (!p) return res.json({ status:'none' });
  res.json({ status:p.status, request:{ id:p.id, username:p.username, role:p.role,
      deviceId:p.device_id, otp:p.otp, status:p.status, requestedAt:p.requested_at, decidedAt:p.decided_at }});
}));

app.get('/api/auth/me', requireAuth, wrap(async (req, res) => {
  const acct = await getAccountById(req.auth.sub);
  if (!acct) return res.status(404).json({ error:'Account not found' });
  res.json({ user: rowToPublic(acct) });
}));

/* ------------------------------------------------------------------
   ACCOUNTS
   ------------------------------------------------------------------ */
app.get('/api/accounts', requireAuth, requireRole('admin','developer'), wrap(async (req, res) => {
  const { tab, family, role } = req.query;
  let roles = null;
  if (role) { assertKnownRole(role); roles = [role]; }
  else if (tab) {
    if (tab === 'core') roles = CORE_TAB_ROLES;
    else if (tab === 'user') roles = ['user'];
    else if (tab === 'workshop') roles = ['workshop'];
    else if (tab === 'designer') roles = ['designer'];
    else if (tab === 'cad_designer') roles = ['cad_designer'];
    else if (tab === 'pp') roles = PP_ROLES;
    else if (tab === 'stone') roles = ['stone_stock'];
    else return res.status(400).json({ error:'Unknown tab' });
  } else if (family) {
    roles = Object.keys(ROLE_FAMILY).filter(r => ROLE_FAMILY[r] === family);
    if (!roles.length) return res.status(400).json({ error:'Unknown family' });
  }

  const isDeveloper = req.auth.role === 'developer';
  if (isDeveloper && roles) {
    roles = roles.filter(r => !DEVELOPER_FORBIDDEN_ROLES.includes(r));
    if (!roles.length) return res.json({ accounts: [] });
  }

  let sql = 'SELECT * FROM accounts';
  const params = [];
  if (roles) { params.push(roles); sql += ` WHERE role = ANY($1::text[])`; }
  else if (isDeveloper) { params.push(DEVELOPER_FORBIDDEN_ROLES); sql += ` WHERE role <> ALL($1::text[])`; }
  sql += ' ORDER BY role, username';
  res.json({ accounts: (await many(sql, params)).map(rowToPublic) });
}));

app.get('/api/accounts/counts', requireAuth, requireRole('admin','developer'), wrap(async (req, res) => {
  const rows = await many('SELECT role, COUNT(*)::int AS c FROM accounts WHERE active=1 GROUP BY role');
  const counts = { core:0, user:0, workshop:0, designer:0, cad_designer:0, pp:0, stone:0 };
  for (const r of rows) {
    if (CORE_TAB_ROLES.includes(r.role)) counts.core += r.c;
    else if (r.role === 'user') counts.user += r.c;
    else if (r.role === 'workshop') counts.workshop += r.c;
    else if (r.role === 'designer') counts.designer += r.c;
    else if (r.role === 'cad_designer') counts.cad_designer += r.c;
    else if (r.role === 'stone_stock') counts.stone += r.c;
    else if (PP_ROLES.includes(r.role)) counts.pp += r.c;
  }
  res.json({ counts });
}));

app.post('/api/accounts', requireAuth, requireRole('admin','developer'), wrap(async (req, res) => {
  const { username, password, role, phone, branch, section } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error:'username, password, role required' });
  assertKnownRole(role);
  if (!canModifyRole(req.auth.role, role)) return res.status(403).json({ error:'Forbidden' });
  if (String(username).length < 3) return res.status(400).json({ error:'username too short' });
  if (String(password).length < 4) return res.status(400).json({ error:'password too short' });
  if (await findAccountByUsername(String(username))) return res.status(409).json({ error:'Username already exists' });
  const ts = Date.now();
  const row = await one(
    `INSERT INTO accounts (username,password_hash,role,phone,branch,section,active,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7) RETURNING *`,
    [String(username), bcrypt.hashSync(String(password), 10), role,
     phone || '', branch || '', section || (role === 'designer' ? 'Designs Bank' : ''), ts]);
  res.status(201).json({ account: rowToPublic(row) });
}));

app.put('/api/accounts/:id', requireAuth, requireRole('admin','developer'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:'Invalid id' });
  const row = await getAccountById(id);
  if (!row) return res.status(404).json({ error:'Account not found' });
  if (!canModifyRole(req.auth.role, row.role)) return res.status(403).json({ error:'Forbidden' });
  const body = req.body || {};
  const newPhone = body.phone !== undefined ? body.phone : row.phone;
  const newBranch = body.branch !== undefined ? body.branch : row.branch;
  const newSection = body.section !== undefined ? body.section : row.section;
  const newPassword = body.password ? bcrypt.hashSync(String(body.password), 10) : row.password_hash;
  const newActive = body.active !== undefined ? (body.active ? 1 : 0) : row.active;
  if (row.role === 'admin' && !newActive && (await countAdmins()) <= 1) return res.status(400).json({ error:'Cannot disable the last admin' });
  const updated = await one(
    `UPDATE accounts SET password_hash=$1, phone=$2, branch=$3, section=$4, active=$5, updated_at=$6 WHERE id=$7 RETURNING *`,
    [newPassword, newPhone, newBranch, newSection, newActive, Date.now(), id]);
  res.json({ account: rowToPublic(updated) });
}));

app.delete('/api/accounts/:id', requireAuth, requireRole('admin','developer'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:'Invalid id' });
  const row = await getAccountById(id);
  if (!row) return res.status(404).json({ error:'Account not found' });
  if (!canModifyRole(req.auth.role, row.role)) return res.status(403).json({ error:'Forbidden' });
  if (row.role === 'admin' && (await countAdmins()) <= 1) return res.status(400).json({ error:'Cannot remove the last admin' });
  if (row.role === 'stone_stock') {
    const { c } = await one(`SELECT COUNT(*)::int AS c FROM accounts WHERE role='stone_stock' AND active=1`);
    if (c <= 1) return res.status(400).json({ error:'Cannot remove the last stone-stock user' });
  }
  await query('DELETE FROM accounts WHERE id=$1', [id]);
  res.json({ ok:true });
}));

/* ------------------------------------------------------------------
   DEVICE REQUESTS
   ------------------------------------------------------------------ */
app.get('/api/device-requests', requireAuth, requireRole('admin','developer'), wrap(async (req, res) => {
  const rows = await many('SELECT * FROM pending_logins ORDER BY requested_at DESC');
  res.json({ requests: rows.map(r => ({
    id:r.id, username:r.username, role:r.role, branch:r.branch,
    deviceId:r.device_id, adminMobile:r.admin_mobile, otp:r.otp,
    status:r.status, requestedAt:r.requested_at, decidedAt:r.decided_at
  }))});
}));

const decide = status => wrap(async (req, res) => {
  const r = await one('SELECT * FROM pending_logins WHERE id=$1', [req.params.id]);
  if (!r) return res.status(404).json({ error:'Request not found' });
  if (!canModifyRole(req.auth.role, r.role)) return res.status(403).json({ error:'Forbidden' });
  await query('UPDATE pending_logins SET status=$1, decided_at=$2 WHERE id=$3', [status, Date.now(), r.id]);
  res.json({ ok:true, request:{ ...r, status } });
});
app.post('/api/device-requests/:id/approve', requireAuth, requireRole('admin','developer'), decide('approved'));
app.post('/api/device-requests/:id/reject',  requireAuth, requireRole('admin','developer'), decide('rejected'));

app.get('/api/devices', requireAuth, requireRole('admin','developer'), wrap(async (req, res) => {
  res.json({ devices: await many('SELECT * FROM device_access ORDER BY approved_at DESC') });
}));
app.delete('/api/devices/:id', requireAuth, requireRole('admin','developer'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:'Invalid id' });
  await query('DELETE FROM device_access WHERE id=$1', [id]);
  res.json({ ok:true });
}));

/* ------------------------------------------------------------------
   SETTINGS
   ------------------------------------------------------------------ */
app.get('/api/settings/admin-mobile', wrap(async (req, res) => res.json({ adminMobile: await getSetting('admin_mobile', '') })));
app.put('/api/settings/admin-mobile', requireAuth, requireRole('admin'), wrap(async (req, res) => {
  const v = String((req.body || {}).adminMobile || '');
  await query(`INSERT INTO settings(key,value) VALUES('admin_mobile',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [v]);
  res.json({ ok:true, adminMobile:v });
}));


/* ------------------------------------------------------------------
   INTERNAL CHAT DIRECTORY
   ------------------------------------------------------------------ */
app.get('/api/chat/users', requireAuth, wrap(async (req, res) => {
  const users = await many(
    'SELECT username, role, branch FROM accounts WHERE active=1 ORDER BY role, username'
  );
  res.set('Cache-Control', 'no-store').json({
    users: users.map(u => ({ username:u.username, role:u.role, branch:u.branch || '' }))
  });
}));

/* ------------------------------------------------------------------
   SHARED INVENTORY DATA
   ------------------------------------------------------------------ */
const INVENTORY_KEYS = new Set([
  'catalogue', 'openingStock', 'stockIn', 'stockOut', 'stockReturn',
  'parties', 'goldprince_stock_holds_v1', 'invoiceCounter', 'returnCounter',
  // Order Form and production workflow data shared across browsers.
  'goldprince_estimations', 'goldprince_orders_v3', 'goldprince_completed_v1',
  'goldprince_stage_history_v1', 'goldprince_stock_sends_v1',
  'goldprince_stage2_orders_v1', 'goldprince_stage2_history_v1',
  'goldprince_catalogue', 'goldprince_catalogue_updates_v1',
  'goldprince_catalogue_3D_PREMIUM_IDOLS', 'goldprince_premium_catalogue',
  'goldprince_catalogue_3D_IDOLS', 'goldprince_catalogue_2D_IDOLS',
  'goldprince_catalogue_JEWELLERY', 'goldprince_catalogue_GOD_FRAMES',
  'goldprince_parties', 'gp_party_master', 'gp_internal_notifications', 'gp_chat_messages'
]);

app.get('/api/inventory', requireAuth, wrap(async (req, res) => {
  const rows = await many('SELECT key, value, version, updated_at FROM portal_data ORDER BY key');
  const data = {}, versions = {}, updatedAt = {};
  for (const row of rows) {
    data[row.key] = row.value;
    versions[row.key] = Number(row.version);
    updatedAt[row.key] = Number(row.updated_at);
  }
  res.set('Cache-Control', 'no-store').json({ data, versions, updatedAt });
}));

app.put('/api/inventory/:key', requireAuth, wrap(async (req, res) => {
  const key = String(req.params.key || '');
  if (!INVENTORY_KEYS.has(key)) return res.status(400).json({ error: 'Unknown inventory data key' });
  const body = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(body, 'value') ||
      !Number.isSafeInteger(Number(body.expectedVersion)) || Number(body.expectedVersion) < 0) {
    return res.status(400).json({ error: 'value and non-negative expectedVersion are required' });
  }
  const expectedVersion = Number(body.expectedVersion);
  const json = JSON.stringify(body.value);
  if (json === undefined) return res.status(400).json({ error: 'value must be JSON serializable' });

  const saved = await one(
    `INSERT INTO portal_data (key, value, version, updated_by, updated_at)
     VALUES ($1, $2::jsonb, 1, $3, $4)
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       version = portal_data.version + 1,
       updated_by = EXCLUDED.updated_by,
       updated_at = EXCLUDED.updated_at
     WHERE portal_data.version = $5
     RETURNING key, value, version, updated_at`,
    [key, json, req.auth.username || String(req.auth.sub), Date.now(), expectedVersion]
  );

  if (!saved) {
    const current = await one('SELECT value, version, updated_at FROM portal_data WHERE key=$1', [key]);
    return res.status(409).json({
      error: 'Inventory data changed in another browser. Merge and retry.',
      value: current ? current.value : null,
      version: current ? Number(current.version) : 0,
      updatedAt: current ? Number(current.updated_at) : null
    });
  }

  res.set('Cache-Control', 'no-store').json({
    ok: true, key: saved.key, value: saved.value,
    version: Number(saved.version), updatedAt: Number(saved.updated_at)
  });
}));

/* ------------------------------------------------------------------
   404 + ERRORS
   ------------------------------------------------------------------ */
if (SERVE_UI) {
  // Same-origin: pages call /api/... on this server, so no CORS and no separate API_URL are needed.
  app.get('/config.js', (req, res) => {
    res.set({ 'Content-Type':'application/javascript; charset=utf-8', 'Cache-Control':'no-store' });
    res.send('window.GP_API_BASE = "";\nwindow.GP_API_PROXY = true;\n');
  });
  app.get('/healthz', (req, res) => res.type('text').send('ok'));
  app.use(express.static(UI_DIR, {
    index: 'index.html',
    setHeaders: (res, file) => {
      res.set('Cache-Control', file.endsWith('.html') ? 'no-store' : 'public, max-age=300');
    }
  }));
}
app.use('/api', (req, res) => res.status(404).json({ error:'Not found' }));
app.use((req, res) => {
  if (SERVE_UI && req.method === 'GET' && !path.extname(req.path)) return res.sendFile(path.join(UI_DIR, 'index.html'));
  res.status(404).json({ error:'Not found' });
});
app.use((err, req, res, next) => {
  console.error('[api error]', err);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Server error' });
});

/* ------------------------------------------------------------------
   START
   ------------------------------------------------------------------ */
(async () => {
  await waitForDb();
  await initSchema();
  await seedIfEmpty();
  await ensureAdminFromEnv();
  await logAccountSummary();
  app.listen(PORT, () => {
    console.log(`[gp-portal-api] listening on port ${PORT}`);
    console.log(`[gp-portal-api] CORS origin: ${corsList ? corsList.join(', ') : '*'}`);
  });
})().catch(e => { console.error('[gp-portal-api] failed to start:', e); process.exit(1); });
