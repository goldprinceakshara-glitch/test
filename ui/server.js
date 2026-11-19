// server.js — GP Portal UI: tiny zero-dependency static server.
// Serves ./public and a runtime /config.js that tells the pages where the API lives (env API_URL).
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, 'public'));
// Accept "my-api.up.railway.app" (no scheme) as well as "https://my-api.up.railway.app/".
let API_URL = (process.env.API_URL || '').trim().replace(/\/+$/, '');
if (API_URL && !/^https?:\/\//i.test(API_URL)) API_URL = (/^(localhost|127\.)/.test(API_URL) ? 'http://' : 'https://') + API_URL;
API_URL = API_URL.replace(/\/api$/i, '');   // people often paste ".../api"; the pages add /api/... themselves

const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp',
  '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf'
};

if (!API_URL) console.warn('[ui] API_URL is not set — pages will call the API on their own origin. Set API_URL in Railway → ui → Variables.');
if (!fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) console.error('[ui] WARNING: index.html not found in ' + PUBLIC_DIR);

function send(res, code, body, headers = {}) { res.writeHead(code, headers); res.end(body); }

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', { 'Content-Type':'text/plain; charset=utf-8' });
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store, no-cache, must-revalidate' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    };
    if (req.method === 'HEAD') {
      headers['Content-Length'] = st.size;
      res.writeHead(200, headers);
      return res.end();
    }
    if (ext === '.html') {
      // Inject before page scripts so localStorage is hydrated before legacy pages read it.
      return fs.readFile(file, 'utf8', (readErr, html) => {
        if (readErr) return send(res, 500, 'Unable to read page', { 'Content-Type':'text/plain; charset=utf-8' });
        if (!html.includes('/cloud-sync.js')) html = html.replace(/<\\/head>/i, '<script src="/cloud-sync.js"></script>\\n</head>');
        const body = Buffer.from(html, 'utf8');
        headers['Content-Length'] = body.length;
        res.writeHead(200, headers);
        res.end(body);
      });
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

// Same-origin proxy: the browser calls /api/... on THIS server, which forwards to API_URL.
// This removes CORS from the picture entirely (no CORS_ORIGIN needed) and gives clear errors.
function proxyApi(req, res, pathAndQuery) {
  const json = (code, obj) => send(res, code, JSON.stringify(obj), { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  if (!API_URL) return json(502, { error:'API_URL is not set on the ui service. Set it to the API address (https://<api-domain>) and redeploy.' });
  const chunks = []; let size = 0, tooBig = false;
  req.on('data', c => { size += c.length; if (size > 20 * 1024 * 1024) { tooBig = true; req.destroy(); } else chunks.push(c); });
  req.on('error', () => {});
  req.on('end', async () => {
    if (tooBig) return json(413, { error:'Request too large' });
    const headers = {};
    for (const h of ['content-type', 'authorization', 'user-agent', 'accept']) if (req.headers[h]) headers[h] = req.headers[h];
    headers['x-forwarded-for'] = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length;
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(API_URL + pathAndQuery, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined, signal: ctl.signal });
      clearTimeout(timer);
      const buf = Buffer.from(await r.arrayBuffer());
      send(res, r.status, buf, { 'Content-Type': r.headers.get('content-type') || 'application/json', 'Cache-Control':'no-store' });
    } catch (e) {
      console.error('[ui] proxy error ->', API_URL + pathAndQuery, e && e.message, e && e.cause && e.cause.code);
      json(502, { error:'The ui server cannot reach the API at ' + API_URL + ' (' + ((e && e.cause && e.cause.code) || (e && e.message) || 'error') + '). Check API_URL on the ui service and that the API service is running.' });
    }
  });
}

http.createServer((req, res) => {
  const isApi = req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?');
  if (isApi) return proxyApi(req, res, req.url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { return send(res, 400, 'Bad request'); }

  if (pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type':'text/plain' });

  if (pathname === '/config.js') {
    return send(res, 200, `window.GP_API_BASE = "";\nwindow.GP_API_PROXY = true;\n`,
      { 'Content-Type':'application/javascript; charset=utf-8', 'Cache-Control':'no-store' });
  }

  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.join(PUBLIC_DIR, pathname);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');

  // Unknown path without a file extension → login page (same behaviour as before)
  if (!fs.existsSync(file) && !path.extname(pathname)) return serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
  serveFile(req, res, file);
}).listen(PORT, () => {
  console.log(`[gp-portal-ui] listening on port ${PORT}`);
  console.log(`[gp-portal-ui] serving ${PUBLIC_DIR}`);
  console.log(`[gp-portal-ui] /api/* is proxied to API_URL = ${API_URL || '(NOT SET)'}`);
});
