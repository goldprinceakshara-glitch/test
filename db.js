// db.js — PostgreSQL connection, schema and seed data
'use strict';

const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');

// BIGINT (OID 20) comes back from pg as a string by default — we store epoch-ms in BIGINT columns.
types.setTypeParser(20, v => Number(v));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[db] DATABASE_URL is not set. On Railway: API service → Variables → DATABASE_URL = ${{Postgres.DATABASE_URL}}');
  process.exit(1);
}

// Railway private network (*.railway.internal) and localhost need no SSL; the public proxy does.
const host = (() => { try { return new URL(DATABASE_URL).hostname; } catch (e) { return ''; } })();
const useSsl = process.env.PGSSL
  ? process.env.PGSSL === 'true'
  : !(host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal'));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 10
});
pool.on('error', e => console.error('[db] idle client error:', e.message));

const query = (text, params) => pool.query(text, params);
const one   = async (text, params) => (await pool.query(text, params)).rows[0];
const many  = async (text, params) => (await pool.query(text, params)).rows;

/* ============================================================
   SCHEMA  (safe to run on every start)
   ============================================================ */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  phone         TEXT DEFAULT '',
  branch        TEXT DEFAULT '',
  section       TEXT DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_username ON accounts (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts (role);

CREATE TABLE IF NOT EXISTS device_access (
  id           SERIAL PRIMARY KEY,
  username     TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  user_agent   TEXT DEFAULT '',
  approved_at  BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_access ON device_access (LOWER(username), device_id);

CREATE TABLE IF NOT EXISTS pending_logins (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL,
  role         TEXT NOT NULL,
  branch       TEXT DEFAULT '',
  device_id    TEXT NOT NULL,
  admin_mobile TEXT DEFAULT '',
  otp          TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  requested_at BIGINT NOT NULL,
  decided_at   BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_logins ON pending_logins (LOWER(username), device_id);

CREATE TABLE IF NOT EXISTS sessions_audit (
  id         SERIAL PRIMARY KEY,
  username   TEXT NOT NULL,
  role       TEXT NOT NULL,
  ip         TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  login_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Shared app data (orders, parties, catalogue, stock, stone stock ...). One row per browser-storage key.
CREATE TABLE IF NOT EXISTS app_data (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  updated_by TEXT DEFAULT ''
);
`;

async function initSchema() {
  await pool.query(SCHEMA);
}

/** Wait for the database (Railway may start API and Postgres at the same moment). */
async function waitForDb(tries = 15, delayMs = 2000) {
  for (let i = 1; i <= tries; i++) {
    try { await pool.query('SELECT 1'); return; }
    catch (e) {
      console.error(`[db] not reachable yet (${i}/${tries}): ${e.message}`);
      if (i === tries) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/* ============================================================
   SEED
   ============================================================ */
// Optional: set SEED_ADMIN_PASSWORD in Railway so admin/developer don't start with the defaults below.
const ADMIN_PW = process.env.SEED_ADMIN_PASSWORD || '';

const SEED = [
  // Core
  { username:'admin',           password: ADMIN_PW || 'admin123',     role:'admin',           phone:'+91 99299 92299', branch:'HQ' },
  { username:'developer',       password: ADMIN_PW || 'developer123', role:'developer',       phone:'+91 99299 92299', branch:'HQ' },
  { username:'branchincharge',  password:'branch123',     role:'branch_incharge', phone:'+91 99299 92299', branch:'HQ' },
  { username:'user1',           password:'user123',       role:'user',            phone:'+91 99299 92299', branch:'HQ' },
  { username:'user2',           password:'user234',       role:'user',            phone:'+91 99299 92299', branch:'HQ' },
  // Workshops
  { username:'kalimatha', password:'kalimatha123', role:'workshop', phone:'+91 89048 52992', branch:'Kalimatha' },
  { username:'gomatha',   password:'gomatha123',   role:'workshop', phone:'+91 89048 52992', branch:'Gomatha'   },
  { username:'ambhaji',   password:'ambhaji123',   role:'workshop', phone:'+91 89048 52992', branch:'Ambhaji'   },
  { username:'vanisri',   password:'vanisri123',   role:'workshop', phone:'+91 89048 52992', branch:'Vanisri'   },
  { username:'vishal',    password:'vishal123',    role:'workshop', phone:'+91 89048 52992', branch:'Vishal'    },
  { username:'gpwb',      password:'gpwb123',      role:'workshop', phone:'+91 89048 52992', branch:'GPWB'      },
  // Designers
  { username:'designer1', password:'designer123', role:'designer', mobile:'9929992299', section:'Designs Bank' },
  { username:'designer2', password:'designer234', role:'designer', mobile:'9929992300', section:'Designs Bank' },
  { username:'designer3', password:'designer345', role:'designer', mobile:'9929992301', section:'Designs Bank' },
  { username:'designer4', password:'designer456', role:'designer', mobile:'9929992302', section:'Designs Bank' },
  { username:'designer5', password:'designer567', role:'designer', mobile:'9929992303', section:'Designs Bank' },
  // CAD designers
  { username:'cad1', password:'cad123', role:'cad_designer', mobile:'9929992311', section:'CAD' },
  { username:'cad2', password:'cad234', role:'cad_designer', mobile:'9929992312', section:'CAD' },
  { username:'cad3', password:'cad345', role:'cad_designer', mobile:'9929992313', section:'CAD' },
  // Post-production
  { username:'jama1',     password:'jama123',     role:'stock_jama_incharge', mobile:'9929992401', section:'stock_jama_incharge' },
  { username:'plating1',  password:'plating123',  role:'plating_polish',      mobile:'9929992402', section:'plating_polish' },
  { username:'packing1',  password:'packing123',  role:'packing',             mobile:'9929992403', section:'packing' },
  { username:'qc1',       password:'qc123',       role:'qc_section',          mobile:'9929992404', section:'qc_section' },
  { username:'dispatch1', password:'dispatch123', role:'dispatch_section',    mobile:'9929992405', section:'dispatch_section' },
  // Stone stock
  { username:'stoneadmin', password:'stone@2024', role:'stone_stock', phone:'+91 99299 92299', branch:'HO' },
  { username:'stoneuser',  password:'stone@123',  role:'stone_stock', phone:'+91 99299 92299', branch:'HO' }
];

async function upsertAccount(client, a) {
  const ts = Date.now();
  await client.query(
    `INSERT INTO accounts (username,password_hash,role,phone,branch,section,active,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7)
     ON CONFLICT (LOWER(username)) DO UPDATE SET
       password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, phone = EXCLUDED.phone,
       branch = EXCLUDED.branch, section = EXCLUDED.section, active = 1, updated_at = EXCLUDED.updated_at`,
    [a.username, bcrypt.hashSync(String(a.password), 10), a.role,
     a.phone || a.mobile || '', a.branch || '', a.section || '', ts]
  );
}

/** Force-write all seed accounts (resets their passwords!). Used only by `npm run seed` / `reset`. */
async function seedAll() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const a of SEED) await upsertAccount(client, a);
    await client.query(`INSERT INTO settings(key,value) VALUES ('admin_mobile','+91 99299 92299') ON CONFLICT (key) DO NOTHING`);
    await client.query('COMMIT');
    console.log(`[db] seeded ${SEED.length} accounts`);
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

/** Seed ONLY when the accounts table is empty (first deploy). Safe on every restart —
 *  it never overwrites passwords or re-enables accounts you changed in the admin panel. */
async function seedIfEmpty() {
  const { c } = await one('SELECT COUNT(*)::int AS c FROM accounts');
  if (c === 0) { console.log('[db] accounts table empty — seeding default accounts'); await seedAll(); }
  else console.log(`[db] ${c} accounts present — skipping seed`);
}

/** Set RESET_ADMIN_PASSWORD in Railway → api → Variables to (re)create the `admin` account with that password
 *  on the next start — works even when the table already has accounts. Remove the variable afterwards. */
async function ensureAdminFromEnv() {
  const pw = process.env.RESET_ADMIN_PASSWORD;
  if (!pw) return;
  const client = await pool.connect();
  try {
    await upsertAccount(client, { username:'admin', password:pw, role:'admin', phone:'+91 99299 92299', branch:'HQ' });
    await client.query(`UPDATE accounts SET role='admin', active=1 WHERE LOWER(username)='admin'`);
    await client.query(`DELETE FROM pending_logins WHERE LOWER(username)='admin'`);
    console.log('[db] RESET_ADMIN_PASSWORD applied: account "admin" now uses that password. Remove the variable now.');
  } finally { client.release(); }
}

async function logAccountSummary() {
  const rows = await many('SELECT username, role, active FROM accounts ORDER BY id LIMIT 10');
  console.log('[db] accounts (first 10): ' + (rows.map(r => `${r.username}/${r.role}${r.active ? '' : '(disabled)'}`).join(', ') || 'none'));
}

async function resetAll() {
  await pool.query('TRUNCATE accounts, device_access, pending_logins, sessions_audit, settings RESTART IDENTITY');
  console.log('[db] reset done');
}

/* CLI:  node db.js --seed | --reset */
if (require.main === module) {
  (async () => {
    const arg = process.argv[2];
    await waitForDb();
    await initSchema();
    if (arg === '--seed') await seedAll();
    else if (arg === '--reset') { await resetAll(); await seedAll(); }
    else console.log('Usage: node db.js --seed | --reset');
    await pool.end();
  })().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { pool, query, one, many, initSchema, waitForDb, seedAll, seedIfEmpty, resetAll, ensureAdminFromEnv, logAccountSummary };
