/* gp-sync.js — shared data for GP Portal.
 *
 * The pages keep orders, parties, catalogue, stock and stone stock in localStorage, which only lives in ONE browser.
 * This script (load it in <head>, after config.js and before the page's own scripts) mirrors those keys to the
 * server database (/api/data), so every browser and computer sees the same data.
 *
 *  - On page load: pulls all shared keys from the server into localStorage BEFORE the page scripts run.
 *  - On localStorage.setItem / removeItem of a shared key: sends the change to the server (debounced).
 *  - First time a browser syncs: data that exists only in this browser is uploaded (nothing is lost).
 *  - Later: the server is the source of truth. Unsent changes (offline, expired login) are kept and retried.
 *  - Login/session keys and per-device settings are never synced (see DENY below).
 */
(function () {
  'use strict';
  if (window.__GP_SYNC__) return;
  window.__GP_SYNC__ = true;

  var LS;
  try { LS = window.localStorage; LS.getItem('gp_sync_probe'); } catch (e) { return; }

  var token = LS.getItem('gp_jwt');
  if (!token) return;                                   // not logged in (login page): nothing to sync

  /* keys that stay in this browser only */
  var DENY = {
    gp_jwt: 1, gp_logged_user: 1, gp_orig_role: 1, gp_pending_user: 1,
    gp_portal_users: 1, gp_designer_users: 1, gp_cad_designer_users: 1, gp_post_production_users: 1,
    gp_pending_logins: 1, gp_device_access: 1, gp_admin_mobile: 1,
    gp_stone_lowstock_dismissed: 1, gp_received_seen_ho: 1, gp_completed_bump: 1,
    gp_telegram_config: 1, gp_chat_messages: 1
  };
  var DENY_PREFIX = ['gp_sync_', 'gp_seen_', 'gp_notif_log_', 'gp_chat', 'gp_jwt'];
  function shared(k) {
    k = String(k);
    if (DENY[k] || !/^[A-Za-z0-9_\-:.]{1,160}$/.test(k)) return false;
    for (var i = 0; i < DENY_PREFIX.length; i++) if (k.indexOf(DENY_PREFIX[i]) === 0) return false;
    return true;
  }

  var host = location.hostname;
  var base = (window.GP_API_BASE || ((host === 'localhost' || host === '127.0.0.1') ? 'http://localhost:4000' : '')).replace(/\/+$/, '');
  var FLAG = 'gp_sync_v1', DIRTY = 'gp_sync_dirty';

  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  var expired = false;

  function hdrs() { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }; }

  /* ---------- dirty list: keys changed here but not yet saved on the server ---------- */
  function getDirty() { try { return JSON.parse(LS.getItem(DIRTY) || '{}') || {}; } catch (e) { return {}; } }
  function setDirty(d) { try { rawSet.call(LS, DIRTY, JSON.stringify(d)); } catch (e) {} }
  function markDirty(k) { var d = getDirty(); d[k] = Date.now(); setDirty(d); }
  function clearDirty(k, stamp) {
    var d = getDirty();
    if (d[k] && d[k] <= stamp) { delete d[k]; setDirty(d); }
  }

  function banner(msg) {
    try {
      var b = document.getElementById('gpSyncBanner');
      if (!b) {
        b = document.createElement('div'); b.id = 'gpSyncBanner';
        b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#b00020;color:#fff;' +
                          'font:600 13px Segoe UI,Roboto,sans-serif;padding:8px 12px;text-align:center';
        (document.body || document.documentElement).appendChild(b);
      }
      b.textContent = msg;
    } catch (e) {}
  }
  function sessionExpired() {
    if (expired) return; expired = true;
    console.warn('[gp-sync] login expired — changes are NOT being saved to the server');
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { banner('Session expired. Please log in again — your latest changes are not saved yet.'); });
    else banner('Session expired. Please log in again — your latest changes are not saved yet.');
  }

  /* ---------- sending ---------- */
  function send(k, keepalive) {
    var stamp = Date.now();
    var v = LS.getItem(k), isDel = (v === null);
    var body = isDel ? undefined : JSON.stringify({ value: v });
    var opts = { method: isDel ? 'DELETE' : 'PUT', headers: hdrs(), body: body };
    if (keepalive && (!body || body.length < 60000)) opts.keepalive = true;
    return fetch(base + '/api/data/' + encodeURIComponent(k), opts).then(function (r) {
      if (r.ok) { clearDirty(k, stamp); return; }
      if (r.status === 401 || r.status === 403) sessionExpired();
      else console.warn('[gp-sync] save failed for', k, r.status);
    }).catch(function () { /* offline: stays dirty, retried on next load */ });
  }

  var timers = {};
  function schedule(k) {
    markDirty(k);
    clearTimeout(timers[k]);
    timers[k] = setTimeout(function () { delete timers[k]; send(k, false); }, 400);
  }
  function flushAll() {
    Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; send(k, true); });
  }

  /* ---------- intercept writes ---------- */
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === window.localStorage && shared(k)) schedule(String(k));
  };
  Storage.prototype.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === window.localStorage && shared(k)) schedule(String(k));
  };
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);

  /* ---------- applying server data ---------- */
  function applyServer(data, first) {
    var dirty = getDirty(), changed = 0, i;
    Object.keys(data).forEach(function (k) {
      if (!shared(k) || dirty[k]) return;                 // keep our own unsent change
      if (LS.getItem(k) !== data[k]) { rawSet.call(LS, k, data[k]); changed++; }
    });
    var local = [];
    for (i = 0; i < LS.length; i++) local.push(LS.key(i));
    local.forEach(function (k) {
      if (!shared(k) || Object.prototype.hasOwnProperty.call(data, k) || dirty[k]) return;
      if (first) { markDirty(k); schedule(k); }            // first sync: upload what only this browser has
      else { rawRemove.call(LS, k); changed++; }           // removed elsewhere
    });
    Object.keys(dirty).forEach(function (k) { if (shared(k) && !timers[k]) schedule(k); });   // retry unsent changes
    return changed;
  }

  /* ---------- initial pull (synchronous, so page scripts see server data) ---------- */
  var first = !LS.getItem(FLAG);
  try {
    var x = new XMLHttpRequest();
    x.open('GET', base + '/api/data', false);
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.send(null);
    if (x.status === 200) {
      var n = applyServer((JSON.parse(x.responseText) || {}).data || {}, first);
      rawSet.call(LS, FLAG, '1');
      if (n) console.info('[gp-sync] loaded', n, 'item(s) from the server');
    } else if (x.status === 401 || x.status === 403) {
      sessionExpired();
    } else {
      console.warn('[gp-sync] server returned', x.status, '— using this browser\'s saved data');
    }
  } catch (e) {
    console.warn('[gp-sync] cannot reach the server — using this browser\'s saved data');
  }

  /* ---------- keep up with other users (no reload needed for pages that re-read localStorage) ---------- */
  function refresh() {
    if (expired || document.visibilityState === 'hidden') return;
    fetch(base + '/api/data', { headers: hdrs(), cache: 'no-store' }).then(function (r) {
      if (r.status === 401 || r.status === 403) { sessionExpired(); return null; }
      return r.ok ? r.json() : null;
    }).then(function (j) { if (j && j.data) applyServer(j.data, false); }).catch(function () {});
  }
  setInterval(refresh, 30000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });

  window.GP_SYNC = { flush: flushAll, refresh: refresh, isShared: shared };
})();
