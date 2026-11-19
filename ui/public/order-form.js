/* ============================================================
   order-form.js — SINGLE WORKING FILE
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     SESSION GUARD
     ============================================================ */
  var session = null;
  try { session = JSON.parse(sessionStorage.getItem('gp_logged_user') || 'null'); } catch (e) { session = null; }
  if (!session || !session.username) {
    try { sessionStorage.removeItem('gp_logged_user'); } catch (e) {}
    window.location.replace('index.html');
    return;
  }

  /* ============================================================
     HELPERS
     ============================================================ */
  function _readJSON(k, fb) {
    try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? fb : v; }
    catch (e) { return fb; }
  }
  function saveJSON(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
    if (typeof gpQueueOrderShared === 'function') gpQueueOrderShared(k, v);
  }
  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(v) { return escapeHtml(v); }
  function formatNumber(v) {
    var n = Number(v || 0);
    return n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  }
  function formatNumber2(v) {
    return Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatDate(v) {
    if (!v) return '—';
    var p = String(v).split('-');
    return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : v;
  }
  function safeFilePart(v) { return String(v || 'FILE').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, ''); }

  /* ============================================================
     IMAGE FALLBACK HELPER
     ============================================================ */
  function getImageFallbackList(originalPath) {
    if (!originalPath) return [];
    var path = String(originalPath).trim();
    
    // If it's a full URL or data URI, just return it
    if (path.startsWith('http') || path.startsWith('data:')) return [path];
    
    var parts = path.split('/');
    var filename = parts.pop();
    var dir = parts.length ? parts.join('/') + '/' : '';
    
    // Generate variants (underscores instead of spaces, lowercase, etc.)
    var variants = [
      dir + filename,
      dir + filename.replace(/ /g, '_'),
      dir + filename.replace(/ /g, '-'),
      dir + filename.toLowerCase(),
      dir + filename.toLowerCase().replace(/ /g, '_')
    ];
    
    // Remove duplicates
    return variants.filter(function (v, i, self) { return self.indexOf(v) === i; });
  }

  function handleImageError(imgEl, fallbackList, idx) {
    if (!imgEl) return;
    idx = idx || 0;
    if (idx < fallbackList.length) {
      imgEl.src = fallbackList[idx];
      imgEl.onerror = function () { handleImageError(imgEl, fallbackList, idx + 1); };
    } else {
      // All fallbacks failed, show missing placeholder
      imgEl.style.display = 'none';
      var missingEl = imgEl.parentElement.querySelector('.image-missing-placeholder');
      if (missingEl) missingEl.style.display = 'flex';
    }
  }

  /* ============================================================
     STORAGE KEYS
     ============================================================ */
  var PARTIES_KEY        = 'goldprince_parties';
  var PARTIES_LEGACY_KEY = 'gp_party_master';
  var ESTIMATIONS_KEY    = 'goldprince_estimations';
  var ORDERS_KEY         = 'goldprince_orders_v3';

  /* Catalogue sources */
  var CATALOGUE_KEY         = 'goldprince_catalogue';
  var CATALOGUE_UPDATES_KEY = 'goldprince_catalogue_updates_v1';
  var CATALOGUE_EXTRA_KEYS  = [
    'goldprince_catalogue_3D_PREMIUM_IDOLS',
    'goldprince_premium_catalogue',
    'goldprince_catalogue_3D_IDOLS',
    'goldprince_catalogue_2D_IDOLS',
    'goldprince_catalogue_JEWELLERY',
    'goldprince_catalogue_GOD_FRAMES'
  ];

  var COMPLETED_KEY      = 'goldprince_completed_v1';
  var STAGES_KEY         = 'goldprince_stage_history_v1';
  var SENDS_KEY          = 'goldprince_stock_sends_v1';
  var RECEIVED_SEEN_KEY  = 'gp_received_seen_ho';

  var STAGE2_ORDERS_KEY  = 'goldprince_stage2_orders_v1';

  /* ============================================================
     RAILWAY SHARED ORDER DATA — one source of truth across browsers
     ============================================================ */
  var GP_ORDER_SHARED_KEYS = [
    ESTIMATIONS_KEY, ORDERS_KEY, COMPLETED_KEY, STAGES_KEY, SENDS_KEY,
    STAGE2_ORDERS_KEY, CATALOGUE_KEY, CATALOGUE_UPDATES_KEY,
    'goldprince_catalogue_3D_PREMIUM_IDOLS', 'goldprince_premium_catalogue',
    'goldprince_catalogue_3D_IDOLS', 'goldprince_catalogue_2D_IDOLS',
    'goldprince_catalogue_JEWELLERY', 'goldprince_catalogue_GOD_FRAMES',
    PARTIES_KEY, PARTIES_LEGACY_KEY, 'gp_internal_notifications',
    'goldprince_stage2_history_v1'
  ];
  var GP_ORDER_SHARED = { versions:{}, base:{}, pending:{}, queues:{}, ready:false, pollBusy:false };
  var GP_ORDER_API = String(window.GP_API_BASE || 'https://test-production-313c31af.up.railway.app').replace(/\\/+$/, '');

  function gpOrderClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }
  function gpOrderStableId(item) {
    if (!item || typeof item !== 'object') return null;
    var keys = ['id','orderId','estimateId','estimationId','estimateNo','estimationNo','orderNo','orderNumber'];
    for (var i = 0; i < keys.length; i++) {
      if (item[keys[i]] != null && String(item[keys[i]]) !== '') return String(item[keys[i]]);
    }
    return null;
  }
  function gpOrderMerge(base, local, remote) {
    if (remote == null) return gpOrderClone(local);
    if (local == null) return gpOrderClone(remote);
    if (Array.isArray(local) && Array.isArray(remote)) {
      var all = local.concat(remote, Array.isArray(base) ? base : []);
      var keyed = all.length > 0 && all.every(function (x) { return !!gpOrderStableId(x); });
      if (!keyed) return gpOrderClone(local);
      var bm = {}, lm = {}, rm = {};
      (base || []).forEach(function (x) { bm[gpOrderStableId(x)] = x; });
      local.forEach(function (x) { lm[gpOrderStableId(x)] = x; });
      remote.forEach(function (x) { rm[gpOrderStableId(x)] = x; });
      var out = gpOrderClone(rm);
      Object.keys(bm).forEach(function (id) {
        if (!Object.prototype.hasOwnProperty.call(lm, id)) delete out[id];
        else if (JSON.stringify(lm[id]) !== JSON.stringify(bm[id])) out[id] = gpOrderClone(lm[id]);
      });
      Object.keys(lm).forEach(function (id) {
        if (!Object.prototype.hasOwnProperty.call(bm, id)) out[id] = gpOrderClone(lm[id]);
      });
      return Object.keys(out).map(function (id) { return out[id]; });
    }
    if (typeof local === 'object' && typeof remote === 'object' && !Array.isArray(local) && !Array.isArray(remote)) {
      var result = gpOrderClone(remote) || {}, b = base && typeof base === 'object' ? base : {};
      Object.keys(b).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(local, key)) delete result[key];
        else if (JSON.stringify(local[key]) !== JSON.stringify(b[key])) result[key] = gpOrderClone(local[key]);
      });
      Object.keys(local).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) result[key] = gpOrderClone(local[key]);
      });
      return result;
    }
    return gpOrderClone(local);
  }
  function gpOrderToken() { return localStorage.getItem('gp_jwt') || ''; }
  function gpOrderShowSyncNotice(message) {
    var n = document.getElementById('gpOrderSyncNotice');
    if (!n) {
      n = document.createElement('div');
      n.id = 'gpOrderSyncNotice';
      n.style.cssText = 'position:fixed;z-index:99999;left:12px;right:12px;bottom:12px;padding:12px 16px;border-radius:10px;background:#8b1738;color:#fff;font:600 13px Segoe UI, sans-serif;box-shadow:0 4px 18px #0003';
      document.body.appendChild(n);
    }
    n.textContent = message;
    n.style.display = 'block';
  }
  function gpOrderHideSyncNotice() {
    var n = document.getElementById('gpOrderSyncNotice');
    if (n) n.style.display = 'none';
  }
  async function gpOrderGetSnapshot() {
    var token = gpOrderToken();
    if (!token) throw new Error('Login token is missing. Please sign in again to enable cross-browser sync.');
    var response = await fetch(GP_ORDER_API + '/api/inventory', {
      headers:{ 'Authorization':'Bearer ' + token, 'Cache-Control':'no-cache' },
      cache:'no-store'
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(payload.error || ('Shared data load failed (' + response.status + ')'));
    return payload;
  }
  async function gpOrderPut(key, value) {
    var next = gpOrderClone(value);
    for (var attempt = 0; attempt < 6; attempt++) {
      var response = await fetch(GP_ORDER_API + '/api/inventory/' + encodeURIComponent(key), {
        method:'PUT',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + gpOrderToken() },
        body:JSON.stringify({ value:next, expectedVersion:Number(GP_ORDER_SHARED.versions[key] || 0) })
      });
      var data = await response.json().catch(function () { return {}; });
      if (response.status === 409) {
        GP_ORDER_SHARED.versions[key] = Number(data.version || 0);
        next = gpOrderMerge(GP_ORDER_SHARED.base[key], next, data.value);
        continue;
      }
      if (!response.ok) throw new Error(data.error || ('Shared save failed for ' + key + ' (' + response.status + ')'));
      GP_ORDER_SHARED.versions[key] = Number(data.version || 0);
      GP_ORDER_SHARED.base[key] = gpOrderClone(data.value);
      localStorage.setItem(key, JSON.stringify(data.value));
      return data;
    }
    throw new Error('Shared data kept changing. Please retry the save.');
  }
  async function gpDrainOrderShared(key) {
    if (GP_ORDER_SHARED.queues[key] || !GP_ORDER_SHARED.ready) return GP_ORDER_SHARED.queues[key];
    GP_ORDER_SHARED.queues[key] = (async function () {
      while (Object.prototype.hasOwnProperty.call(GP_ORDER_SHARED.pending, key)) {
        var next = GP_ORDER_SHARED.pending[key];
        delete GP_ORDER_SHARED.pending[key];
        await gpOrderPut(key, next);
      }
    })().catch(function (error) {
      console.error('[GP Order Form] shared save failed for ' + key, error);
      gpOrderShowSyncNotice('SYNC ERROR: ' + error.message + ' — your change is still on this browser; retry after connection is restored.');
    }).finally(function () {
      delete GP_ORDER_SHARED.queues[key];
      if (Object.prototype.hasOwnProperty.call(GP_ORDER_SHARED.pending, key)) gpDrainOrderShared(key);
    });
    return GP_ORDER_SHARED.queues[key];
  }
  function gpQueueOrderShared(key, value) {
    if (GP_ORDER_SHARED_KEYS.indexOf(key) === -1) return;
    GP_ORDER_SHARED.pending[key] = gpOrderClone(value);
    if (GP_ORDER_SHARED.ready) gpDrainOrderShared(key);
  }
  async function gpLoadOrderShared() {
    var payload = await gpOrderGetSnapshot();
    var remote = payload.data || {};
    GP_ORDER_SHARED.versions = payload.versions || {};
    for (var i = 0; i < GP_ORDER_SHARED_KEYS.length; i++) {
      var key = GP_ORDER_SHARED_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(remote, key)) {
        GP_ORDER_SHARED.base[key] = gpOrderClone(remote[key]);
        localStorage.setItem(key, JSON.stringify(remote[key]));
      } else {
        var raw = localStorage.getItem(key);
        if (raw !== null) {
          try {
            var legacy = JSON.parse(raw);
            GP_ORDER_SHARED.base[key] = null;
            await gpOrderPut(key, legacy);
          } catch (e) {
            console.warn('[GP Order Form] legacy data migration failed for ' + key, e);
          }
        }
      }
    }
    GP_ORDER_SHARED.ready = true;
    var pendingKeys = Object.keys(GP_ORDER_SHARED.pending);
    for (var j = 0; j < pendingKeys.length; j++) gpDrainOrderShared(pendingKeys[j]);
    gpOrderHideSyncNotice();
    return true;
  }
  async function gpRefreshOrderShared() {
    if (!GP_ORDER_SHARED.ready || GP_ORDER_SHARED.pollBusy || document.visibilityState === 'hidden') return;
    GP_ORDER_SHARED.pollBusy = true;
    try {
      var payload = await gpOrderGetSnapshot();
      var remote = payload.data || {}, versions = payload.versions || {};
      for (var i = 0; i < GP_ORDER_SHARED_KEYS.length; i++) {
        var key = GP_ORDER_SHARED_KEYS[i];
        if (!Object.prototype.hasOwnProperty.call(remote, key)) continue;
        if (GP_ORDER_SHARED.queues[key] || Object.prototype.hasOwnProperty.call(GP_ORDER_SHARED.pending, key)) continue;
        var version = Number(versions[key] || 0);
        if (version <= Number(GP_ORDER_SHARED.versions[key] || 0)) continue;
        GP_ORDER_SHARED.versions[key] = version;
        GP_ORDER_SHARED.base[key] = gpOrderClone(remote[key]);
        localStorage.setItem(key, JSON.stringify(remote[key]));
        window.dispatchEvent(new CustomEvent('gp:shared-data-changed', { detail:{ key:key, version:version } }));
      }
      gpOrderHideSyncNotice();
    } catch (error) {
      console.warn('[GP Order Form] shared refresh failed', error);
    } finally {
      GP_ORDER_SHARED.pollBusy = false;
    }
  }
  var gpOrderSharedReady = gpLoadOrderShared().catch(function (error) {
    GP_ORDER_SHARED.ready = true;
    console.error('[GP Order Form] shared initialization failed', error);
    gpOrderShowSyncNotice('CROSS-BROWSER SYNC NOT READY: ' + error.message);
    return false;
  });
  setInterval(gpRefreshOrderShared, 4000);
  window.addEventListener('focus', gpRefreshOrderShared);


  function getCompletedMap() {
    var m = _readJSON(COMPLETED_KEY, {});
    return (m && typeof m === 'object') ? m : {};
  }
  function getSeenReceivedIds() {
    var a = _readJSON(RECEIVED_SEEN_KEY, []);
    return Array.isArray(a) ? a : [];
  }
  function saveSeenReceivedIds(arr) { saveJSON(RECEIVED_SEEN_KEY, arr); }

  /* ============================================================
     JAMA HELPERS
     ============================================================ */
  function stage2OrderLeavingJama(orderId) {
    if (!orderId) return false;
    var v = _readJSON(STAGE2_ORDERS_KEY, {});
    if (!v || typeof v !== 'object') return false;
    var s = v[orderId];
    if (!s) return false;
    if (s.stage && s.stage !== 'STOCK_JAMA') return true;
    if (Array.isArray(s.forwardBatches) && s.forwardBatches.length > 0) return true;
    if (Array.isArray(s.forwardedEvents) && s.forwardedEvents.length > 0) return true;
    return false;
  }

  function jamaInfo(info, orderId) {
    if (info && (info.jamaCompleted || info.jamaConfirmedAt || info.jamaDoneAt)) {
      return {
        done: true,
        at:   info.jamaCompletedAt || info.jamaConfirmedAt || info.jamaDoneAt || null,
        by:   info.jamaBy || info.jamaConfirmedBy || null
      };
    }
    if (orderId && stage2OrderLeavingJama(orderId)) {
      return { done: true, at: null, by: null };
    }
    return { done: false, at: null, by: null };
  }

  /* ============================================================
     RECEIVED ORDERS — data assembly
     ============================================================ */
  function mergeReceivedItems(order, info) {
    var items = Array.isArray(order.items) ? order.items : [];
    if (!info || !Array.isArray(info.rows) || !info.rows.length) {
      return items.map(function (x) {
        return {
          artNo: x.artNo, name: x.name, heightInch: x.heightInch, image: x.image,
          orderQty: Number(x.quantity || 0),
          sentQty: Number(x.quantity || 0),
          weight: Number(x.weight || 0),
          sentTotal: Number(x.totalWeight || 0)
        };
      });
    }
    var byArt = {};
    info.rows.forEach(function (r) {
      var k = String(r.artNo || '').trim().toLowerCase();
      if (k) byArt[k] = r;
    });
    return items.map(function (x) {
      var r = byArt[String(x.artNo || '').trim().toLowerCase()];
      if (!r) {
        return {
          artNo: x.artNo, name: x.name, heightInch: x.heightInch, image: x.image,
          orderQty: Number(x.quantity || 0),
          sentQty: 0,
          weight: Number(x.weight || 0),
          sentTotal: 0
        };
      }
      return {
        artNo: x.artNo, name: x.name, heightInch: x.heightInch, image: x.image,
        orderQty: Number(x.quantity || 0),
        sentQty: Number(r.stockQty || 0),
        weight: Number(r.weight || 0),
        sentTotal: Number(r.rowTotal != null ? r.rowTotal : (Number(r.stockQty || 0) * Number(r.weight || 0)))
      };
    });
  }

  function getReceivedOrders() {
    var orders = _readJSON(ORDERS_KEY, []);
    if (!Array.isArray(orders)) orders = [];
    var completed = getCompletedMap();
    return orders
      .filter(function (o) { return o && completed[o.id]; })
      .map(function (o) {
        var info = completed[o.id] || {};
        var merged = mergeReceivedItems(o, info);
        var sentQty = merged.reduce(function (s, x) { return s + Number(x.sentQty || 0); }, 0);
        var sentWt  = merged.reduce(function (s, x) { return s + Number(x.sentTotal || 0); }, 0);
        var j = jamaInfo(info, o.id);
        return {
          order: o,
          info: info,
          merged: merged,
          sentQty: sentQty,
          sentWt: sentWt,
          jamaDone: j.done,
          jamaAt: j.at,
          jamaBy: j.by
        };
      })
      .filter(function (r) { return !r.jamaDone; })
      .sort(function (a, b) {
        return new Date(b.info.completedAt || 0) - new Date(a.info.completedAt || 0);
      });
  }

  function computeReceivedStatusBadge(order, sentQty) {
    var orderQtyN = Number(order && order.totalQty != null ? order.totalQty : 0);
    var sentQtyN  = Number(sentQty || 0);
    var isFull    = orderQtyN > 0 ? sentQtyN >= orderQtyN : sentQtyN > 0;
    var badgeHtml = isFull
      ? '<span class="rcv-status-badge full" title="Fully dispatched to HO">'
        + '<i class="fas fa-check-circle"></i> RECEIVED</span>'
      : '<span class="rcv-status-badge partial" title="Some quantity is still pending at the branch">'
        + '<i class="fas fa-hourglass-half"></i> PARTIALLY RECEIVED</span>';
    return { isFull: isFull, badgeHtml: badgeHtml };
  }

  function getStageTimeline(orderId) {
    var all = _readJSON(STAGES_KEY, {});
    var log = (all && Array.isArray(all[orderId])) ? all[orderId] : [];
    var tl = { NEW: null, WAX: null, CASTING: null, FILING: null, HO: null };
    log.forEach(function (e) {
      if (e && e.stage && e.date) {
        if (!tl[e.stage] || new Date(e.date) > new Date(tl[e.stage])) tl[e.stage] = e.date;
      }
    });
    return tl;
  }

  /* ============================================================
     EMBEDDED CATALOGUE
     ============================================================ */
  var EMBEDDED_CATALOGUE = {
    "3D IDOLS": {
      sheets: {
        "PADMAM GANESH": [
          {"artNo":"111916","name":"PADMAM GANESH","heightInch":"0.8","sizeMm":"20","weight":6,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"111915","name":"PADMAM GANESH","heightInch":"1.1","sizeMm":"28","weight":16,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"111914","name":"PADMAM GANESH","heightInch":"1.4","sizeMm":"35","weight":17,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"111913","name":"PADMAM GANESH","heightInch":"1.6","sizeMm":"40","weight":23,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"111912","name":"PADMAM GANESH","heightInch":"2.2","sizeMm":"55","weight":57,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"111911","name":"PADMAM GANESH","heightInch":"2.8","sizeMm":"70","weight":100,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"111910","name":"PADMAM GANESH","heightInch":"3.7","sizeMm":"95","weight":213,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"111909","name":"PADMAM GANESH","heightInch":"4.4","sizeMm":"112","weight":307,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"111908","name":"PADMAM GANESH","heightInch":"5.1","sizeMm":"130","weight":451,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"109942","name":"PADMAM GANESH","heightInch":"5.9","sizeMm":"150","weight":594,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"108003","name":"PADMAM GANESH","heightInch":"6.9","sizeMm":"175","weight":1000,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"108004","name":"PADMAM GANESH","heightInch":"7.6","sizeMm":"195","weight":1500,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"109422","name":"PADMAM GANESH","heightInch":"7.7","sizeMm":"196","weight":1550,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"107685","name":"PADMAM GANESH","heightInch":"9.0","sizeMm":"228","weight":2000,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"108005","name":"PADMAM GANESH","heightInch":"10.2","sizeMm":"260","weight":2500,"image":"images/PADMAM GANESH.jpg"},
          {"artNo":"106178","name":"PADMAM GANESH","heightInch":"12.0","sizeMm":"304","weight":6000,"image":"images/PADMAM GANESH.jpg"}
        ],
        "PADMAM LAKSHMI": [
          {"artNo":"113572","name":"PADMAM LAKSHMI","heightInch":"0.8","sizeMm":"20","weight":7,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"112259","name":"PADMAM LAKSHMI","heightInch":"1.1","sizeMm":"28","weight":17,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"112258","name":"PADMAM LAKSHMI","heightInch":"1.4","sizeMm":"35","weight":18,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"112257","name":"PADMAM LAKSHMI","heightInch":"1.6","sizeMm":"40","weight":25,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"112256","name":"PADMAM LAKSHMI","heightInch":"2.2","sizeMm":"55","weight":61,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"112255","name":"PADMAM LAKSHMI","heightInch":"2.8","sizeMm":"70","weight":107,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"114569","name":"PADMAM LAKSHMI","heightInch":"3.3","sizeMm":"83","weight":164,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"112254","name":"PADMAM LAKSHMI","heightInch":"3.7","sizeMm":"95","weight":223,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"112253","name":"PADMAM LAKSHMI","heightInch":"4.4","sizeMm":"112","weight":336,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"112252","name":"PADMAM LAKSHMI","heightInch":"5.1","sizeMm":"130","weight":448,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"106238","name":"PADMAM LAKSHMI","heightInch":"5.9","sizeMm":"150","weight":854,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"106239","name":"PADMAM LAKSHMI","heightInch":"7.0","sizeMm":"180","weight":1577,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"109439","name":"PADMAM LAKSHMI","heightInch":"7.7","sizeMm":"195","weight":1550,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"107720","name":"PADMAM LAKSHMI","heightInch":"8.9","sizeMm":"228","weight":1900,"image":"images/PADMAM LAKSHMI.jpg"},
          {"artNo":"106177","name":"PADMAM LAKSHMI","heightInch":"11.8","sizeMm":"300","weight":6000,"image":"images/PADMAM LAKSHMI.jpg"}
        ],
        "SARASWATHI": [
          {"artNo":"112031","name":"SARASWATHI","heightInch":"0.8","sizeMm":"20","weight":6,"image":"images/SARASWATHI.jpg"},
          {"artNo":"112030","name":"SARASWATHI","heightInch":"1.1","sizeMm":"28","weight":18,"image":"images/SARASWATHI.jpg"},
          {"artNo":"112029","name":"SARASWATHI","heightInch":"1.4","sizeMm":"35","weight":27,"image":"images/SARASWATHI.jpg"},
          {"artNo":"112028","name":"SARASWATHI","heightInch":"1.6","sizeMm":"40","weight":27,"image":"images/SARASWATHI.jpg"},
          {"artNo":"112027","name":"SARASWATHI","heightInch":"2.2","sizeMm":"55","weight":64,"image":"images/SARASWATHI.jpg"},
          {"artNo":"112026","name":"SARASWATHI","heightInch":"2.8","sizeMm":"70","weight":120,"image":"images/SARASWATHI.jpg"},
          {"artNo":"112025","name":"SARASWATHI","heightInch":"3.7","sizeMm":"95","weight":242,"image":"images/SARASWATHI.jpg"},
          {"artNo":"112024","name":"SARASWATHI","heightInch":"4.4","sizeMm":"112","weight":375,"image":"images/SARASWATHI.jpg"},
          {"artNo":"112023","name":"SARASWATHI","heightInch":"5.1","sizeMm":"130","weight":542,"image":"images/SARASWATHI.jpg"},
          {"artNo":"106242","name":"SARASWATHI","heightInch":"5.9","sizeMm":"150","weight":936,"image":"images/SARASWATHI.jpg"},
          {"artNo":"106243","name":"SARASWATHI","heightInch":"7.0","sizeMm":"180","weight":1140,"image":"images/SARASWATHI.jpg"},
          {"artNo":"109439","name":"SARASWATHI","heightInch":"7.7","sizeMm":"195","weight":1550,"image":"images/SARASWATHI.jpg"},
          {"artNo":"113509","name":"SARASWATHI","heightInch":"9.0","sizeMm":"228","weight":2100,"image":"images/SARASWATHI.jpg"}
        ]
      }
    },
    "2D IDOLS": {
      sheets: {
        "PANCHAMUKHA GANESH": [
          {"artNo":"112869","name":"PANCHAMUKHA GANESH","heightInch":"1.5","sizeMm":"38","weight":16,"image":"images/2D PANCHAMUKHA GANESH.jpg"},
          {"artNo":"112870","name":"PANCHAMUKHA GANESH","heightInch":"2.5","sizeMm":"63","weight":59,"image":"images/2D PANCHAMUKHA GANESH.jpg"},
          {"artNo":"112856","name":"PANCHAMUKHA GANESH","heightInch":"3.5","sizeMm":"89","weight":123,"image":"images/2D PANCHAMUKHA GANESH.jpg"}
        ],
        "PANCHAMUKHA HANUMAN": [
          {"artNo":"112238","name":"PANCHAMUKHA HANUMAN","heightInch":"1.0","sizeMm":"25","weight":6,"image":"images/2D PANCHAMUKHA HANUMAN-2.jpg"},
          {"artNo":"112237","name":"PANCHAMUKHA HANUMAN","heightInch":"1.4","sizeMm":"35","weight":12,"image":"images/2D PANCHAMUKHA HANUMAN-2.jpg"},
          {"artNo":"112236","name":"PANCHAMUKHA HANUMAN","heightInch":"1.8","sizeMm":"45","weight":23,"image":"images/2D PANCHAMUKHA HANUMAN-2.jpg"},
          {"artNo":"112235","name":"PANCHAMUKHA HANUMAN","heightInch":"2.2","sizeMm":"55","weight":40,"image":"images/2D PANCHAMUKHA HANUMAN-2.jpg"},
          {"artNo":"112234","name":"PANCHAMUKHA HANUMAN","heightInch":"2.6","sizeMm":"65","weight":60,"image":"images/2D PANCHAMUKHA HANUMAN-2.jpg"}
        ]
      }
    },
    "3D PREMIUM IDOLS": {
      sheets: {
        "PREMIUM GANESH": [
          {"artNo":"200001","name":"PREMIUM GANESH","heightInch":"3.0","sizeMm":"76","weight":500,"image":"images/PREMIUM GANESH.jpg"}
        ]
      }
    },
    "JEWELLERY": {
      sheets: {
        "REGULAR": [
          {"artNo":"8001","name":"PENDANT","heightInch":"","sizeMm":"","weight":54,"image":"images/8001.jpg"},
          {"artNo":"8002","name":"PENDANT","heightInch":"","sizeMm":"","weight":60,"image":"images/8002.jpg"},
          {"artNo":"8008","name":"HARAM","heightInch":"","sizeMm":"","weight":156,"image":"images/8008.jpg"},
          {"artNo":"8204","name":"NECKLACE","heightInch":"","sizeMm":"","weight":107,"image":"images/8204.jpg"}
        ],
        "PREMIUM NAGAS": [
          {"artNo":"89491","name":"NECKLACE","heightInch":"","sizeMm":"","weight":73,"image":"images/89491.jpg"},
          {"artNo":"8002","name":"PENDANT","heightInch":"","sizeMm":"","weight":60,"image":"images/8002.jpg"},
          {"artNo":"90289","name":"NECKLACE","heightInch":"","sizeMm":"","weight":132,"image":"images/90289.jpg"},
          {"artNo":"90168","name":"NECKLACE","heightInch":"","sizeMm":"","weight":96,"image":"images/8204.jpg"}
        ],
        "GATTI": [
          {"artNo":"111196","name":"JIGINI","heightInch":"","sizeMm":"","weight":22,"image":"images/111196.jpg"},
          {"artNo":"111198","name":"JIGINI","heightInch":"","sizeMm":"","weight":23,"image":"images/111198.jpg"}
        ],
        "GJ": [
          {"artNo":"8001","name":"PENDANT","heightInch":"","sizeMm":"","weight":54,"image":"images/8001.jpg"},
          {"artNo":"8002","name":"PENDANT","heightInch":"","sizeMm":"","weight":60,"image":"images/8002.jpg"},
          {"artNo":"8008","name":"HARAM","heightInch":"","sizeMm":"","weight":156,"image":"images/8008.jpg"},
          {"artNo":"8204","name":"NECKLACE","heightInch":"","sizeMm":"","weight":107,"image":"images/8204.jpg"}
        ],
        "PREMIUM JADAU KUNDAN": [
          {"artNo":"8001","name":"PENDANT","heightInch":"","sizeMm":"","weight":54,"image":"images/8001.jpg"},
          {"artNo":"8002","name":"PENDANT","heightInch":"","sizeMm":"","weight":60,"image":"images/8002.jpg"},
          {"artNo":"8008","name":"HARAM","heightInch":"","sizeMm":"","weight":156,"image":"images/8008.jpg"},
          {"artNo":"8204","name":"NECKLACE","heightInch":"","sizeMm":"","weight":107,"image":"images/8204.jpg"}
        ]
      }
    },
    "GOD FRAMES": {
      sheets: {
        "PADMAM GANESH": [
          {"artNo":"62039","name":"PADMAM GANESH","heightInch":"2.2","sizeMm":"A","weight":10,"image":"images/F-PADMAM GANESH.jpg"},
          {"artNo":"62071","name":"PADMAM GANESH","heightInch":"2.7","sizeMm":"N","weight":25,"image":"images/F-PADMAM GANESH.jpg"},
          {"artNo":"62212","name":"PADMAM GANESH","heightInch":"3.7","sizeMm":"B","weight":35,"image":"images/F-PADMAM GANESH.jpg"},
          {"artNo":"62000","name":"PADMAM GANESH","heightInch":"4.4","sizeMm":"B","weight":35,"image":"images/F-PADMAM GANESH.jpg"},
          {"artNo":"62178","name":"PADMAM GANESH","heightInch":"5.9","sizeMm":"AB","weight":82,"image":"images/F-PADMAM GANESH.jpg"}
        ],
        "PADMAM LAKSHMI": [
          {"artNo":"62040","name":"PADMAM LAKSHMI","heightInch":"2.2","sizeMm":"A","weight":10,"image":"images/F-PADMAM LAKSHMI.jpg"},
          {"artNo":"62055","name":"PADMAM LAKSHMI","heightInch":"2.7","sizeMm":"N","weight":25,"image":"images/F-PADMAM LAKSHMI.jpg"},
          {"artNo":"62213","name":"PADMAM LAKSHMI","heightInch":"3.7","sizeMm":"B","weight":35,"image":"images/F-PADMAM LAKSHMI.jpg"},
          {"artNo":"62001","name":"PADMAM LAKSHMI","heightInch":"4.4","sizeMm":"B","weight":35,"image":"images/F-PADMAM LAKSHMI.jpg"},
          {"artNo":"62179","name":"PADMAM LAKSHMI","heightInch":"5.9","sizeMm":"AB","weight":82,"image":"images/F-PADMAM LAKSHMI.jpg"}
        ],
        "SARASWATHI": [
          {"artNo":"62041","name":"PADMAM GANESH","heightInch":"2.2","sizeMm":"A","weight":10,"image":"images/GOD-FRAME-SAMPLE.jpg"},
          {"artNo":"62073","name":"PADMAM GANESH","heightInch":"2.7","sizeMm":"N","weight":25,"image":"images/GOD-FRAME-SAMPLE.jpg"},
          {"artNo":"62214","name":"PADMAM GANESH","heightInch":"3.7","sizeMm":"B","weight":35,"image":"images/GOD-FRAME-SAMPLE.jpg"},
          {"artNo":"62002","name":"PADMAM GANESH","heightInch":"4.4","sizeMm":"B","weight":35,"image":"images/GOD-FRAME-SAMPLE.jpg"},
          {"artNo":"62180","name":"PADMAM GANESH","heightInch":"5.9","sizeMm":"AB","weight":82,"image":"images/GOD-FRAME-SAMPLE.jpg"}
        ]
      }
    }
  };

  /* ============================================================
     DOM
     ============================================================ */
  function $id(id) { return document.getElementById(id); }

  var partyInput      = $id('partySearchInput');
  var partyHidden     = $id('partyName');
  var partyList       = $id('partyList');
  var partyClearBtn   = $id('partyClearBtn');
  var partyHelp       = $id('partyHelp');
  var addressInput    = $id('address');
  var cellInput       = $id('cellNo');
  var partySearchWrap = $id('partySearchWrap');

  var partyStep       = $id('partyStep');
  var orderStep       = $id('orderStep');
  var nextBtn         = $id('nextBtn');
  var backBtn         = $id('backBtn');
  var previewBtn      = $id('previewBtn');

  var orderDateInput    = $id('orderDate');
  var deliveryDateInput = $id('deliveryDate');
  var estimateNoInput   = $id('estimateNo');
  var groupSelect       = $id('productGroup');
  var touchSelect       = $id('touch');
  var noteInput         = $id('note');

  var artNoInput   = $id('artNo');
  var artList      = $id('artList');
  var qtyInput     = $id('orderQty');
  var addItemBtn   = $id('addItemBtn');
  var clearItemBtn = $id('clearItemBtn');
  var itemImageEl  = $id('itemImage');
  var imageMissing = $id('imageMissing');
  var previewBox   = $id('productPreview');
  var itemNameEl   = $id('itemName');
  var itemGroupEl  = $id('itemGroup');
  var itemInchEl   = $id('itemInch');
  var itemMmEl     = $id('itemMm');
  var itemWeightEl = $id('itemWeight');
  var itemTotalEl  = $id('itemTotalWeight');

  var orderBody     = $id('orderBody');
  var totalQtyEl    = $id('totalQty');
  var totalWeightEl = $id('totalWeight');

  var previewModal     = $id('previewModal');
  var previewContent   = $id('previewContent');
  var closePreview     = $id('closePreview');
  var editPreviewBtn   = $id('editPreviewBtn');
  var downloadPdfBtn   = $id('downloadPdfBtn');
  var downloadExcelBtn = $id('downloadExcelBtn');
  var saveEstimationBtn= $id('saveEstimationBtn');
  var newEstimationBtn = $id('newEstimationBtn');
  var submitStatus     = $id('submitStatus');

  var estimationsModal  = $id('estimationsModal');
  var closeEstimations  = $id('closeEstimations');
  var estimationsList   = $id('estimationsList');
  var estimationsTopBtn = $id('estimationsTopBtn');

  var estimationDetailModal   = $id('estimationDetailModal');
  var closeEstimationDetail   = $id('closeEstimationDetail');
  var estimationDetailContent = $id('estimationDetailContent');
  var estimationPdfBtn        = $id('estimationPdfBtn');
  var estimationExcelBtn      = $id('estimationExcelBtn');
  var newEstimationDetailBtn  = $id('newEstimationDetailBtn');
  var estimationDetailStatus  = $id('estimationDetailStatus');
  var backToEstListBtn        = $id('backToEstListBtn');
  var detailWorkshopSelect    = $id('detailWorkshopSelect');
  var detailForwardBtn        = $id('detailForwardBtn');
  var estimationForwardBar    = $id('estimationForwardBar');

  /* Split UI */
  var detailSplitCount       = $id('detailSplitCount');
  var splitConfigPanel       = $id('splitConfigPanel');
  var splitPartsWrap         = $id('splitPartsWrap');
  var splitValidationMsg     = $id('splitValidationMsg');
  var splitConfigHint        = $id('splitConfigHint');
  var splitAutoByQtyBtn      = $id('splitAutoByQtyBtn');
  var splitAutoByArtBtn      = $id('splitAutoByArtBtn');
  var splitAutoByNameBtn     = $id('splitAutoByNameBtn');
  var splitResetBtn          = $id('splitResetBtn');

  var pendingTopBtn = $id('pendingTopBtn');
  var pendingModal  = $id('pendingModal');
  var closePending  = $id('closePending');
  var pendingList   = $id('pendingList');

  var newEstimationTopBtn = $id('newEstimationTopBtn');

  var receivedTopBtnEl      = $id('receivedTopBtn');
  var receivedStockDot      = $id('receivedStockDot');
  var receivedModal         = $id('receivedModal');
  var closeReceivedBtn      = $id('closeReceived');
  var receivedList          = $id('receivedList');
  var receivedCountLabel    = $id('receivedCountLabel');
  var receivedPrintBtn      = $id('receivedPrintBtn');
  var receivedExcelBtn      = $id('receivedExcelBtn');
  var receivedDetailModal   = $id('receivedDetailModal');
  var closeReceivedDetail   = $id('closeReceivedDetail');
  var receivedDetailContent = $id('receivedDetailContent');
  var receivedDetailPdfBtn  = $id('receivedDetailPdfBtn');
  var receivedDetailExcelBtn= $id('receivedDetailExcelBtn');
  var backToReceivedBtn     = $id('backToReceivedBtn');
  var activeReceived        = null;

  /* ============================================================
     RECEIVED ORDERS — indicator / render / detail
     ============================================================ */
  function refreshReceivedIndicator() {
    if (!receivedStockDot || !receivedTopBtnEl) return;
    var seen = getSeenReceivedIds();
    var received = getReceivedOrders();

    var unseen = received.filter(function (r) {
      return seen.indexOf(r.order.id) === -1;
    });

    if (unseen.length > 0) {
      receivedStockDot.textContent = unseen.length > 99 ? '99+' : String(unseen.length);
      receivedStockDot.classList.remove('hidden');
    } else {
      receivedStockDot.classList.add('hidden');
    }

    if (received.length > 0) {
      receivedTopBtnEl.classList.add('has-new-stock');
      receivedTopBtnEl.setAttribute('title',
        received.length + ' order(s) awaiting Jama completion in Post Production');
    } else {
      receivedTopBtnEl.classList.remove('has-new-stock');
      receivedTopBtnEl.removeAttribute('title');
    }
  }

  function markReceivedAsSeen() {
    var seen = getSeenReceivedIds();
    var changed = false;
    getReceivedOrders().forEach(function (r) {
      if (seen.indexOf(r.order.id) === -1) { seen.push(r.order.id); changed = true; }
    });
    if (changed) saveSeenReceivedIds(seen);
    refreshReceivedIndicator();
  }

  function renderReceivedOrders() {
    if (!receivedList) return;
    var received = getReceivedOrders();

    if (receivedCountLabel) {
      receivedCountLabel.innerHTML = received.length + ' received order(s) awaiting Jama';
    }

    if (!received.length) {
      receivedList.innerHTML =
        '<div class="empty-list">No received orders awaiting Jama. ' +
        'Orders appear here after a branch clicks <b>Send Ready Stock to HO</b>, ' +
        'and disappear once their Jama is completed in <b>Post Production → Stage-2</b>.</div>';
      return;
    }

    var byBranch = {};
    received.forEach(function (r) {
      var b = r.order.workshop || 'UNKNOWN';
      if (!byBranch[b]) byBranch[b] = [];
      byBranch[b].push(r);
    });
    var branches = Object.keys(byBranch).sort();

    var html = '';
    branches.forEach(function (branch) {
      var list = byBranch[branch];
      var totQty = list.reduce(function (s, r) { return s + Number(r.sentQty || 0); }, 0);
      var totWt  = list.reduce(function (s, r) { return s + Number(r.sentWt || 0); }, 0);
      var branchAwaiting = list.filter(function (r) { return !r.jamaDone; }).length;

      html += '<div class="branch-section">'
           +    '<h3>' + escapeHtml(branch)
           +      ' <span class="bs-stats">'
           +        '<span><b>' + list.length + '</b> orders</span>'
           +        '<span><b>' + formatNumber(totQty) + '</b> pcs</span>'
           +        '<span><b>' + formatNumber2(totWt) + '</b> g</span>'
           +        (branchAwaiting
                      ? '<span class="bs-jama"><b>' + branchAwaiting + '</b> awaiting Jama</span>'
                      : '')
           +      '</span>'
           +    '</h3>'
           +    '<div class="list-table"><table><thead><tr>'
           +      '<th>ORDER NO.</th><th>EST. NO.</th><th>GROUP</th>'
           +      '<th>ORDER QTY</th><th>SENT QTY</th>'
           +      '<th>ORDER WT</th><th>SENT WT</th>'
           +      '<th>RECEIVED</th><th>JAMA</th><th>ACTION</th>'
           +    '</tr></thead><tbody>';

      list.forEach(function (r) {
        var o = r.order;
        var info = r.info;
        var tl = getStageTimeline(o.id);
        var recvIso = info.completedAt || tl.HO || o.forwardedAt || o.createdAt;
        var qtyDiff = Number(r.sentQty) - Number(o.totalQty || 0);
        var wtDiff  = Number(r.sentWt)  - Number(o.totalWeight || 0);
        var qtyCls  = qtyDiff === 0 ? 'diff-same' : (qtyDiff > 0 ? 'diff-up' : 'diff-down');
        var wtCls   = Math.abs(wtDiff) < 0.01 ? 'diff-same' : (wtDiff > 0 ? 'diff-up' : 'diff-down');

        var jamaCell = r.jamaDone
          ? '<span class="rcv-jama-badge done"><i class="fas fa-check-circle"></i> Done</span>'
          : '<span class="rcv-jama-badge awaiting"><i class="fas fa-hourglass-half"></i> Awaiting</span>';

        var status = computeReceivedStatusBadge(o, r.sentQty);

        var partChip = '';
        if (o.partInfo) {
          partChip = o.partInfo.isOriginal
            ? '<span class="part-chip part-original">ORIG</span>'
            : '<span class="part-chip">P' + o.partInfo.part + '/' + o.partInfo.of + '</span>';
        }

        var rowCls = 'clickable-row' + (r.jamaDone ? '' : ' rcv-awaiting-jama');

        html += '<tr class="' + rowCls + '" data-rid="' + escapeAttr(o.id) + '">'
             +    '<td><b>' + escapeHtml(o.orderNo || '—') + '</b> ' + status.badgeHtml + partChip + '</td>'
             +    '<td>' + escapeHtml(o.estimateNo || '—') + '</td>'
             +    '<td>' + escapeHtml(o.productGroup || '—') + '</td>'
             +    '<td>' + formatNumber(o.totalQty) + '</td>'
             +    '<td class="' + qtyCls + '"><b>' + formatNumber(r.sentQty) + '</b></td>'
             +    '<td>' + formatNumber2(o.totalWeight) + '</td>'
             +    '<td class="' + wtCls + '"><b>' + formatNumber2(r.sentWt) + '</b></td>'
             +    '<td>' + (recvIso ? formatDate(String(recvIso).slice(0, 10)) : '—') + '</td>'
             +    '<td>' + jamaCell + '</td>'
             +    '<td><button type="button" class="link-button" data-view-rid="' + escapeAttr(o.id) + '">OPEN</button></td>'
             +  '</tr>';
      });

      html += '</tbody></table></div></div>';
    });

    receivedList.innerHTML = html;

    receivedList.querySelectorAll('[data-rid]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.tagName === 'BUTTON') return;
        openReceivedDetail(tr.dataset.rid);
      });
    });
    receivedList.querySelectorAll('[data-view-rid]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        openReceivedDetail(b.dataset.viewRid);
      });
    });
  }

  function openReceivedOrdersModal() {
    renderReceivedOrders();
    markReceivedAsSeen();
    receivedModal.classList.remove('hidden');
  }

  function openReceivedDetail(orderId) {
    var all = getReceivedOrders();
    var rec = all.find(function (r) { return r.order.id === orderId; });
    if (!rec) { alert('Order not found.'); return; }
    activeReceived = rec;
    var o = rec.order, info = rec.info;
    var tl = getStageTimeline(o.id);
    var j = jamaInfo(info, o.id);

    var status = computeReceivedStatusBadge(o, rec.sentQty);

    var html = '<h2 class="preview-title">RECEIVED ORDER — ' + escapeHtml(o.orderNo || '—')
             + ' ' + status.badgeHtml + '</h2>';
    html += '<div class="preview-meta">'
         +    '<div><span>BRANCH / WORKSHOP</span><b>' + escapeHtml(o.workshop || '—') + '</b></div>'
         +    '<div><span>ESTIMATION NO.</span><b>' + escapeHtml(o.estimateNo || '—') + '</b></div>'
         +    '<div><span>PRODUCT GROUP</span><b>' + escapeHtml(o.productGroup || '—') + '</b></div>'
         +    '<div><span>TOUCH</span><b>' + escapeHtml(o.touch || '—') + '</b></div>'
         +    '<div><span>ORDER DATE</span><b>' + formatDate(o.orderDate) + '</b></div>'
         +    '<div><span>DELIVERY</span><b>' + formatDate(o.deliveryDate) + '</b></div>'
         +    '<div><span>ORDER QTY</span><b>' + formatNumber(o.totalQty) + '</b></div>'
         +    '<div><span>ORDER WEIGHT</span><b>' + formatNumber2(o.totalWeight) + ' g</b></div>'
         +    '<div><span>SENT QTY</span><b style="color:#8c004c">' + formatNumber(rec.sentQty) + '</b></div>'
         +    '<div><span>SENT WEIGHT</span><b style="color:#8c004c">' + formatNumber2(rec.sentWt) + ' g</b></div>'
         +  '</div>';

    html += '<div class="preview-party">'
         +    '<div><span>RECEIVED AT</span><b>' + (info.completedAt ? formatDate(String(info.completedAt).slice(0,10)) + ' ' + new Date(info.completedAt).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}) : '—') + '</b></div>'
         +    '<div><span>NOTE</span><b>' + escapeHtml(o.note || '—') + '</b></div>'
         +  '</div>';

    html += '<div class="table-wrap"><table class="preview-table"><thead><tr>'
         +    '<th>SL</th><th>ART NO.</th><th>NAME</th><th>SIZE</th>'
         +    '<th>ORDER QTY</th><th>SENT QTY</th>'
         +    '<th>WEIGHT (g)</th><th>SENT TOTAL (g)</th><th>IMAGE</th>'
         +  '</tr></thead><tbody>';

    rec.merged.forEach(function (x, i) {
      var imgHtml = '—';
      if (x.image) {
        var fallbacks = getImageFallbackList(x.image);
        imgHtml = '<img src="' + escapeAttr(fallbacks[0]) + '" class="preview-product-image" '
                + 'onerror="if(!this.dataset.fbIdx){this.dataset.fbIdx=1;} '
                + 'var list=' + escapeAttr(JSON.stringify(fallbacks)) + '; '
                + 'if(this.dataset.fbIdx<list.length){this.src=list[this.dataset.fbIdx++];} '
                + 'else{this.style.display=\'none\';}">';
      }
      var qtyDiff = Number(x.sentQty) - Number(x.orderQty);
      var qtyCls  = qtyDiff === 0 ? 'diff-same' : (qtyDiff > 0 ? 'diff-up' : 'diff-down');
      html += '<tr>'
           +    '<td>' + (i + 1) + '</td>'
           +    '<td>' + escapeHtml(x.artNo) + '</td>'
           +    '<td>' + escapeHtml(x.name) + '</td>'
           +    '<td>' + escapeHtml(x.heightInch || '—') + '</td>'
           +    '<td>' + formatNumber(x.orderQty) + '</td>'
           +    '<td class="' + qtyCls + '"><b>' + formatNumber(x.sentQty) + '</b></td>'
           +    '<td>' + formatNumber2(x.weight) + '</td>'
           +    '<td><b>' + formatNumber2(x.sentTotal) + '</b></td>'
           +    '<td>' + imgHtml + '</td>'
           +  '</tr>';
    });

    html += '</tbody><tfoot>'
         +    '<tr class="preview-total">'
         +      '<td colspan="4" class="total-label">ORDER TOTAL</td>'
         +      '<td>' + formatNumber(o.totalQty) + '</td>'
         +      '<td></td>'
         +      '<td></td>'
         +      '<td>' + formatNumber2(o.totalWeight) + '</td>'
         +      '<td></td>'
         +    '</tr>'
         +    '<tr class="preview-total" style="background:#e0c7c7">'
         +      '<td colspan="4" class="total-label">DISPATCHED TOTAL</td>'
         +      '<td></td>'
         +      '<td>' + formatNumber(rec.sentQty) + '</td>'
         +      '<td></td>'
         +      '<td>' + formatNumber2(rec.sentWt) + '</td>'
         +      '<td></td>'
         +    '</tr>'
         +  '</tfoot></table></div>';

    var trackRows = [
      ['Order Received', tl.NEW],
      ['Wax Section', tl.WAX],
      ['Casting Section', tl.CASTING],
      ['Filing Section', tl.FILING],
      ['Sent to HO', tl.HO]
    ];
    html += '<h3 style="color:#8c004c;font-size:14px;margin:18px 0 8px">ORDER TRACKING</h3>'
         +  '<table class="track-table"><thead><tr><th>STAGE</th><th>DATE &amp; TIME</th></tr></thead><tbody>';
    trackRows.forEach(function (r) {
      html += '<tr><td><b>' + r[0] + '</b></td>'
           +  (r[1] ? '<td class="date">' + new Date(r[1]).toLocaleString('en-IN') + '</td>'
                   : '<td class="pending">Pending</td>')
           +  '</tr>';
    });
    html += '</tbody></table>';

    if (j.done) {
      html += '<div class="jama-confirmed-banner">'
           +    '<i class="fas fa-check-circle"></i>'
           +    '<div><b>Jama completed</b>'
           +    (j.at ? ' on ' + new Date(j.at).toLocaleString('en-IN') : '')
           +    (j.by ? ' by ' + escapeHtml(j.by) : '')
           +    '</div>'
           +  '</div>';
    } else {
      html += '<div class="jama-confirmed-banner awaiting">'
           +    '<i class="fas fa-hourglass-half"></i>'
           +    '<div><b>Awaiting Jama completion</b> in Post Production</div>'
           +  '</div>';
    }

    receivedDetailContent.innerHTML = html;
    receivedDetailModal.classList.remove('hidden');

    if (window.__receivedDetailTimer) clearInterval(window.__receivedDetailTimer);
    window.__receivedDetailTimer = setInterval(function () {
      if (!receivedDetailModal || receivedDetailModal.classList.contains('hidden')) {
        clearInterval(window.__receivedDetailTimer);
        window.__receivedDetailTimer = null;
        return;
      }
      var fresh = getReceivedOrders().find(function (r) { return r.order.id === orderId; });
      if (!fresh) return;
      if (!!fresh.jamaDone !== !!rec.jamaDone) {
        openReceivedDetail(orderId);
      }
    }, 4000);
  }

  /* ============================================================
     RECEIVED ORDERS — wiring
     ============================================================ */
  if (receivedTopBtnEl) receivedTopBtnEl.addEventListener('click', openReceivedOrdersModal);
  if (closeReceivedBtn) closeReceivedBtn.addEventListener('click', function () {
    receivedModal.classList.add('hidden');
  });
  if (closeReceivedDetail) closeReceivedDetail.addEventListener('click', function () {
    receivedDetailModal.classList.add('hidden');
  });
  if (backToReceivedBtn) backToReceivedBtn.addEventListener('click', function () {
    receivedDetailModal.classList.add('hidden');
    openReceivedOrdersModal();
  });
  if (receivedPrintBtn) receivedPrintBtn.addEventListener('click', function () { window.print(); });
  if (receivedExcelBtn) receivedExcelBtn.addEventListener('click', exportReceivedExcel);
  if (receivedDetailPdfBtn) receivedDetailPdfBtn.addEventListener('click', function () {
    if (activeReceived) downloadOrderPDF(activeReceived.order);
  });
  if (receivedDetailExcelBtn) receivedDetailExcelBtn.addEventListener('click', function () {
    if (activeReceived) downloadOrderExcel(activeReceived.order);
  });

  /* ============================================================
     RECEIVED ORDERS — Excel export
     ============================================================ */
  async function exportReceivedExcel() {
    var list = getReceivedOrders();
    if (!list.length) { alert('No received orders to export.'); return; }
    if (!window.ExcelJS) { alert('Excel library not loaded.'); return; }

    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('Received Orders');
    var COLS = [
      { label:'BRANCH', width:16 }, { label:'ORDER NO.', width:16 },
      { label:'STATUS', width:18 },
      { label:'EST. NO.', width:12 }, { label:'GROUP', width:18 },
      { label:'TOUCH', width:10 }, { label:'ORDER DATE', width:12 },
      { label:'ORDER QTY', width:11 }, { label:'SENT QTY', width:11 },
      { label:'ORDER WT (g)', width:14 }, { label:'SENT WT (g)', width:14 },
      { label:'RECEIVED AT', width:18 }
    ];
    ws.columns = COLS.map(function (c) { return { header: c.label, width: c.width }; });
    ws.mergeCells('A1:L1');
    ws.getCell('A1').value = 'GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD — RECEIVED ORDERS';
    ws.getCell('A1').font = { bold:true, size:15, color:{argb:'FF8C004C'} };
    ws.getCell('A1').alignment = { horizontal:'center', vertical:'middle' };
    ws.getRow(1).height = 26;
    ws.addRow([]);

    var headerRow = ws.addRow(COLS.map(function (c) { return c.label; }));
    headerRow.font = { bold:true, color:{argb:'FFFFFFFF'} };
    headerRow.eachCell(function (c) {
      c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF8C004C'} };
      c.alignment = { horizontal:'center', vertical:'middle' };
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
    });

    var totOQ = 0, totSQ = 0, totOW = 0, totSW = 0;
    list.forEach(function (r) {
      var o = r.order, info = r.info;
      totOQ += Number(o.totalQty || 0);
      totSQ += Number(r.sentQty || 0);
      totOW += Number(o.totalWeight || 0);
      totSW += Number(r.sentWt || 0);
      var recv = info.completedAt ? new Date(info.completedAt).toLocaleString('en-IN') : '—';
      var status = computeReceivedStatusBadge(o, r.sentQty);
      var statusText = status.isFull ? 'RECEIVED' : 'PARTIALLY RECEIVED';
      var row = ws.addRow([
        o.workshop || '—', o.orderNo || '—', statusText,
        o.estimateNo || '—', o.productGroup || '—', o.touch || '—', formatDate(o.orderDate),
        Number(o.totalQty || 0), Number(r.sentQty || 0),
        Number(o.totalWeight || 0), Number(r.sentWt || 0), recv
      ]);
      row.eachCell(function (c) {
        c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        c.alignment = { horizontal:'center', vertical:'middle' };
      });
      var statusCell = row.getCell(3);
      if (status.isFull) {
        statusCell.font = { bold:true, color:{argb:'FF137333'} };
        statusCell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFE8F5E9'} };
      } else {
        statusCell.font = { bold:true, color:{argb:'FFB26A00'} };
        statusCell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF3E0'} };
      }
    });

    var totalRow = ws.addRow(['','','','','','','TOTAL',
      totOQ, totSQ, totOW, totSW, '']);
    totalRow.font = { bold:true };
    totalRow.eachCell(function (c) {
      c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFE0C7C7'} };
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      c.alignment = { horizontal:'center', vertical:'middle' };
    });

    var buf = await wb.xlsx.writeBuffer();
    var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'Received_Orders_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* Initial indicator refresh + live updates (after shared data has loaded) */
  gpOrderSharedReady.then(function () { refreshReceivedIndicator(); });
  setInterval(function () { if (GP_ORDER_SHARED.ready) refreshReceivedIndicator(); }, 5000);
  window.addEventListener('storage', function (e) {
    if (!e.key) return;
    if (e.key === COMPLETED_KEY ||
        e.key === ORDERS_KEY ||
        e.key === STAGES_KEY ||
        e.key === 'gp_completed_bump' ||
        e.key === STAGE2_ORDERS_KEY ||
        e.key === 'goldprince_stage2_history_v1') {
      refreshReceivedIndicator();
      if (receivedModal && !receivedModal.classList.contains('hidden')) {
        renderReceivedOrders();
      }
      if (pendingModal && !pendingModal.classList.contains('hidden')) {
        renderPendingOrders();
      }
    }
    /* Live-refresh catalogue whenever the editor saves */
    if (e.key === CATALOGUE_KEY ||
        e.key === CATALOGUE_UPDATES_KEY ||
        CATALOGUE_EXTRA_KEYS.indexOf(e.key) !== -1) {
      try { loadProductCatalog(); } catch (err) { console.warn('[order-form.js] live catalogue reload failed', err); }
    }
  });
  window.addEventListener('gp:completedmap-changed', function () {
    refreshReceivedIndicator();
    if (receivedModal && !receivedModal.classList.contains('hidden')) {
      renderReceivedOrders();
    }
  });

  window.addEventListener('gp:shared-data-changed', function (event) {
    var key = event && event.detail ? event.detail.key : '';
    if (key === ORDERS_KEY || key === ESTIMATIONS_KEY || key === COMPLETED_KEY ||
        key === STAGES_KEY || key === STAGE2_ORDERS_KEY || key === SENDS_KEY) {
      refreshReceivedIndicator();
      if (receivedModal && !receivedModal.classList.contains('hidden')) renderReceivedOrders();
      if (pendingModal && !pendingModal.classList.contains('hidden')) renderPendingOrders();
      if (estimationsModal && !estimationsModal.classList.contains('hidden')) renderEstimations();
    }
    if (key === CATALOGUE_KEY || key === CATALOGUE_UPDATES_KEY || CATALOGUE_EXTRA_KEYS.indexOf(key) !== -1) {
      try { loadProductCatalog(); } catch (err) { console.warn('[order-form.js] shared catalogue reload failed', err); }
    }
    if (key === PARTIES_KEY || key === PARTIES_LEGACY_KEY) {
      try { renderPartyList(''); } catch (err) { console.warn('[order-form.js] shared party reload failed', err); }
    }
  });

  /* ============================================================
     STATE
     ============================================================ */
  var parties = {};
  var productCatalog        = {};
  var productCatalogByGroup = {};
  var productCatalogGlobal  = {};
  var currentGroupFilter    = '3D IDOLS';
  var items = [];
  var currentEstimateNo = '';
  var pendingPreviewOrder = null;
  var activeEstimation = null;
  var activePartyIndex = -1;

  var splitParts = [];
  var splitPartWorkshops = [];

  /* ============================================================
     PARTY SELECT
     ============================================================ */
  function loadParties() {
    var a = _readJSON(PARTIES_KEY, {}) || {};
    var b = _readJSON(PARTIES_LEGACY_KEY, {}) || {};
    var merged = {};
    Object.keys(b).forEach(function (k) { if (k) merged[k] = b[k]; });
    Object.keys(a).forEach(function (k) { if (k) merged[k] = a[k]; });
    return merged;
  }
  function normParty(p) {
    p = p || {};
    return {
      address: p.address || p.Address || '',
      cell:    p.cell || p.cellNo || p.mobile || p.phone || '',
      phone:   p.phone || p.landline || '',
      city:    p.city || ''
    };
  }

  function renderPartyList(filter) {
    if (!partyList) return;
    var q = String(filter || '').trim().toLowerCase();
    parties = loadParties();
    
    var names = Object.keys(parties).filter(Boolean).sort(function (a, b) { return a.localeCompare(b); });
    
    // If no parties exist in storage at all
    if (names.length === 0) {
       partyList.innerHTML = '<div class="searchable-empty"><i class="fas fa-exclamation-triangle"></i> No parties found in Master. Please add parties in the Party Master screen.</div>';
       partyList.classList.add('show');
       return;
    }

    var filtered = q
      ? names.filter(function (n) {
          var p = normParty(parties[n]);
          return n.toLowerCase().indexOf(q) !== -1
              || String(p.cell || '').toLowerCase().indexOf(q) !== -1
              || String(p.city || '').toLowerCase().indexOf(q) !== -1;
        })
      : names;

    if (!filtered.length) {
      partyList.innerHTML = '<div class="searchable-empty"><i class="fas fa-search"></i> No matching parties. Try a different name.</div>';
      partyList.classList.add('show');
      return;
    }

    partyList.innerHTML = filtered.map(function (n, i) {
      var p = normParty(parties[n]);
      var meta = [p.cell, p.city].filter(Boolean).join(' · ');
      return '<div class="searchable-option" data-name="' + escapeAttr(n) + '" data-index="' + i + '">'
           +   '<i class="fa-user fas"></i>'
           +   '<span class="opt-main">' + escapeHtml(n) + '</span>'
           +   (meta ? '<span class="opt-meta">' + escapeHtml(meta) + '</span>' : '')
           + '</div>';
    }).join('');
    
    partyList.classList.add('show');
    activePartyIndex = -1;
    
    // Use mousedown to prevent the input from blurring and hiding the list before the click registers
    partyList.querySelectorAll('.searchable-option').forEach(function (opt) {
      opt.addEventListener('mousedown', function (e) { 
        e.preventDefault(); 
        selectParty(opt.dataset.name); 
      });
    });
  }

  function selectParty(name) {
    if (!name) return;
    var p = normParty(parties[name] || {});
    partyInput.value = name;
    partyHidden.value = name;
    addressInput.value = p.address || '';
    cellInput.value = p.cell || p.phone || '';
    partyList.classList.remove('show');
    if (partyHelp) partyHelp.textContent = 'Selected: ' + name;
  }

  function clearParty() {
    partyInput.value = '';
    partyHidden.value = '';
    addressInput.value = '';
    cellInput.value = '';
    partyList.classList.remove('show');
    if (partyHelp) partyHelp.textContent = 'Start typing to filter party names.';
    partyInput.focus();
  }

  function highlightPartyOption(opts) {
    opts.forEach(function (o, i) { o.classList.toggle('highlight', i === activePartyIndex); });
  }

  // Wiring up the inputs
  if (partyInput) {
    // Show on focus
    partyInput.addEventListener('focus', function () { renderPartyList(partyInput.value); });
    // Filter on type
    partyInput.addEventListener('input', function () { renderPartyList(partyInput.value); });
    
    // Keyboard navigation
    partyInput.addEventListener('keydown', function (e) {
      var opts = partyList.querySelectorAll('.searchable-option');
      if (!opts.length) return;

      if (e.key === 'ArrowDown') { 
        e.preventDefault(); 
        activePartyIndex = Math.min(activePartyIndex + 1, opts.length - 1); 
        highlightPartyOption(opts); 
      }
      else if (e.key === 'ArrowUp') { 
        e.preventDefault(); 
        activePartyIndex = Math.max(activePartyIndex - 1, 0); 
        highlightPartyOption(opts); 
      }
      else if (e.key === 'Enter') { 
        if (activePartyIndex >= 0 && opts[activePartyIndex]) { 
          e.preventDefault(); 
          selectParty(opts[activePartyIndex].dataset.name); 
        } 
      }
      else if (e.key === 'Escape') { 
        partyList.classList.remove('show'); 
      }
    });

    // Hide when clicking outside
    partyInput.addEventListener('blur', function () { 
      setTimeout(function () { partyList.classList.remove('show'); }, 150); 
    });
  }

  if (partyClearBtn) {
    partyClearBtn.addEventListener('click', function(e) {
      e.preventDefault();
      clearParty();
    });
  }

  // Hide when clicking anywhere else on the document
  document.addEventListener('click', function (e) {
    if (partySearchWrap && !partySearchWrap.contains(e.target)) {
      partyList.classList.remove('show');
    }
  });

  /* ============================================================
     CATALOGUE
     ============================================================ */
  function flattenCatalogue(raw) {
    var flat = {}, byGroup = {}, global = {};
    if (!raw || typeof raw !== 'object') return { flat: flat, byGroup: byGroup, global: global };

    Object.keys(raw).forEach(function (groupKey) {
      var groupEntry = raw[groupKey];
      if (!groupEntry || typeof groupEntry !== 'object') return;
      var sheets = groupEntry.sheets || groupEntry;
      var group = String(groupKey).toUpperCase();

      Object.keys(sheets).forEach(function (sheetName) {
        var arr = sheets[sheetName];
        if (!Array.isArray(arr)) return;
        arr.forEach(function (p) {
          if (!p) return;
          var artNo = String(p.artNo || '').trim();
          if (!artNo) return;
          var norm = {
            artNo: artNo,
            name: p.name || artNo,
            group: group,
            sheet: sheetName,
            heightInch: p.heightInch || '',
            sizeMm: p.sizeMm || '',
            weight: Number(p.weight || 0),
            image: p.image || ''
          };
          flat[artNo + '::' + group] = norm;
          (byGroup[group] = byGroup[group] || []).push(artNo);
          (global[artNo] = global[artNo] || []).push(norm);
        });
      });
    });

    return { flat: flat, byGroup: byGroup, global: global };
  }

  /* Normalise a group entry from the editor (sheetImages → item image) */
  function normaliseEditorGroup(grp) {
    if (!grp || typeof grp !== 'object') return grp;
    if (grp.sheetImages && grp.sheets) {
      Object.keys(grp.sheetImages).forEach(function (sheetName) {
        var img = grp.sheetImages[sheetName];
        if (!img) return;
        (grp.sheets[sheetName] || []).forEach(function (p) {
          if (!p.image) p.image = img;
        });
      });
    }
    return grp;
  }

  /*
   * Merges every catalogue source into one object, with priority:
   *   1. goldprince_catalogue_updates_v1  (editor's latest save — highest priority)
   *   2. goldprince_catalogue             (shared snapshot)
   *   3. any group-specific extra keys
   *   4. EMBEDDED_CATALOGUE               (fills in any group still missing)
   */
  function loadProductCatalog() {
    var raw = {};
    var sources = [];

    // --- 1. Shared snapshot ---
    var stored = _readJSON(CATALOGUE_KEY, null);
    if (stored && typeof stored === 'object' && Object.keys(stored).length) {
      Object.keys(stored).forEach(function (g) { raw[g] = stored[g]; });
      sources.push('localStorage:' + CATALOGUE_KEY);
    }

    // --- 2. Editor updates (overwrites stale snapshot) ---
    var updates = _readJSON(CATALOGUE_UPDATES_KEY, null);
    if (updates && typeof updates === 'object' && Object.keys(updates).length) {
      Object.keys(updates).forEach(function (g) {
        var grp = updates[g];
        if (grp && typeof grp === 'object' && (grp.sheets || Array.isArray(grp))) {
          raw[g] = normaliseEditorGroup(grp);
        }
      });
      sources.push('localStorage:' + CATALOGUE_UPDATES_KEY);
    }

    // --- 3. Extra keys (safety net) ---
    CATALOGUE_EXTRA_KEYS.forEach(function (k) {
      var extra = _readJSON(k, null);
      if (!extra || typeof extra !== 'object' || !Object.keys(extra).length) return;
      var keys = Object.keys(extra);
      var wrapped = keys.some(function (kk) {
        var v = extra[kk];
        return v && typeof v === 'object' && (v.sheets || Array.isArray(v));
      });
      if (wrapped) {
        keys.forEach(function (g) {
          if (!raw[g]) raw[g] = extra[g];
        });
      } else if (extra.sheets) {
        var derived = k.toUpperCase().replace('GOLDPRINCE_CATALOGUE_', '').replace(/_/g, ' ');
        if (!raw[derived]) raw[derived] = extra;
      }
      sources.push('localStorage:' + k);
    });

    // --- 4. Embedded fallback ---
    Object.keys(EMBEDDED_CATALOGUE).forEach(function (g) {
      if (!raw[g] || !raw[g].sheets || !Object.keys(raw[g].sheets).length) {
        raw[g] = EMBEDDED_CATALOGUE[g];
      }
    });
    sources.push('embedded-overlay');

    var parsed = flattenCatalogue(raw);
    productCatalog        = parsed.flat;
    productCatalogByGroup = parsed.byGroup;
    productCatalogGlobal  = parsed.global;
    rebuildArtDatalist();
    console.log('[order-form.js] catalogue loaded from ' + sources.join(', ') +
                ' — ' + Object.keys(productCatalog).length + ' art number(s) across ' +
                Object.keys(productCatalogByGroup).join(', '));
  }

  function rebuildArtDatalist() {
    if (!artList) return;
    var arts = (productCatalogByGroup[currentGroupFilter] || []).slice();
    var seen = {};
    arts = arts.filter(function (a) { if (seen[a]) return false; seen[a] = true; return true; });
    arts.sort(function (a, b) {
      var na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    artList.innerHTML = arts.map(function (a) {
      var p = productCatalog[a + '::' + currentGroupFilter];
      var label = p ? (a + ' — ' + p.name + (p.heightInch ? ' (' + p.heightInch + '")' : '')) : a;
      return '<option value="' + escapeAttr(a) + '" label="' + escapeAttr(label) + '"></option>';
    }).join('');
  }

  /* Fallback priority when the same artNo exists in multiple groups */
  var PRODUCT_FALLBACK_ORDER = ['JEWELLERY', 'GOD FRAMES', '3D PREMIUM IDOLS', '3D IDOLS', '2D IDOLS'];

  function getProduct(artNo) {
    if (!artNo) return null;
    var key = String(artNo).trim();

    // Exact group match first
    var hit = productCatalog[key + '::' + currentGroupFilter];
    if (hit) return hit;

    // Then look across all groups, ranked by PRODUCT_FALLBACK_ORDER
    var candidates = productCatalogGlobal[key];
    if (candidates && candidates.length) {
      candidates.sort(function (a, b) {
        var ia = PRODUCT_FALLBACK_ORDER.indexOf(a.group);
        var ib = PRODUCT_FALLBACK_ORDER.indexOf(b.group);
        if (ia === -1) ia = 99;
        if (ib === -1) ib = 99;
        return ia - ib;
      });
      return candidates[0];
    }

    // Finally, case-insensitive artNo match
    var lower = key.toLowerCase();
    var allKeys = Object.keys(productCatalogGlobal);
    for (var i = 0; i < allKeys.length; i++) {
      if (allKeys[i].toLowerCase() === lower) return productCatalogGlobal[allKeys[i]][0];
    }
    return null;
  }

  function updatePreviewFromArt() {
    var artNo = artNoInput.value.trim();
    var p = getProduct(artNo);
    if (!p) { previewBox.classList.add('hidden'); return; }
    itemNameEl.textContent   = p.name || '—';
    itemGroupEl.textContent  = p.group || '—';
    itemInchEl.textContent   = p.heightInch || '—';
    itemMmEl.textContent     = p.sizeMm || '—';
    itemWeightEl.textContent = p.weight ? formatNumber2(p.weight) + ' g' : '—';
    var qty = Number(qtyInput.value || 0);
    itemTotalEl.textContent  = p.weight && qty ? formatNumber2(p.weight * qty) + ' g' : '—';

    if (p.image) {
      var fallbacks = getImageFallbackList(p.image);
      itemImageEl.src = fallbacks[0];
      itemImageEl.style.display = '';
      itemImageEl.onerror = function () { handleImageError(itemImageEl, fallbacks, 1); };
      imageMissing.style.display = 'none';
    } else {
      itemImageEl.style.display = 'none';
      imageMissing.style.display = 'block';
    }
    previewBox.classList.remove('hidden');
  }

  function autoFocusQtyIfValid() {
    var artNo = artNoInput.value.trim();
    if (!artNo) return;
    if (getProduct(artNo)) {
      updatePreviewFromArt();
      if (document.activeElement !== qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    }
  }

  if (artNoInput) {
    artNoInput.addEventListener('input', updatePreviewFromArt);
    artNoInput.addEventListener('change', function () { updatePreviewFromArt(); autoFocusQtyIfValid(); });
    artNoInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); autoFocusQtyIfValid(); }
    });
  }
  if (qtyInput) qtyInput.addEventListener('input', updatePreviewFromArt);

  if (groupSelect) {
    currentGroupFilter = String(groupSelect.value || '3D IDOLS').toUpperCase();
    groupSelect.addEventListener('change', function () {
      currentGroupFilter = String(groupSelect.value || '').toUpperCase();
      rebuildArtDatalist();
      var artVal = artNoInput.value.trim();
      if (artVal && !productCatalog[artVal + '::' + currentGroupFilter]) {
        artNoInput.value = '';
        previewBox.classList.add('hidden');
      }
    });
  }

  /* ============================================================
     ITEMS TABLE
     ============================================================ */
  function renderItems() {
    if (!orderBody) return;
    if (!items.length) {
      orderBody.innerHTML = '<tr id="emptyRow"><td colspan="9" class="empty">No items added. Enter Art No. and Quantity above.</td></tr>';
      if (totalQtyEl) totalQtyEl.textContent = '0';
      if (totalWeightEl) totalWeightEl.textContent = '0.00';
      return;
    }
    orderBody.innerHTML = items.map(function (it, idx) {
      var imgHtml = '—';
      if (it.image) {
        var fallbacks = getImageFallbackList(it.image);
        imgHtml = '<img src="' + escapeAttr(fallbacks[0]) + '" class="table-product-image" '
                + 'onerror="if(!this.dataset.fbIdx){this.dataset.fbIdx=1;} '
                + 'var list=' + escapeAttr(JSON.stringify(fallbacks)) + '; '
                + 'if(this.dataset.fbIdx<list.length){this.src=list[this.dataset.fbIdx++];} '
                + 'else{this.style.display=\'none\'; this.nextElementSibling.style.display=\'block\';}">'
                + '<span class="image-missing-placeholder" style="display:none;color:#999;font-size:11px">No image</span>';
      } else {
        imgHtml = '<span style="color:#999;font-size:11px">No image</span>';
      }
      return '<tr data-idx="' + idx + '">'
           +   '<td>' + (idx + 1) + '</td>'
           +   '<td>' + escapeHtml(it.artNo) + '</td>'
           +   '<td>' + escapeHtml(it.name) + '</td>'
           +   '<td>' + escapeHtml(it.heightInch || '—') + '</td>'
           +   '<td>' + formatNumber2(it.weight) + '</td>'
           +   '<td>' + formatNumber(it.quantity) + '</td>'
           +   '<td>' + formatNumber2(it.totalWeight) + '</td>'
           +   '<td>' + imgHtml + '</td>'
           +   '<td><button type="button" class="remove-btn" data-remove="' + idx + '">×</button></td>'
           + '</tr>';
    }).join('');
    orderBody.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () { items.splice(Number(btn.dataset.remove), 1); renderItems(); });
    });
    var tq = items.reduce(function (s, x) { return s + Number(x.quantity || 0); }, 0);
    var tw = items.reduce(function (s, x) { return s + Number(x.totalWeight || 0); }, 0);
    if (totalQtyEl) totalQtyEl.textContent = formatNumber(tq);
    if (totalWeightEl) totalWeightEl.textContent = formatNumber2(tw);
  }

  function findExistingItemIndex(artNo, group) {
    var key = String(artNo).trim();
    var grp = String(group || '').toUpperCase();
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].artNo) === key && String(items[i].group || '').toUpperCase() === grp) return i;
    }
    return -1;
  }

  function addItem() {
    var artNo = artNoInput.value.trim();
    var qty = Math.max(0, Math.floor(Number(qtyInput.value) || 0));
    if (!artNo) { alert('Please enter an Art No.'); artNoInput.focus(); return; }
    if (qty <= 0) { alert('Order Quantity must be at least 1.'); qtyInput.focus(); return; }

    var p = getProduct(artNo);
    var groupOfP = p ? p.group : currentGroupFilter;

    var existingIdx = findExistingItemIndex(artNo, groupOfP);
    if (existingIdx >= 0) {
      var existing = items[existingIdx];
      existing.quantity = Number(existing.quantity || 0) + qty;
      existing.totalWeight = Number(existing.weight || 0) * existing.quantity;
      artNoInput.value = ''; qtyInput.value = '1';
      previewBox.classList.add('hidden');
      renderItems();
      artNoInput.focus();
      return;
    }

    if (!p) {
      if (!confirm('Art No. "' + artNo + '" not found in catalogue.\n\nAdd anyway with manual weight?')) return;
      var w = Number(prompt('Enter weight (g):', '0')) || 0;
      items.push({ artNo: artNo, name: artNo, heightInch: '', sizeMm: '', group: currentGroupFilter,
                   sheet: '', weight: w, quantity: qty, totalWeight: w * qty, image: '' });
    } else {
      items.push({
        artNo: artNo, name: p.name, heightInch: p.heightInch, sizeMm: p.sizeMm,
        group: p.group, sheet: p.sheet, weight: p.weight, quantity: qty,
        totalWeight: p.weight * qty, image: p.image
      });
    }
    artNoInput.value = ''; qtyInput.value = '1';
    previewBox.classList.add('hidden');
    renderItems();
    artNoInput.focus();
  }

  if (addItemBtn) addItemBtn.addEventListener('click', addItem);
  if (qtyInput) qtyInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
  });
  if (clearItemBtn) clearItemBtn.addEventListener('click', function () {
    artNoInput.value = ''; qtyInput.value = '1';
    previewBox.classList.add('hidden');
    artNoInput.focus();
  });

  /* ============================================================
     ESTIMATE NUMBER
     ============================================================ */
  function generateEstimateNo() {
    var maxNum = 1000;
    var ests = _readJSON(ESTIMATIONS_KEY, []);
    if (Array.isArray(ests)) {
      ests.forEach(function (e) {
        var m = String(e.estimateNo || '').match(/E-(\d+)/i);
        if (m) maxNum = Math.max(maxNum, Number(m[1]));
      });
    }
    var orders = _readJSON(ORDERS_KEY, []);
    if (Array.isArray(orders)) {
      orders.forEach(function (o) {
        var m = String(o.estimateNo || '').match(/E-(\d+)/i);
        if (m) maxNum = Math.max(maxNum, Number(m[1]));
      });
    }
    return 'E-' + (maxNum + 1);
  }

  if (orderDateInput && !orderDateInput.value) orderDateInput.value = new Date().toISOString().slice(0, 10);
  if (estimateNoInput) { currentEstimateNo = generateEstimateNo(); estimateNoInput.value = currentEstimateNo; }

  /* ============================================================
     STEP NAV
     ============================================================ */
  if (nextBtn) nextBtn.addEventListener('click', function () {
    if (!partyHidden.value.trim()) { alert('Please select a Party Name.'); partyInput.focus(); return; }
    if (!orderDateInput.value) { alert('Please enter Order Date.'); orderDateInput.focus(); return; }
    partyStep.classList.remove('active');
    orderStep.classList.add('active');
    window.scrollTo(0, 0);
    artNoInput.focus();
  });
  if (backBtn) backBtn.addEventListener('click', function () {
    orderStep.classList.remove('active');
    partyStep.classList.add('active');
    window.scrollTo(0, 0);
  });

  /* ============================================================
     BUILD ORDER OBJECT
     ============================================================ */
  function buildOrderObject() {
    var tq = items.reduce(function (s, x) { return s + Number(x.quantity || 0); }, 0);
    var tw = items.reduce(function (s, x) { return s + Number(x.totalWeight || 0); }, 0);
    return {
      id: 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      orderNo: '',
      estimateNo: estimateNoInput.value || currentEstimateNo,
      partyName: partyHidden.value.trim(),
      address: addressInput.value.trim(),
      cellNo: cellInput.value.trim(),
      productGroup: groupSelect.value,
      orderDate: orderDateInput.value,
      deliveryDate: deliveryDateInput.value,
      touch: touchSelect.value,
      note: noteInput.value.trim(),
      items: items.slice(),
      totalQty: tq,
      totalWeight: tw,
      workshop: '',
      createdAt: new Date().toISOString(),
      status: 'estimated',
      confirmed: false,
      forwardedAt: null,
      priority: false
    };
  }

  /* ============================================================
     PREVIEW MODAL
     ============================================================ */
  function renderPreview(order) {
    var html = '<h2 class="preview-title">ORDER PREVIEW</h2>';
    html += '<div class="preview-meta">'
         +    '<div><span>PARTY</span><b>' + escapeHtml(order.partyName) + '</b></div>'
         +    '<div><span>ORDER DATE</span><b>' + formatDate(order.orderDate) + '</b></div>'
         +    '<div><span>DELIVERY</span><b>' + formatDate(order.deliveryDate) + '</b></div>'
         +    '<div><span>ESTIMATION NO.</span><b>' + escapeHtml(order.estimateNo) + '</b></div>'
         +    '<div><span>PRODUCT GROUP</span><b>' + escapeHtml(order.productGroup) + '</b></div>'
         +    '<div><span>TOUCH</span><b>' + escapeHtml(order.touch) + '</b></div>'
         +    '<div><span>TOTAL QTY</span><b>' + formatNumber(order.totalQty) + '</b></div>'
         +    '<div><span>TOTAL WEIGHT</span><b>' + formatNumber2(order.totalWeight) + ' g</b></div>'
         +  '</div>';
    html += '<div class="preview-party">'
         +    '<div><span>ADDRESS</span><b>' + escapeHtml(order.address || '—') + '</b></div>'
         +    '<div><span>CELL NO.</span><b>' + escapeHtml(order.cellNo || '—') + '</b></div>'
         +  '</div>';
    html += '<div class="table-wrap"><table class="preview-table"><thead><tr>'
         +    '<th>SL</th><th>ART NO.</th><th>NAME</th><th>SIZE</th><th>WT(g)</th><th>QTY</th><th>TOTAL WT</th><th>IMAGE</th>'
         +  '</tr></thead><tbody>';
    order.items.forEach(function (it, i) {
      var imgHtml = '—';
      if (it.image) {
        var fallbacks = getImageFallbackList(it.image);
        imgHtml = '<img src="' + escapeAttr(fallbacks[0]) + '" class="preview-product-image" '
                + 'onerror="if(!this.dataset.fbIdx){this.dataset.fbIdx=1;} '
                + 'var list=' + escapeAttr(JSON.stringify(fallbacks)) + '; '
                + 'if(this.dataset.fbIdx<list.length){this.src=list[this.dataset.fbIdx++];} '
                + 'else{this.style.display=\'none\';}">';
      }
      html += '<tr>'
           +   '<td>' + (i + 1) + '</td>'
           +   '<td>' + escapeHtml(it.artNo) + '</td>'
           +   '<td>' + escapeHtml(it.name) + '</td>'
           +   '<td>' + escapeHtml(it.heightInch || '—') + '</td>'
           +   '<td>' + formatNumber2(it.weight) + '</td>'
           +   '<td>' + formatNumber(it.quantity) + '</td>'
           +   '<td>' + formatNumber2(it.totalWeight) + '</td>'
           +   '<td>' + imgHtml + '</td>'
           + '</tr>';
    });
    html += '</tbody><tfoot><tr class="preview-total">'
         +    '<td colspan="5" class="total-label">TOTAL</td>'
         +    '<td>' + formatNumber(order.totalQty) + '</td>'
         +    '<td>' + formatNumber2(order.totalWeight) + '</td><td></td></tr></tfoot></table></div>';
    if (order.note) html += '<p style="margin-top:12px;font-size:12px"><b>Note:</b> ' + escapeHtml(order.note) + '</p>';
    previewContent.innerHTML = html;
  }

  function openPreview() {
    if (!items.length) { alert('Please add at least one item.'); return; }
    pendingPreviewOrder = buildOrderObject();
    renderPreview(pendingPreviewOrder);
    if (submitStatus) submitStatus.textContent = '';
    previewModal.classList.remove('hidden');
  }
  if (previewBtn) previewBtn.addEventListener('click', openPreview);
  if (closePreview) closePreview.addEventListener('click', function () { previewModal.classList.add('hidden'); });
  if (editPreviewBtn) editPreviewBtn.addEventListener('click', function () { previewModal.classList.add('hidden'); });
  if (newEstimationBtn) newEstimationBtn.addEventListener('click', function () {
    previewModal.classList.add('hidden');
    resetFormToStart();
  });

  /* ============================================================
     IMAGE LOADER
     ============================================================ */
  var _IMG_CACHE = {};
  function loadImageData(src) {
    if (!src) return Promise.resolve(null);
    if (_IMG_CACHE[src] !== undefined) return Promise.resolve(_IMG_CACHE[src]);
    if (src.indexOf('data:image/') === 0) {
      var m = src.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!m) { _IMG_CACHE[src] = null; return Promise.resolve(null); }
      var ext0 = (m[1] === 'jpeg' || m[1] === 'jpg') ? 'jpeg' : 'png';
      var r0 = { dataUrl: src, rawBase64: m[2], extension: ext0, format: ext0 === 'png' ? 'PNG' : 'JPEG' };
      _IMG_CACHE[src] = r0; return Promise.resolve(r0);
    }
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      function finish(v, why) {
        if (done) return; done = true;
        if (!v) console.warn('[order-form.js] image load failed:', src, why || '');
        _IMG_CACHE[src] = v; resolve(v);
      }
      var timer = setTimeout(function () { finish(null, 'timeout'); }, 6000);
      img.onload = function () {
        clearTimeout(timer);
        try {
          var w = img.naturalWidth || 100, h = img.naturalHeight || 100;
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
          var dataUrl = c.toDataURL('image/jpeg', 0.85);
          finish({ dataUrl: dataUrl, rawBase64: dataUrl.split(',')[1], extension: 'jpeg', format: 'JPEG' });
        } catch (e) {
          console.warn('[order-form.js] canvas tainted for', src, '— trying raw src as fallback');
          fetch(src).then(function (resp) { return resp.blob(); }).then(function (blob) {
            var reader = new FileReader();
            reader.onload = function () {
              var dataUrl = reader.result;
              var m2 = String(dataUrl).match(/^data:image\/(\w+);base64,(.+)$/);
              if (!m2) { finish(null, 'fetch-blob-format'); return; }
              var ext2 = (m2[1] === 'jpeg' || m2[1] === 'jpg') ? 'jpeg' : 'png';
              finish({ dataUrl: dataUrl, rawBase64: m2[2], extension: ext2, format: ext2 === 'png' ? 'PNG' : 'JPEG' });
            };
            reader.onerror = function () { finish(null, 'filereader'); };
            reader.readAsDataURL(blob);
          }).catch(function (e2) { finish(null, 'fetch:' + e2.message); });
        }
      };
      img.onerror = function () { clearTimeout(timer); finish(null, 'img.onerror'); };
      img.src = src;
    });
  }

  /* ============================================================
     PDF
     ============================================================ */
  async function downloadOrderPDF(order) {
    if (!order) return;
    if (!window.jspdf) { alert('PDF library not loaded.'); return; }
    try {
      var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFontSize(16); doc.setTextColor(140, 0, 76);
      doc.text('GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD', 14, 15);
      doc.setTextColor(0, 0, 0); doc.setFontSize(12);
      doc.text('ORDER FORM', 14, 23);
      doc.setFontSize(9);
      var left = [
        ['Party', order.partyName || '-'],
        ['Address', order.address || '-'],
        ['Cell No.', order.cellNo || '-'],
        ['Group', order.productGroup || '-']
      ];
      var right = [
        ['Order Date', formatDate(order.orderDate)],
        ['Delivery', formatDate(order.deliveryDate)],
        ['Estimation No.', order.estimateNo || '-'],
        ['Touch', order.touch || '-']
      ];
      var y = 31;
      left.forEach(function (r) { doc.setFont(undefined, 'bold'); doc.text(r[0] + ':', 14, y); doc.setFont(undefined, 'normal'); doc.text(String(r[1]), 48, y); y += 6; });
      y = 31;
      right.forEach(function (r) { doc.setFont(undefined, 'bold'); doc.text(r[0] + ':', 115, y); doc.setFont(undefined, 'normal'); doc.text(String(r[1]), 150, y); y += 6; });

      var images = await Promise.all(order.items.map(function (x) { return loadImageData(x.image); }));
      var bodyRows = order.items.map(function (x, i) {
        return [i + 1, x.artNo, x.name, x.heightInch || '-',
                formatNumber2(x.weight), formatNumber(x.quantity), formatNumber2(x.totalWeight), ''];
      });
      doc.autoTable({
        startY: 66,
        head: [['SL', 'ART NO.', 'PRODUCT NAME', 'SIZE', 'WT(g)', 'QTY', 'TOTAL WT', 'IMAGE']],
        body: bodyRows,
        foot: [['', '', '', '', 'TOTAL', formatNumber(order.totalQty), formatNumber2(order.totalWeight), '']],
        styles: { fontSize: 7, cellPadding: 1.5, minCellHeight: 22, valign: 'middle' },
        headStyles: { fillColor: [140, 0, 76], textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [224, 199, 199], textColor: [140, 0, 76], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 45 }, 3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 14, halign: 'center' },
          6: { cellWidth: 22, halign: 'right' }, 7: { cellWidth: 22, halign: 'center' }
        },
        theme: 'grid', margin: { left: 14, right: 14 }
      });
      var table = doc.lastAutoTable;
      for (var i = 0; i < images.length; i++) {
        var im = images[i];
        if (!im || !im.dataUrl) continue;
        var cell = table.body[i] && table.body[i].cells && table.body[i].cells[7];
        if (!cell) continue;
        try { doc.addImage(im.dataUrl, im.format, cell.x + 1.5, cell.y + 1.5, cell.width - 3, cell.height - 3, undefined, 'FAST'); } catch (e) { console.warn('pdf.addImage failed', e); }
      }
      doc.save('Estimation_' + safeFilePart(order.estimateNo || 'ORDER') + '.pdf');
    } catch (err) { console.error(err); alert('Could not generate PDF: ' + err.message); }
  }

  /* ============================================================
     EXCEL
     ============================================================ */
  async function downloadOrderExcel(order) {
    if (!order) return;
    if (!window.ExcelJS) { alert('Excel library not loaded.'); return; }
    try {
      var wb = new ExcelJS.Workbook();
      var ws = wb.addWorksheet('Order');
      ws.columns = [
        { header: 'SL', key: 'sl', width: 6 },
        { header: 'ART NO.', key: 'artNo', width: 14 },
        { header: 'PRODUCT NAME', key: 'name', width: 28 },
        { header: 'SIZE (INCH)', key: 'size', width: 12 },
        { header: 'WT(g)', key: 'weight', width: 10 },
        { header: 'QTY', key: 'qty', width: 8 },
        { header: 'TOTAL WT', key: 'totalWt', width: 12 },
        { header: 'IMAGE', key: 'image', width: 14 }
      ];
      ws.mergeCells('A1:H1');
      ws.getCell('A1').value = 'GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD';
      ws.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FF8C004C' } };
      ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;
      ws.mergeCells('A2:H2');
      ws.getCell('A2').value = 'ESTIMATION ' + (order.estimateNo || '')
                            + '   |   Party: ' + (order.partyName || '')
                            + '   |   Date: ' + formatDate(order.orderDate);
      ws.getCell('A2').font = { bold: true, size: 11 };
      ws.getCell('A2').alignment = { horizontal: 'center' };
      ws.getRow(2).height = 20;
      ws.addRow([]);
      var headerRow = ws.addRow(['SL', 'ART NO.', 'PRODUCT NAME', 'SIZE (INCH)', 'WT(g)', 'QTY', 'TOTAL WT', 'IMAGE']);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.height = 22;
      headerRow.eachCell(function (c) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8C004C' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      var images = await Promise.all(order.items.map(function (x) { return loadImageData(x.image); }));
      var imageTasks = [];
      for (var i = 0; i < order.items.length; i++) {
        var x = order.items[i];
        var row = ws.addRow([
          i + 1, x.artNo, x.name, x.heightInch || '-',
          Number(x.weight || 0), Number(x.quantity || 0), Number(x.totalWeight || 0), ''
        ]);
        row.height = 55;
        row.eachCell(function (c) {
          c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        [1, 2, 4, 5, 6, 7].forEach(function (col) {
          row.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
        });
        if (images[i] && images[i].rawBase64) imageTasks.push({ rowNumber: row.number, image: images[i] });
      }
      var totalRow = ws.addRow(['', '', '', 'TOTAL', '', Number(order.totalQty || 0), Number(order.totalWeight || 0), '']);
      totalRow.font = { bold: true };
      totalRow.height = 22;
      totalRow.eachCell(function (c) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0C7C7' } };
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      for (var k = 0; k < imageTasks.length; k++) {
        try {
          var task = imageTasks[k];
          var imgId = wb.addImage({ base64: task.image.rawBase64, extension: task.image.extension });
          ws.addImage(imgId, { tl: { col: 7, row: task.rowNumber - 1 }, ext: { width: 50, height: 50 }, editAs: 'oneCell' });
        } catch (e) { console.warn('xlsx.addImage failed', e); }
      }
      var buf = await wb.xlsx.writeBuffer();
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'Estimation_' + safeFilePart(order.estimateNo || 'ORDER') + '.xlsx';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (err) { console.error(err); alert('Could not generate Excel: ' + err.message); }
  }

  if (downloadPdfBtn)   downloadPdfBtn.addEventListener('click',   function () { if (pendingPreviewOrder) downloadOrderPDF(pendingPreviewOrder); });
  if (downloadExcelBtn) downloadExcelBtn.addEventListener('click', function () { if (pendingPreviewOrder) downloadOrderExcel(pendingPreviewOrder); });

  /* ============================================================
     RESET
     ============================================================ */
  function resetFormToStart() {
    items = [];
    renderItems();
    clearParty();
    artNoInput.value = ''; qtyInput.value = '1';
    previewBox.classList.add('hidden');
    if (noteInput) noteInput.value = '';
    if (deliveryDateInput) deliveryDateInput.value = '';
    if (orderDateInput) orderDateInput.value = new Date().toISOString().slice(0, 10);
    currentEstimateNo = generateEstimateNo();
    if (estimateNoInput) estimateNoInput.value = currentEstimateNo;
    partyStep.classList.add('active');
    orderStep.classList.remove('active');
    if (submitStatus) submitStatus.textContent = '';
    window.scrollTo(0, 0);
  }

  /* ============================================================
     SAVE ESTIMATION
     ============================================================ */
  function openPendingEstimationsModal() {
    if (!estimationsModal) { console.warn('[order-form.js] estimationsModal missing'); return; }
    renderEstimations();
    estimationsModal.classList.remove('hidden');
  }

  if (saveEstimationBtn) {
    saveEstimationBtn.addEventListener('click', function () {
      if (!pendingPreviewOrder) { alert('Open the preview first.'); return; }

      var list = _readJSON(ESTIMATIONS_KEY, []);
      if (!Array.isArray(list)) list = [];
      list = list.filter(function (e) { return e.estimateNo !== pendingPreviewOrder.estimateNo; });

      pendingPreviewOrder.status       = 'estimated';
      pendingPreviewOrder.confirmed    = false;
      pendingPreviewOrder.forwardedAt  = null;
      pendingPreviewOrder.savedAt      = new Date().toISOString();
      pendingPreviewOrder.estimationDate = pendingPreviewOrder.orderDate;

      list.push(pendingPreviewOrder);
      saveJSON(ESTIMATIONS_KEY, list);

      if (submitStatus) submitStatus.textContent = 'Estimation ' + pendingPreviewOrder.estimateNo + ' saved to Pending Estimations.';

      previewModal.classList.add('hidden');
      resetFormToStart();
      openPendingEstimationsModal();
    });
  }

  /* ============================================================
     PENDING ESTIMATIONS LIST
     ============================================================ */
  function renderEstimations() {
    if (!estimationsList) return;
    var list = _readJSON(ESTIMATIONS_KEY, []);
    if (!Array.isArray(list)) list = [];

    var pending = list.filter(function (e) { return !e.confirmed && !e.forwardedAt; });

    if (!pending.length) {
      estimationsList.innerHTML = '<div class="empty-list">No pending estimations. Create one via ORDER FORM → PREVIEW → SAVE ESTIMATION.</div>';
      return;
    }

    pending.sort(function (a, b) {
      return new Date(b.savedAt || b.createdAt || 0) - new Date(a.savedAt || a.createdAt || 0);
    });

    var html = '<div class="list-table"><table><thead><tr>'
             +   '<th>EST. NO.</th>'
             +   '<th>EST. DATE</th>'
             +   '<th>PARTY</th>'
             +   '<th>GROUP</th>'
             +   '<th>TOUCH</th>'
             +   '<th>QTY</th>'
             +   '<th>WT (g)</th>'
             +   '<th>ACTION</th>'
             + '</tr></thead><tbody>';

    pending.forEach(function (e) {
      var estDate = e.estimationDate || e.orderDate || e.savedAt || e.createdAt;
      html += '<tr>'
           +   '<td><button type="button" class="link-button" data-est="' + escapeAttr(e.estimateNo) + '">' + escapeHtml(e.estimateNo) + '</button></td>'
           +   '<td>' + formatDate(estDate) + '</td>'
           +   '<td>' + escapeHtml(e.partyName || '—') + '</td>'
           +   '<td>' + escapeHtml(e.productGroup || '—') + '</td>'
           +   '<td>' + escapeHtml(e.touch || '—') + '</td>'
           +   '<td>' + formatNumber(e.totalQty) + '</td>'
           +   '<td>' + formatNumber2(e.totalWeight) + '</td>'
           +   '<td><button type="button" class="btn primary" data-est="' + escapeAttr(e.estimateNo) + '">OPEN</button></td>'
           + '</tr>';
    });

    html += '</tbody></table></div>';
    estimationsList.innerHTML = html;

    estimationsList.querySelectorAll('[data-est]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        estimationsModal.classList.add('hidden');
        openEstimationDetail(btn.dataset.est);
      });
    });
  }

  if (estimationsTopBtn) estimationsTopBtn.addEventListener('click', function () {
    openPendingEstimationsModal();
  });
  if (closeEstimations) closeEstimations.addEventListener('click', function () {
    estimationsModal.classList.add('hidden');
  });

  /* ============================================================
     ESTIMATION DETAIL
     ============================================================ */
  function openEstimationDetail(estNo) {
    var list = _readJSON(ESTIMATIONS_KEY, []);
    activeEstimation = (list || []).find(function (e) { return e.estimateNo === estNo; }) || null;
    if (!activeEstimation) { alert('Estimation not found.'); return; }
    var e = activeEstimation;
    var estDate = e.estimationDate || e.orderDate || e.savedAt || e.createdAt;

    var html = '<h2 class="preview-title">ESTIMATION ' + escapeHtml(e.estimateNo) + '</h2>';
    html += '<div class="preview-meta">'
         +    '<div><span>PARTY</span><b>' + escapeHtml(e.partyName || '—') + '</b></div>'
         +    '<div><span>EST. DATE</span><b>' + formatDate(estDate) + '</b></div>'
         +    '<div><span>ORDER DATE</span><b>' + formatDate(e.orderDate) + '</b></div>'
         +    '<div><span>DELIVERY</span><b>' + formatDate(e.deliveryDate) + '</b></div>'
         +    '<div><span>PRODUCT GROUP</span><b>' + escapeHtml(e.productGroup || '—') + '</b></div>'
         +    '<div><span>TOUCH</span><b>' + escapeHtml(e.touch || '—') + '</b></div>'
         +    '<div><span>TOTAL QTY</span><b>' + formatNumber(e.totalQty) + '</b></div>'
         +    '<div><span>TOTAL WEIGHT</span><b>' + formatNumber2(e.totalWeight) + ' g</b></div>'
         +  '</div>';
    html += '<div class="preview-party">'
         +    '<div><span>ADDRESS</span><b>' + escapeHtml(e.address || '—') + '</b></div>'
         +    '<div><span>CELL NO.</span><b>' + escapeHtml(e.cellNo || '—') + '</b></div>'
         +  '</div>';
    html += '<div class="table-wrap"><table class="preview-table"><thead><tr>'
         +    '<th>SL</th><th>ART NO.</th><th>NAME</th><th>SIZE</th><th>WT(g)</th><th>QTY</th><th>TOTAL WT</th><th>IMAGE</th>'
         +  '</tr></thead><tbody>';
    (e.items || []).forEach(function (it, i) {
      var imgHtml = '—';
      if (it.image) {
        var fallbacks = getImageFallbackList(it.image);
        imgHtml = '<img src="' + escapeAttr(fallbacks[0]) + '" class="preview-product-image" '
                + 'onerror="if(!this.dataset.fbIdx){this.dataset.fbIdx=1;} '
                + 'var list=' + escapeAttr(JSON.stringify(fallbacks)) + '; '
                + 'if(this.dataset.fbIdx<list.length){this.src=list[this.dataset.fbIdx++];} '
                + 'else{this.style.display=\'none\';}">';
      }
      html += '<tr>'
           +   '<td>' + (i + 1) + '</td>'
           +   '<td>' + escapeHtml(it.artNo) + '</td>'
           +   '<td>' + escapeHtml(it.name) + '</td>'
           +   '<td>' + escapeHtml(it.heightInch || '—') + '</td>'
           +   '<td>' + formatNumber2(it.weight) + '</td>'
           +   '<td>' + formatNumber(it.quantity) + '</td>'
           +   '<td>' + formatNumber2(it.totalWeight) + '</td>'
           +   '<td>' + imgHtml + '</td>'
           + '</tr>';
    });
    html += '</tbody><tfoot><tr class="preview-total">'
         +    '<td colspan="5" class="total-label">TOTAL</td>'
         +    '<td>' + formatNumber(e.totalQty) + '</td>'
         +    '<td>' + formatNumber2(e.totalWeight) + '</td><td></td>'
         + '</tr></tfoot></table></div>';
    if (e.note) html += '<p style="margin-top:12px;font-size:12px"><b>Note:</b> ' + escapeHtml(e.note) + '</p>';

    estimationDetailContent.innerHTML = html;
    if (estimationDetailStatus) estimationDetailStatus.textContent = '';
    if (detailWorkshopSelect) detailWorkshopSelect.value = '';

    if (detailSplitCount) detailSplitCount.value = '1';
    resetSplitState();
    renderSplitUI();

    estimationDetailModal.classList.remove('hidden');
  }

  /* ============================================================
     SPLIT — helpers
     ============================================================ */
  function getSplitCount() {
    var n = Number(detailSplitCount && detailSplitCount.value) || 1;
    return Math.max(1, Math.min(6, Math.floor(n)));
  }

  function resetSplitState() {
    splitParts = [];
    splitPartWorkshops = [];
    var count = getSplitCount();
    if (count <= 1) {
      splitParts = [];
      splitPartWorkshops = [];
      return;
    }
    if (!activeEstimation) { splitParts = []; splitPartWorkshops = []; return; }
    for (var p = 0; p < count; p++) {
      var part = { quantities: {} };
      (activeEstimation.items || []).forEach(function (it) {
        part.quantities[String(it.artNo)] = 0;
      });
      splitParts.push(part);
      splitPartWorkshops.push('');
    }
    autoSplitByQty();
  }

  function eachItemTotalQty() {
    var m = {};
    (activeEstimation && activeEstimation.items || []).forEach(function (it) {
      var k = String(it.artNo);
      m[k] = (m[k] || 0) + Number(it.quantity || 0);
    });
    return m;
  }

  function autoSplitByQty() {
    if (!activeEstimation) return;
    var count = splitParts.length;
    if (count <= 1) return;

    var totals = eachItemTotalQty();
    var arts = Object.keys(totals);

    splitParts.forEach(function (part) {
      part.quantities = {};
      arts.forEach(function (a) { part.quantities[a] = 0; });
    });

    arts.forEach(function (art) {
      var total = totals[art];
      var base = Math.floor(total / count);
      var rem  = total - base * count;
      for (var p = 0; p < count; p++) {
        splitParts[p].quantities[art] = base + (p < rem ? 1 : 0);
      }
    });

    renderSplitUI();
  }

  function autoSplitByArt() {
    if (!activeEstimation) return;
    var count = splitParts.length;
    if (count <= 1) return;

    var items = activeEstimation.items || [];
    splitParts.forEach(function (part) {
      part.quantities = {};
      items.forEach(function (it) { part.quantities[String(it.artNo)] = 0; });
    });

    items.forEach(function (it, idx) {
      var p = idx % count;
      var art = String(it.artNo);
      splitParts[p].quantities[art] = (splitParts[p].quantities[art] || 0) + Number(it.quantity || 0);
    });

    renderSplitUI();
  }

  function autoSplitByName() {
    if (!activeEstimation) return;
    var count = splitParts.length;
    if (count <= 1) return;

    var items = activeEstimation.items || [];

    splitParts.forEach(function (part) {
      part.quantities = {};
      items.forEach(function (it) { part.quantities[String(it.artNo)] = 0; });
    });

    var byName = {};
    var nameOrder = [];
    items.forEach(function (it) {
      var nm = String(it.name || '').trim().toUpperCase() || 'UNNAMED';
      if (!byName[nm]) {
        byName[nm] = { artNos: [], totalQty: 0 };
        nameOrder.push(nm);
      }
      var art = String(it.artNo);
      if (byName[nm].artNos.indexOf(art) === -1) byName[nm].artNos.push(art);
      byName[nm].totalQty += Number(it.quantity || 0);
    });

    nameOrder.forEach(function (nm, idx) {
      var p = idx % count;
      items.forEach(function (it) {
        var nm2 = String(it.name || '').trim().toUpperCase() || 'UNNAMED';
        if (nm2 !== nm) return;
        var art = String(it.artNo);
        splitParts[p].quantities[art] = (splitParts[p].quantities[art] || 0) + Number(it.quantity || 0);
      });
    });

    renderSplitUI();
  }

  function validateSplit() {
    if (!activeEstimation) return { ok: false, msg: 'No estimation loaded.' };
    if (splitParts.length <= 1) return { ok: true, msg: '' };

    var totals = eachItemTotalQty();
    var arts = Object.keys(totals);

    var sumPerArt = {};
    arts.forEach(function (a) { sumPerArt[a] = 0; });

    for (var p = 0; p < splitParts.length; p++) {
      for (var i = 0; i < arts.length; i++) {
        var a = arts[i];
        var q = Number(splitParts[p].quantities[a] || 0);
        if (q < 0 || !Number.isFinite(q)) {
          return { ok: false, msg: 'Part ' + (p + 1) + ': invalid quantity for art ' + a + '.' };
        }
        sumPerArt[a] += q;
      }
      var partTotal = 0;
      arts.forEach(function (a) { partTotal += Number(splitParts[p].quantities[a] || 0); });
      if (partTotal <= 0) {
        return { ok: false, msg: 'Part ' + (p + 1) + ' is empty. Give it at least 1 piece.' };
      }
      if (!splitPartWorkshops[p]) {
        return { ok: false, msg: 'Part ' + (p + 1) + ': please select a workshop.' };
      }
    }

    for (var j = 0; j < arts.length; j++) {
      var art = arts[j];
      if (sumPerArt[art] !== totals[art]) {
        return {
          ok: false,
          msg: 'Art ' + art + ': split total (' + sumPerArt[art] +
               ') ≠ estimation total (' + totals[art] + ').'
        };
      }
    }
    return { ok: true, msg: '✓ Quantities match the estimation total.' };
  }

  function renderSplitUI() {
    if (!splitConfigPanel) return;
    var count = splitParts.length;

    if (count <= 1) {
      splitConfigPanel.classList.add('hidden');
      if (splitValidationMsg) { splitValidationMsg.textContent = ''; splitValidationMsg.className = 'split-validation-msg'; }
      return;
    }
    splitConfigPanel.classList.remove('hidden');
    if (splitConfigHint) {
      splitConfigHint.textContent = 'Assign quantities per art number to ' + count + ' parts. Set a workshop for each part.';
    }

    var items = activeEstimation ? (activeEstimation.items || []) : [];
    var seen = {};
    var arts = [];
    items.forEach(function (it) {
      var k = String(it.artNo);
      if (!seen[k]) { seen[k] = true; arts.push({ artNo: k, name: it.name, totalQty: 0 }); }
      arts[arts.length - 1].totalQty += Number(it.quantity || 0);
    });
    var totals = eachItemTotalQty();
    arts.forEach(function (a) { a.totalQty = totals[a.artNo] || 0; });

    var workshopOptions = ['', 'Kalimatha', 'Gomatha', 'Ambhaji', 'Vanisri', 'Vishal', 'GPWB'];

    var html = '';
    for (var p = 0; p < count; p++) {
      var part = splitParts[p];
      var partTotalQty = 0;
      var rowsHtml = '';

      arts.forEach(function (a) {
        var q = Number(part.quantities[a.artNo] || 0);
        partTotalQty += q;
        var inputValue = (q > 0) ? String(q) : '';
        var inputCls   = (q > 0) ? ' has-qty' : '';
        rowsHtml += '<div class="split-part-row">'
                 +    '<span class="sp-name" title="' + escapeAttr(a.name) + '">'
                 +      escapeHtml(a.artNo) + ' — ' + escapeHtml(a.name)
                 +      ' <small>(' + a.totalQty + ' total)</small>'
                 +    '</span>'
                 +    '<input type="number" min="0" step="1" placeholder="0" class="' + inputCls.trim() + '" '
                 +           'data-part="' + p + '" data-art="' + escapeAttr(a.artNo) + '" value="' + inputValue + '">'
                 +  '</div>';
      });

      var currentWs = splitPartWorkshops[p] || '';
      var wsOpts = workshopOptions.map(function (w) {
        var label = w ? w : '-- select workshop --';
        return '<option value="' + escapeAttr(w) + '"'
             + (w === currentWs ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
      }).join('');

      html += '<div class="split-part">'
           +    '<div class="split-part-head">'
           +      '<span class="split-part-title"><i class="fas fa-cube"></i> Part ' + (p + 1) + '</span>'
           +      '<span class="split-part-total">Qty: <b>' + partTotalQty + '</b></span>'
           +    '</div>'
           +    '<label class="split-part-workshop">Workshop'
           +      '<select data-part-ws="' + p + '">' + wsOpts + '</select>'
           +    '</label>'
           +    '<div class="split-part-rows">' + rowsHtml + '</div>'
           +  '</div>';
    }

    splitPartsWrap.innerHTML = html;

    splitPartsWrap.querySelectorAll('input[data-part][data-art]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var p = Number(inp.dataset.part);
        var art = inp.dataset.art;
        var raw = inp.value.trim();
        var v = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
        splitParts[p].quantities[art] = v;
        inp.classList.toggle('has-qty', v > 0);

        var partBox = inp.closest('.split-part');
        if (partBox) {
          var tot = 0;
          Object.keys(splitParts[p].quantities).forEach(function (k) {
            tot += Number(splitParts[p].quantities[k] || 0);
          });
          var totEl = partBox.querySelector('.split-part-total b');
          if (totEl) totEl.textContent = tot;
        }
        var val = validateSplit();
        if (splitValidationMsg) {
          splitValidationMsg.textContent = val.msg;
          splitValidationMsg.className = 'split-validation-msg ' + (val.ok ? 'ok' : 'err');
        }
        renderSplitValidationHighlights();
      });
      inp.addEventListener('blur', function () {
        var v = Number(inp.value || 0);
        if (v === 0) inp.value = '';
      });
    });

    splitPartsWrap.querySelectorAll('select[data-part-ws]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var p = Number(sel.dataset.partWs);
        splitPartWorkshops[p] = sel.value || '';
        var val = validateSplit();
        if (splitValidationMsg) {
          splitValidationMsg.textContent = val.msg;
          splitValidationMsg.className = 'split-validation-msg ' + (val.ok ? 'ok' : 'err');
        }
      });
    });

    var v0 = validateSplit();
    if (splitValidationMsg) {
      splitValidationMsg.textContent = v0.msg;
      splitValidationMsg.className = 'split-validation-msg ' + (v0.ok ? 'ok' : 'err');
    }
    renderSplitValidationHighlights();
  }

  function renderSplitValidationHighlights() {
    if (!activeEstimation || splitParts.length <= 1) return;
    var totals = eachItemTotalQty();
    var sumPerArt = {};
    Object.keys(totals).forEach(function (a) { sumPerArt[a] = 0; });
    splitParts.forEach(function (part) {
      Object.keys(part.quantities).forEach(function (a) {
        sumPerArt[a] = (sumPerArt[a] || 0) + Number(part.quantities[a] || 0);
      });
    });
    splitPartsWrap.querySelectorAll('input[data-part][data-art]').forEach(function (inp) {
      var a = inp.dataset.art;
      var over = sumPerArt[a] > (totals[a] || 0);
      inp.classList.toggle('invalid', over);
    });
  }

  if (detailSplitCount) {
    detailSplitCount.addEventListener('change', function () {
      resetSplitState();
      renderSplitUI();
    });
  }
  if (splitAutoByQtyBtn) {
    splitAutoByQtyBtn.addEventListener('click', function () {
      if (splitParts.length <= 1) return;
      autoSplitByQty();
    });
  }
  if (splitAutoByArtBtn) {
    splitAutoByArtBtn.addEventListener('click', function () {
      if (splitParts.length <= 1) return;
      autoSplitByArt();
    });
  }
  if (splitAutoByNameBtn) {
    splitAutoByNameBtn.addEventListener('click', function () {
      if (splitParts.length <= 1) return;
      autoSplitByName();
    });
  }
  if (splitResetBtn) {
    splitResetBtn.addEventListener('click', function () {
      resetSplitState();
      renderSplitUI();
    });
  }

  if (closeEstimationDetail) closeEstimationDetail.addEventListener('click', function () {
    estimationDetailModal.classList.add('hidden');
    openPendingEstimationsModal();
  });
  if (backToEstListBtn) backToEstListBtn.addEventListener('click', function () {
    estimationDetailModal.classList.add('hidden');
    openPendingEstimationsModal();
  });
  if (estimationPdfBtn) estimationPdfBtn.addEventListener('click', function () {
    if (activeEstimation) downloadOrderPDF(activeEstimation);
  });
  if (estimationExcelBtn) estimationExcelBtn.addEventListener('click', function () {
    if (activeEstimation) downloadOrderExcel(activeEstimation);
  });
  if (newEstimationDetailBtn) newEstimationDetailBtn.addEventListener('click', function () {
    estimationDetailModal.classList.add('hidden');
    resetFormToStart();
  });

  /* ============================================================
     FORWARD TO WORKSHOP — with optional split
     ============================================================ */
  var WORKSHOPS = ['Kalimatha', 'Vanisri', 'Gomatha', 'Ambhaji', 'GPWB', 'Vishal'];

  var GROUP_ORDER_START = {
    '2D IDOLS':   901,
    '3D IDOLS':   4101,
    'JEWELLERY':  8201,
    'GOD FRAMES': 1101,
    '3D PREMIUM IDOLS': 5101
  };
  function nextOrderNoForGroup(group) {
    var g = String(group || '').toUpperCase();
    var start = GROUP_ORDER_START[g] || 1001;

    var orders = _readJSON(ORDERS_KEY, []);
    if (!Array.isArray(orders)) orders = [];

    var max = start - 1;
    orders.forEach(function (o) {
      if (String(o.productGroup || '').toUpperCase() !== g) return;
      var num = Number(o.orderNo);
      if (!isNaN(num) && num > max) max = num;
    });
    return String(max + 1);
  }

  if (detailForwardBtn) {
    detailForwardBtn.addEventListener('click', function () {
      if (!activeEstimation) { alert('No estimation open.'); return; }

      var count = getSplitCount();

      if (count <= 1) {
        var ws = detailWorkshopSelect ? detailWorkshopSelect.value : '';
        if (!ws) { alert('Please select a workshop.'); detailWorkshopSelect && detailWorkshopSelect.focus(); return; }
        var wsMatch = WORKSHOPS.find(function (w) { return w.toLowerCase() === ws.toLowerCase(); }) || ws;

        var orders1 = _readJSON(ORDERS_KEY, []);
        if (!Array.isArray(orders1)) orders1 = [];
        var singleOrderNo = nextOrderNoForGroup(activeEstimation.productGroup);
        var forwarded = JSON.parse(JSON.stringify(activeEstimation));
        forwarded.workshop     = wsMatch;
        forwarded.orderNo      = singleOrderNo;
        forwarded.confirmed    = true;
        forwarded.confirmedAt  = new Date().toISOString();
        forwarded.forwardedAt  = forwarded.confirmedAt;
        forwarded.status       = 'pending';
        forwarded.partInfo     = { part: 1, of: 1, splitOf: null, isOriginal: true };
        forwarded.priority     = !!forwarded.priority;
        forwarded.items = (forwarded.items || []).map(function (it) {
          return {
            artNo: it.artNo, name: it.name, heightInch: it.heightInch,
            weight: Number(it.weight || 0),
            quantity: Number(it.quantity || 0),
            totalWeight: Number(it.totalWeight || 0),
            image: it.image || ''
          };
        });
        orders1.push(forwarded);
        saveJSON(ORDERS_KEY, orders1);

        var list1 = _readJSON(ESTIMATIONS_KEY, []);
        if (Array.isArray(list1)) {
          list1 = list1.filter(function (e) { return e.estimateNo !== activeEstimation.estimateNo; });
          saveJSON(ESTIMATIONS_KEY, list1);
        }

        if (estimationDetailStatus) estimationDetailStatus.textContent = '✅ Order ' + singleOrderNo + ' forwarded to ' + wsMatch + '.';
        if (detailForwardBtn) { detailForwardBtn.disabled = true; detailForwardBtn.innerHTML = '<i class="fas fa-check"></i> FORWARDED'; }

        setTimeout(function () {
          estimationDetailModal.classList.add('hidden');
          resetFormToStart();
          if (detailForwardBtn) { detailForwardBtn.disabled = false; detailForwardBtn.innerHTML = '<i class="fas fa-paper-plane"></i> FORWARD ORDER'; }
          if (estimationDetailStatus) estimationDetailStatus.textContent = '';
        }, 1400);
        return;
      }

      var val = validateSplit();
      if (!val.ok) {
        alert('Split configuration is not valid:\n\n' + val.msg);
        return;
      }

      var orders = _readJSON(ORDERS_KEY, []);
      if (!Array.isArray(orders)) orders = [];

      var nowIso = new Date().toISOString();
      var est = activeEstimation;
      var createdOrders = [];

      var baseMax = (function () {
        var g = String(est.productGroup || '').toUpperCase();
        var start = GROUP_ORDER_START[g] || 1001;
        var max = start - 1;
        orders.forEach(function (o) {
          if (String(o.productGroup || '').toUpperCase() !== g) return;
          var num = Number(o.orderNo);
          if (!isNaN(num) && num > max) max = num;
        });
        return max;
      })();

      for (var p = 0; p < splitParts.length; p++) {
        var part = splitParts[p];
        var partWs = splitPartWorkshops[p];
        if (!partWs) { alert('Part ' + (p + 1) + ': workshop not set.'); return; }

        var partItems = [];
        (est.items || []).forEach(function (it) {
          var art = String(it.artNo);
          var qtyInPart = Number(part.quantities[art] || 0);
          if (qtyInPart <= 0) return;
          partItems.push({
            artNo: it.artNo,
            name: it.name,
            heightInch: it.heightInch,
            weight: Number(it.weight || 0),
            quantity: qtyInPart,
            totalWeight: Number(it.weight || 0) * qtyInPart,
            image: it.image || ''
          });
        });
        var coalesced = [];
        var byArt = {};
        partItems.forEach(function (x) {
          var k = String(x.artNo);
          if (byArt[k]) {
            byArt[k].quantity += x.quantity;
            byArt[k].totalWeight += x.totalWeight;
          } else {
            byArt[k] = x;
            coalesced.push(x);
          }
        });

        var partQty = coalesced.reduce(function (s, x) { return s + Number(x.quantity || 0); }, 0);
        var partWt  = coalesced.reduce(function (s, x) { return s + Number(x.totalWeight || 0); }, 0);

        var orderNo = String(baseMax + p + 1);
        var splitOrder = JSON.parse(JSON.stringify(est));
        splitOrder.id            = 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_P' + (p + 1);
        splitOrder.orderNo       = orderNo;
        splitOrder.workshop      = partWs;
        splitOrder.confirmed     = true;
        splitOrder.confirmedAt   = nowIso;
        splitOrder.forwardedAt   = nowIso;
        splitOrder.status        = 'pending';
        splitOrder.items         = coalesced;
        splitOrder.totalQty      = partQty;
        splitOrder.totalWeight   = partWt;
        splitOrder.priority      = !!est.priority;
        splitOrder.partInfo      = {
          part: p + 1,
          of: splitParts.length,
          splitOf: est.estimateNo,
          isOriginal: false,
          workshop: partWs
        };
        orders.push(splitOrder);
        createdOrders.push(splitOrder);
      }

      saveJSON(ORDERS_KEY, orders);

      var list = _readJSON(ESTIMATIONS_KEY, []);
      if (Array.isArray(list)) {
        list = list.filter(function (e) { return e.estimateNo !== est.estimateNo; });
        saveJSON(ESTIMATIONS_KEY, list);
      }

      if (estimationDetailStatus) {
        var summary = createdOrders.map(function (o) {
          return o.orderNo + ' → ' + o.workshop;
        }).join('  |  ');
        estimationDetailStatus.textContent = '✅ ' + createdOrders.length + ' part-orders forwarded:  ' + summary;
      }
      if (detailForwardBtn) { detailForwardBtn.disabled = true; detailForwardBtn.innerHTML = '<i class="fas fa-check"></i> FORWARDED'; }

      setTimeout(function () {
        estimationDetailModal.classList.add('hidden');
        resetFormToStart();
        if (detailForwardBtn) { detailForwardBtn.disabled = false; detailForwardBtn.innerHTML = '<i class="fas fa-paper-plane"></i> FORWARD ORDER'; }
        if (estimationDetailStatus) estimationDetailStatus.textContent = '';
      }, 1800);
    });
  }

  /* ============================================================
     PENDING ORDERS (top bar) — filters + transfer + cancel + priority
     ============================================================ */
  var pendingFilters = { party: '', workshop: '', group: '', from: '', to: '', priority: '' };
  var pendingSelectedId = null;

  var pendingSplitParts = [];
  var pendingSplitPartWorkshops = [];
  var _lastSplitBarOrderId = null;

  function getPendingOrders() {
    var orders = _readJSON(ORDERS_KEY, []);
    if (!Array.isArray(orders)) orders = [];
    var completed = getCompletedMap();
    return orders.filter(function (o) {
      if (!o) return false;
      if (o.status === 'completed' || o.status === 'cancelled') return false;
      if (o.completedAt) return false;
      if (completed[o.id]) return false;
      return true;
    });
  }

  function orderDateIso(o) {
    var raw = o.forwardedAt || o.confirmedAt || o.orderDate || o.createdAt;
    if (!raw) return '';
    try { return new Date(raw).toISOString().slice(0, 10); } catch (e) { return ''; }
  }

  function populatePendingFilterOptions(list) {
    var partySel    = $id('pfParty');
    var workshopSel = $id('pfWorkshop');
    var groupSel    = $id('pfGroup');
    if (!partySel || !workshopSel || !groupSel) return;

    function buildOptions(select, values, allLabel, current) {
      var uniq = {};
      values.forEach(function (v) { v = String(v || '').trim(); if (v) uniq[v] = true; });
      var sorted = Object.keys(uniq).sort(function (a, b) { return a.localeCompare(b); });
      select.innerHTML = '<option value="">' + allLabel + '</option>'
        + sorted.map(function (v) {
            return '<option value="' + escapeAttr(v) + '"' +
                   (v === current ? ' selected' : '') + '>' + escapeHtml(v) + '</option>';
          }).join('');
    }

    buildOptions(partySel,    list.map(function (o) { return o.partyName; }),
                 'All Parties',   pendingFilters.party);
    buildOptions(workshopSel, list.map(function (o) { return o.workshop; }),
                 'All Workshops', pendingFilters.workshop);
    buildOptions(groupSel,    list.map(function (o) { return o.productGroup; }),
                 'All Groups',    pendingFilters.group);
  }

  function applyPendingFilters(list) {
    return list.filter(function (o) {
      if (pendingFilters.party    && String(o.partyName    || '') !== pendingFilters.party)    return false;
      if (pendingFilters.workshop && String(o.workshop     || '') !== pendingFilters.workshop) return false;
      if (pendingFilters.group    && String(o.productGroup || '') !== pendingFilters.group)    return false;
      if (pendingFilters.priority === 'priority' && !o.priority) return false;
      if (pendingFilters.priority === 'normal'   &&  o.priority) return false;
      if (pendingFilters.from || pendingFilters.to) {
        var d = orderDateIso(o);
        if (!d) return false;
        if (pendingFilters.from && d < pendingFilters.from) return false;
        if (pendingFilters.to   && d > pendingFilters.to)   return false;
      }
      return true;
    });
  }

  function getPendingSplitCount() {
    var el = $id('ptbSplitCount');
    var n = Number(el && el.value) || 1;
    return Math.max(1, Math.min(6, Math.floor(n)));
  }

  function getPendingOrderById(id) {
    if (!id) return null;
    var orders = _readJSON(ORDERS_KEY, []);
    if (!Array.isArray(orders)) return null;
    return orders.find(function (o) { return o && o.id === id; }) || null;
  }

  function eachPendingItemTotalQty(order) {
    var m = {};
    ((order && order.items) || []).forEach(function (it) {
      var k = String(it.artNo);
      m[k] = (m[k] || 0) + Number(it.quantity || 0);
    });
    return m;
  }

  function autoSplitPendingByQty() {
    var order = getPendingOrderById(pendingSelectedId);
    if (!order) return;
    var count = pendingSplitParts.length;
    if (count <= 1) return;

    var totals = eachPendingItemTotalQty(order);
    var arts = Object.keys(totals);

    pendingSplitParts.forEach(function (part) {
      part.quantities = {};
      arts.forEach(function (a) { part.quantities[a] = 0; });
    });

    arts.forEach(function (art) {
      var total = totals[art];
      var base = Math.floor(total / count);
      var rem  = total - base * count;
      for (var p = 0; p < count; p++) {
        pendingSplitParts[p].quantities[art] = base + (p < rem ? 1 : 0);
      }
    });
    renderPendingSplitUI();
  }

  function autoSplitPendingByArt() {
    var order = getPendingOrderById(pendingSelectedId);
    if (!order) return;
    var count = pendingSplitParts.length;
    if (count <= 1) return;

    var items = order.items || [];
    pendingSplitParts.forEach(function (part) {
      part.quantities = {};
      items.forEach(function (it) { part.quantities[String(it.artNo)] = 0; });
    });
    items.forEach(function (it, idx) {
      var p = idx % count;
      var art = String(it.artNo);
      pendingSplitParts[p].quantities[art] =
        (pendingSplitParts[p].quantities[art] || 0) + Number(it.quantity || 0);
    });
    renderPendingSplitUI();
  }

  function autoSplitPendingByName() {
    var order = getPendingOrderById(pendingSelectedId);
    if (!order) return;
    var count = pendingSplitParts.length;
    if (count <= 1) return;

    var items = order.items || [];
    pendingSplitParts.forEach(function (part) {
      part.quantities = {};
      items.forEach(function (it) { part.quantities[String(it.artNo)] = 0; });
    });

    var byName = {}, nameOrder = [];
    items.forEach(function (it) {
      var nm = String(it.name || '').trim().toUpperCase() || 'UNNAMED';
      if (!byName[nm]) { byName[nm] = { artNos: [] }; nameOrder.push(nm); }
      var art = String(it.artNo);
      if (byName[nm].artNos.indexOf(art) === -1) byName[nm].artNos.push(art);
    });

    nameOrder.forEach(function (nm, idx) {
      var p = idx % count;
      items.forEach(function (it) {
        var nm2 = String(it.name || '').trim().toUpperCase() || 'UNNAMED';
        if (nm2 !== nm) return;
        var art = String(it.artNo);
        pendingSplitParts[p].quantities[art] =
          (pendingSplitParts[p].quantities[art] || 0) + Number(it.quantity || 0);
      });
    });
    renderPendingSplitUI();
  }

  function validatePendingSplit() {
    var order = getPendingOrderById(pendingSelectedId);
    if (!order) return { ok: false, msg: 'No order selected.' };
    if (pendingSplitParts.length <= 1) return { ok: true, msg: '' };

    var totals = eachPendingItemTotalQty(order);
    var arts = Object.keys(totals);
    var sumPerArt = {};
    arts.forEach(function (a) { sumPerArt[a] = 0; });

    for (var p = 0; p < pendingSplitParts.length; p++) {
      var partTotal = 0;
      for (var i = 0; i < arts.length; i++) {
        var a = arts[i];
        var q = Number(pendingSplitParts[p].quantities[a] || 0);
        if (q < 0 || !Number.isFinite(q)) {
          return { ok: false, msg: 'Part ' + (p + 1) + ': invalid quantity for art ' + a + '.' };
        }
        sumPerArt[a] += q;
        partTotal += q;
      }
      if (partTotal <= 0) {
        return { ok: false, msg: 'Part ' + (p + 1) + ' is empty. Give it at least 1 piece.' };
      }
      if (!pendingSplitPartWorkshops[p]) {
        return { ok: false, msg: 'Part ' + (p + 1) + ': please select a workshop.' };
      }
    }

    for (var j = 0; j < arts.length; j++) {
      var art = arts[j];
      if (sumPerArt[art] !== totals[art]) {
        return {
          ok: false,
          msg: 'Art ' + art + ': split total (' + sumPerArt[art] +
               ') ≠ order total (' + totals[art] + ').'
        };
      }
    }
    return { ok: true, msg: '✓ Quantities match the order total.' };
  }

  function resetPendingSplitState() {
    var count = getPendingSplitCount();
    pendingSplitParts = [];
    pendingSplitPartWorkshops = [];

    if (count <= 1) {
      renderPendingSplitUI();
      return;
    }

    var order = getPendingOrderById(pendingSelectedId);
    if (!order) { renderPendingSplitUI(); return; }

    for (var p = 0; p < count; p++) {
      var part = { quantities: {} };
      (order.items || []).forEach(function (it) {
        part.quantities[String(it.artNo)] = 0;
      });
      pendingSplitParts.push(part);
      pendingSplitPartWorkshops.push('');
    }
    autoSplitPendingByQty();
  }

  function renderPendingSplitUI() {
    var panel = $id('ptbSplitConfigPanel');
    var wrap  = $id('ptbSplitPartsWrap');
    var hint  = $id('ptbSplitConfigHint');
    var msgEl = $id('ptbSplitValidationMsg');
    if (!panel || !wrap) return;

    var count = pendingSplitParts.length;
    if (count <= 1) {
      panel.classList.add('hidden');
      if (msgEl) { msgEl.textContent = ''; msgEl.className = 'split-validation-msg'; }
      return;
    }
    panel.classList.remove('hidden');
    if (hint) hint.textContent = 'Assign quantities per art number to ' + count + ' parts. Set a workshop for each part.';

    var order = getPendingOrderById(pendingSelectedId);
    if (!order) { wrap.innerHTML = '<div class="empty-list">No order loaded.</div>'; return; }
    var items = order.items || [];
    var seen = {};
    var arts = [];
    items.forEach(function (it) {
      var k = String(it.artNo);
      if (!seen[k]) { seen[k] = true; arts.push({ artNo: k, name: it.name, totalQty: 0 }); }
      arts[arts.length - 1].totalQty += Number(it.quantity || 0);
    });
    var totals = eachPendingItemTotalQty(order);
    arts.forEach(function (a) { a.totalQty = totals[a.artNo] || 0; });

    var workshopOptions = ['', 'Kalimatha', 'Gomatha', 'Ambhaji', 'Vanisri', 'Vishal', 'GPWB'];

    var html = '';
    for (var p = 0; p < count; p++) {
      var part = pendingSplitParts[p];
      var partTotalQty = 0;
      var rowsHtml = '';

      arts.forEach(function (a) {
        var q = Number(part.quantities[a.artNo] || 0);
        partTotalQty += q;
        var inputValue = (q > 0) ? String(q) : '';
        var inputCls   = (q > 0) ? ' has-qty' : '';
        rowsHtml += '<div class="split-part-row">'
                 +    '<span class="sp-name" title="' + escapeAttr(a.name) + '">'
                 +      escapeHtml(a.artNo) + ' — ' + escapeHtml(a.name)
                 +      ' <small>(' + a.totalQty + ' total)</small>'
                 +    '</span>'
                 +    '<input type="number" min="0" step="1" placeholder="0" class="' + inputCls.trim() + '" '
                 +           'data-part="' + p + '" data-art="' + escapeAttr(a.artNo) + '" value="' + inputValue + '">'
                 +  '</div>';
      });

      var currentWs = pendingSplitPartWorkshops[p] || '';
      var wsOpts = workshopOptions.map(function (w) {
        var label = w ? w : '-- select workshop --';
        return '<option value="' + escapeAttr(w) + '"'
             + (w === currentWs ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
      }).join('');

      html += '<div class="split-part">'
           +    '<div class="split-part-head">'
           +      '<span class="split-part-title"><i class="fas fa-cube"></i> Part ' + (p + 1) + '</span>'
           +      '<span class="split-part-total">Qty: <b>' + partTotalQty + '</b></span>'
           +    '</div>'
           +    '<label class="split-part-workshop">Workshop'
           +      '<select data-part-ws="' + p + '">' + wsOpts + '</select>'
           +    '</label>'
           +    '<div class="split-part-rows">' + rowsHtml + '</div>'
           +  '</div>';
    }

    wrap.innerHTML = html;

    wrap.querySelectorAll('input[data-part][data-art]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var p = Number(inp.dataset.part);
        var art = inp.dataset.art;
        var raw = inp.value.trim();
        var v = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
        pendingSplitParts[p].quantities[art] = v;
        inp.classList.toggle('has-qty', v > 0);

        var partBox = inp.closest('.split-part');
        if (partBox) {
          var tot = 0;
          Object.keys(pendingSplitParts[p].quantities).forEach(function (k) {
            tot += Number(pendingSplitParts[p].quantities[k] || 0);
          });
          var totEl = partBox.querySelector('.split-part-total b');
          if (totEl) totEl.textContent = tot;
        }
        var val = validatePendingSplit();
        if (msgEl) {
          msgEl.textContent = val.msg;
          msgEl.className = 'split-validation-msg ' + (val.ok ? 'ok' : 'err');
        }
        renderPendingSplitValidationHighlights();
      });
      inp.addEventListener('blur', function () {
        var v = Number(inp.value || 0);
        if (v === 0) inp.value = '';
      });
    });

    wrap.querySelectorAll('select[data-part-ws]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var p = Number(sel.dataset.partWs);
        pendingSplitPartWorkshops[p] = sel.value || '';
        var val = validatePendingSplit();
        if (msgEl) {
          msgEl.textContent = val.msg;
          msgEl.className = 'split-validation-msg ' + (val.ok ? 'ok' : 'err');
        }
      });
    });

    var v0 = validatePendingSplit();
    if (msgEl) {
      msgEl.textContent = v0.msg;
      msgEl.className = 'split-validation-msg ' + (v0.ok ? 'ok' : 'err');
    }
    renderPendingSplitValidationHighlights();
  }

  function renderPendingSplitValidationHighlights() {
    var wrap = $id('ptbSplitPartsWrap');
    var order = getPendingOrderById(pendingSelectedId);
    if (!wrap || !order || pendingSplitParts.length <= 1) return;
    var totals = eachPendingItemTotalQty(order);
    var sumPerArt = {};
    Object.keys(totals).forEach(function (a) { sumPerArt[a] = 0; });
    pendingSplitParts.forEach(function (part) {
      Object.keys(part.quantities).forEach(function (a) {
        sumPerArt[a] = (sumPerArt[a] || 0) + Number(part.quantities[a] || 0);
      });
    });
    wrap.querySelectorAll('input[data-part][data-art]').forEach(function (inp) {
      var a = inp.dataset.art;
      var over = sumPerArt[a] > (totals[a] || 0);
      inp.classList.toggle('invalid', over);
    });
  }

  function partSuffix(idx) {
    return String.fromCharCode(65 + idx);
  }

  function showPendingTransferBar(orderId) {
    var bar = $id('pendingTransferBar');
    var label = $id('ptbOrderLabel');
    var sel = $id('ptbWorkshopSelect');
    if (!bar || !label) return;

    if (!orderId) {
      pendingSelectedId = null;
      _lastSplitBarOrderId = null;
      bar.classList.add('hidden');
      var scc = $id('ptbSplitCount'); if (scc) scc.value = '1';
      pendingSplitParts = [];
      pendingSplitPartWorkshops = [];
      renderPendingSplitUI();
      return;
    }

    var orders = _readJSON(ORDERS_KEY, []);
    var o = orders.find(function (x) { return x.id === orderId; });
    if (!o) { pendingSelectedId = null; bar.classList.add('hidden'); return; }

    var orderChanged = (_lastSplitBarOrderId !== orderId);
    _lastSplitBarOrderId = orderId;
    pendingSelectedId = orderId;
    label.textContent = (o.orderNo || '—') + '  ·  ' + (o.partyName || '—') +
                       '  ·  currently in ' + (o.workshop || '—');
    if (sel) sel.value = '';
    bar.classList.remove('hidden');
    var st = $id('pendingStatus'); if (st) st.textContent = '';

    if (orderChanged) {
      var sc = $id('ptbSplitCount'); if (sc) sc.value = '1';
      pendingSplitParts = [];
      pendingSplitPartWorkshops = [];
      renderPendingSplitUI();
    }
  }

  function renderPendingOrders() {
    if (!pendingList) return;
    var all = getPendingOrders();
    populatePendingFilterOptions(all);

    var pending = applyPendingFilters(all);

    var summaryEl = $id('pfSummary');
    if (summaryEl) {
      var totalQty = pending.reduce(function (s, o) { return s + Number(o.totalQty || 0); }, 0);
      var totalWt  = pending.reduce(function (s, o) { return s + Number(o.totalWeight || 0); }, 0);
      var active   = Object.keys(pendingFilters).filter(function (k) { return pendingFilters[k]; }).length;
      var prioCount = pending.filter(function (o) { return o.priority; }).length;
      summaryEl.innerHTML =
        '<b>' + pending.length + '</b> of <b>' + all.length + '</b> order(s) shown' +
        (active ? ' — filtered by <b>' + active + '</b> field(s)' : '') +
        ' &nbsp;·&nbsp; Qty <b>' + formatNumber(totalQty) + '</b>' +
        ' &nbsp;·&nbsp; Weight <b>' + formatNumber2(totalWt) + ' g</b>' +
        (prioCount
          ? ' &nbsp;·&nbsp; <b style="color:#b26a00">★ ' + prioCount + ' priority</b>'
          : '');
    }

    if (!all.length) {
      pendingList.innerHTML =
        '<div class="empty-list">No pending orders. Estimations appear here after you forward them to a workshop. ' +
        'Orders the branch has already dispatched to HO are moved to <b>Received Orders</b>.</div>';
      showPendingTransferBar(null);
      return;
    }
    if (!pending.length) {
      pendingList.innerHTML = '<div class="pending-filter-empty">No orders match the current filters. Try adjusting or clicking RESET.</div>';
      showPendingTransferBar(null);
      return;
    }

    pending.sort(function (a, b) {
      return new Date(b.forwardedAt || b.confirmedAt || 0) - new Date(a.forwardedAt || a.confirmedAt || 0);
    });

    var html = '<div class="list-table"><table><thead><tr>'
             +   '<th>ORDER NO.</th>'
             +   '<th>EST. NO.</th>'
             +   '<th>PARTY</th>'
             +   '<th>WORKSHOP</th>'
             +   '<th>GROUP</th>'
             +   '<th>QTY</th>'
             +   '<th>WT (g)</th>'
             +   '<th>DATE</th>'
             +   '<th>ACTION</th>'
             + '</tr></thead><tbody>';

    pending.forEach(function (o) {
      var iso = orderDateIso(o);
      var selected = (pendingSelectedId === o.id);
      var partChip = '';
      if (o.partInfo) {
        partChip = o.partInfo.isOriginal
          ? '<span class="part-chip part-original">ORIG</span>'
          : '<span class="part-chip">P' + o.partInfo.part + '/' + o.partInfo.of + '</span>';
      }
      var prBadge = o.priority ? '<span class="priority-badge">Priority</span>' : '';
      var prBtnCls = 'priority-btn' + (o.priority ? ' is-priority' : '');
      var prBtnLabel = o.priority ? '★ Priority' : '☆ Priority';
      html += '<tr class="clickable-row' + (selected ? ' selected-row' : '') + (o.priority ? ' priority-row' : '') + '" data-pid="' + escapeAttr(o.id) + '">'
           +   '<td><b>' + escapeHtml(o.orderNo || '—') + '</b>' + partChip + prBadge + '</td>'
           +   '<td>' + escapeHtml(o.estimateNo || '—') + '</td>'
           +   '<td>' + escapeHtml(o.partyName || '—') + '</td>'
           +   '<td>' + escapeHtml(o.workshop || '—') + '</td>'
           +   '<td>' + escapeHtml(o.productGroup || '—') + '</td>'
           +   '<td>' + formatNumber(o.totalQty) + '</td>'
           +   '<td>' + formatNumber2(o.totalWeight) + '</td>'
           +   '<td>' + (iso ? formatDate(iso) : '—') + '</td>'
           +   '<td>'
           +     '<button type="button" class="link-button" data-pselect="' + escapeAttr(o.id) + '">Manage</button> '
           +     '<button type="button" class="' + prBtnCls + '" data-priority="' + escapeAttr(o.id) + '">' + prBtnLabel + '</button>'
           +   '</td>'
           + '</tr>';
    });

    html += '</tbody></table></div>';
    pendingList.innerHTML = html;

    pendingList.querySelectorAll('[data-pid]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.tagName === 'BUTTON') return;
        showPendingTransferBar(tr.dataset.pid);
        renderPendingOrders();
      });
    });
    pendingList.querySelectorAll('[data-pselect]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        showPendingTransferBar(b.dataset.pselect);
        renderPendingOrders();
      });
    });
    pendingList.querySelectorAll('[data-priority]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePendingPriority(b.dataset.priority);
      });
    });

    if (pendingSelectedId) showPendingTransferBar(pendingSelectedId);
  }

  /* ============================================================
     PRIORITY TOGGLE & NOTIFICATION
     ============================================================ */
  function togglePendingPriority(orderId) {
    if (!orderId) return;
    var orders = _readJSON(ORDERS_KEY, []);
    if (!Array.isArray(orders)) orders = [];
    var idx = orders.findIndex(function (o) { return o.id === orderId; });
    if (idx === -1) { alert('Order not found.'); return; }
    var o = orders[idx];
    o.priority = !o.priority;
    o.priorityAt = o.priority ? new Date().toISOString() : null;
    o.priorityBy = o.priority ? ((session && session.username) || 'HO') : null;
    orders[idx] = o;
    saveJSON(ORDERS_KEY, orders);

    var st = $id('pendingStatus');
    if (st) {
      st.textContent = o.priority
        ? '★ Order ' + (o.orderNo || '') + ' marked as PRIORITY.'
        : '☆ Priority removed from order ' + (o.orderNo || '') + '.';
    }
    
    // WhatsApp Notification to Logged-in User & Internal Chat
    if (o.priority && session && session.phone) {
      var phone = String(session.phone).replace(/\D/g, '');
      if (phone.length === 10) phone = '91' + phone; // Add country code for India
      
      var msg = '*★ PRIORITY ORDER ALERT ★*\n\n'
              + 'Order No: ' + (o.orderNo || '') + '\n'
              + 'Party: ' + (o.partyName || '') + '\n'
              + 'Group: ' + (o.productGroup || '') + '\n'
              + 'Qty: ' + formatNumber(o.totalQty) + ' pcs\n'
              + 'Wt: ' + formatNumber2(o.totalWeight) + ' g\n'
              + 'Workshop: ' + (o.workshop || '') + '\n\n'
              + 'Please prioritize this order in production.';
              
      // 1. Open WhatsApp link
      if (phone.length >= 10) {
        var waUrl = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
        window.open(waUrl, '_blank');
      } else {
        // Fallback if phone is missing, open general WhatsApp with text
        window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
      }

      // 2. Add to Internal Chat (gp-chat.js integration)
      try {
        var chatLog = _readJSON('gp_internal_notifications', []);
        if (!Array.isArray(chatLog)) chatLog = [];
        chatLog.push({
          id: 'notif_' + Date.now(),
          to: o.workshop || 'All',
          from: 'SYSTEM',
          message: '★ PRIORITY ORDER: ' + (o.orderNo || '') + ' for ' + (o.partyName || ''),
          type: 'priority_alert',
          timestamp: Date.now()
        });
        // Keep last 100
        if (chatLog.length > 100) chatLog = chatLog.slice(chatLog.length - 100);
        saveJSON('gp_internal_notifications', chatLog);
      } catch(e) { console.warn('Could not save internal chat notification', e); }
    }
    
    renderPendingOrders();
  }

  function transferPendingOrder() {
    if (!pendingSelectedId) { alert('Select an order row first.'); return; }

    var count = getPendingSplitCount();

    if (count <= 1) {
      var sel = $id('ptbWorkshopSelect');
      var target = sel ? String(sel.value || '').trim() : '';
      if (!target) { alert('Please choose a workshop to transfer to.'); sel && sel.focus(); return; }

      var orders = _readJSON(ORDERS_KEY, []);
      if (!Array.isArray(orders)) orders = [];
      var idx = orders.findIndex(function (o) { return o.id === pendingSelectedId; });
      if (idx === -1) { alert('Order not found.'); return; }

      var o = orders[idx];
      if (String(o.workshop || '').toLowerCase() === target.toLowerCase()) {
        alert('Order is already in ' + target + '.'); return;
      }

      var fromWs = o.workshop || '—';
      if (!confirm('Transfer order ' + (o.orderNo || '') + '\nfrom  ' + fromWs + '\nto  ' + target + ' ?')) return;

      o.transfers = Array.isArray(o.transfers) ? o.transfers : [];
      o.transfers.push({
        from: fromWs,
        to: target,
        at: new Date().toISOString(),
        by: (session && session.username) || 'HO'
      });
      o.workshop = target;
      o.updatedAt = new Date().toISOString();

      orders[idx] = o;
      saveJSON(ORDERS_KEY, orders);

      var st = $id('pendingStatus');
      if (st) st.textContent = '✅ Order ' + (o.orderNo || '') + ' transferred from ' + fromWs + ' → ' + target + '.';

      pendingSelectedId = null;
      _lastSplitBarOrderId = null;
      showPendingTransferBar(null);
      renderPendingOrders();
      return;
    }

    var val = validatePendingSplit();
    if (!val.ok) {
      alert('Split configuration is not valid:\n\n' + val.msg);
      return;
    }

    var orders2 = _readJSON(ORDERS_KEY, []);
    if (!Array.isArray(orders2)) orders2 = [];
    var idx2 = orders2.findIndex(function (o) { return o.id === pendingSelectedId; });
    if (idx2 === -1) { alert('Order not found.'); return; }

    var original = orders2[idx2];
    var baseOrderNo = String(original.orderNo || '');
    var nowIso = new Date().toISOString();
    var username = (session && session.username) || 'HO';

    var partsCreated = [];

    for (var p = 0; p < pendingSplitParts.length; p++) {
      var part = pendingSplitParts[p];
      var partWs = pendingSplitPartWorkshops[p];
      if (!partWs) { alert('Part ' + (p + 1) + ': workshop not set.'); return; }

      var partItems = [];
      (original.items || []).forEach(function (it) {
        var art = String(it.artNo);
        var qtyInPart = Number(part.quantities[art] || 0);
        if (qtyInPart <= 0) return;
        partItems.push({
          artNo: it.artNo,
          name: it.name,
          heightInch: it.heightInch,
          sizeMm: it.sizeMm,
          group: it.group,
          sheet: it.sheet,
          weight: Number(it.weight || 0),
          quantity: qtyInPart,
          totalWeight: Number(it.weight || 0) * qtyInPart,
          image: it.image || ''
        });
      });

      var coalesced = [], byArt = {};
      partItems.forEach(function (x) {
        var k = String(x.artNo);
        if (byArt[k]) {
          byArt[k].quantity += x.quantity;
          byArt[k].totalWeight += x.totalWeight;
        } else {
          byArt[k] = x;
          coalesced.push(x);
        }
      });

      var partQty = coalesced.reduce(function (s, x) { return s + Number(x.quantity || 0); }, 0);
      var partWt  = coalesced.reduce(function (s, x) { return s + Number(x.totalWeight || 0); }, 0);

      var splitOrder = JSON.parse(JSON.stringify(original));
      splitOrder.id          = 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_S' + (p + 1);
      splitOrder.orderNo     = baseOrderNo + '/' + partSuffix(p);
      splitOrder.workshop    = partWs;
      splitOrder.items       = coalesced;
      splitOrder.totalQty    = partQty;
      splitOrder.totalWeight = partWt;
      splitOrder.updatedAt   = nowIso;
      splitOrder.partInfo    = {
        part: p + 1,
        of: pendingSplitParts.length,
        splitOf: original.estimateNo || null,
        parentOrderNo: baseOrderNo,
        isOriginal: false,
        workshop: partWs
      };
      splitOrder.transfers = Array.isArray(original.transfers) ? original.transfers.slice() : [];
      splitOrder.transfers.push({
        from: original.workshop || '—',
        to: partWs,
        at: nowIso,
        by: username,
        kind: 'split',
        part: p + 1
      });

      partsCreated.push(splitOrder);
    }

    if (!confirm(
      'Split order ' + baseOrderNo + ' into ' + partsCreated.length + ' part(s)?\n\n' +
      partsCreated.map(function (o) { return '  ' + o.orderNo + '  →  ' + o.workshop + '  (qty ' + o.totalQty + ')'; }).join('\n') +
      '\n\nThe original order ' + baseOrderNo + ' will be replaced by these parts.'
    )) return;

    orders2.splice(idx2, 1);
    partsCreated.forEach(function (po) { orders2.push(po); });
    saveJSON(ORDERS_KEY, orders2);

    var st2 = $id('pendingStatus');
    if (st2) {
      st2.textContent = '✅ Order ' + baseOrderNo + ' split into ' + partsCreated.length +
                       ' part(s): ' + partsCreated.map(function (o) { return o.orderNo + ' → ' + o.workshop; }).join('  |  ');
    }

    pendingSelectedId = null;
    _lastSplitBarOrderId = null;
    showPendingTransferBar(null);
    renderPendingOrders();
  }

  function cancelPendingOrder() {
    if (!pendingSelectedId) { alert('Select an order row first.'); return; }

    var orders = _readJSON(ORDERS_KEY, []);
    if (!Array.isArray(orders)) orders = [];
    var idx = orders.findIndex(function (o) { return o.id === pendingSelectedId; });
    if (idx === -1) { alert('Order not found.'); return; }

    var o = orders[idx];
    var reason = prompt(
      'Cancel order ' + (o.orderNo || '') + ' (' + (o.partyName || '') + ')?\n\n' +
      'Enter a reason (optional):', ''
    );
    if (reason === null) return;
    if (!confirm('Confirm CANCEL of order ' + (o.orderNo || '') + '?\nThis removes it from Pending Orders.')) return;

    o.status      = 'cancelled';
    o.cancelledAt = new Date().toISOString();
    o.cancelledBy = (session && session.username) || 'HO';
    o.cancelReason = reason || '';
    orders[idx] = o;
    saveJSON(ORDERS_KEY, orders);

    var st = $id('pendingStatus');
    if (st) st.textContent = '🗑 Order ' + (o.orderNo || '') + ' cancelled.';

    pendingSelectedId = null;
    _lastSplitBarOrderId = null;
    showPendingTransferBar(null);
    renderPendingOrders();
  }

  (function wirePendingControls() {
    var map = {
      pfParty: 'party', pfWorkshop: 'workshop', pfGroup: 'group',
      pfFromDate: 'from', pfToDate: 'to'
    };
    Object.keys(map).forEach(function (id) {
      var el = $id(id); if (!el) return;
      var key = map[id];
      var evt = (el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(evt, function () {
        pendingFilters[key] = el.value || '';
        renderPendingOrders();
      });
    });

    var prSel = $id('pfPriority');
    if (prSel) prSel.addEventListener('change', function () {
      pendingFilters.priority = prSel.value || '';
      renderPendingOrders();
    });

    var resetBtn = $id('pfResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      pendingFilters = { party: '', workshop: '', group: '', from: '', to: '', priority: '' };
      ['pfParty', 'pfWorkshop', 'pfGroup', 'pfFromDate', 'pfToDate', 'pfPriority'].forEach(function (id) {
        var el = $id(id); if (el) el.value = '';
      });
      renderPendingOrders();
    });

    var transferBtn = $id('ptbTransferBtn');
    if (transferBtn) transferBtn.addEventListener('click', transferPendingOrder);

    var cancelBtn = $id('ptbCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelPendingOrder);

    var closeBarBtn = $id('ptbCloseBtn');
    if (closeBarBtn) closeBarBtn.addEventListener('click', function () {
      _lastSplitBarOrderId = null;
      showPendingTransferBar(null);
      renderPendingOrders();
    });

    var splitCountEl = $id('ptbSplitCount');
    if (splitCountEl) {
      splitCountEl.addEventListener('change', function () {
        resetPendingSplitState();
      });
    }
    var aq = $id('ptbSplitAutoByQtyBtn');
    if (aq) aq.addEventListener('click', function () {
      if (pendingSplitParts.length > 1) autoSplitPendingByQty();
    });
    var aa = $id('ptbSplitAutoByArtBtn');
    if (aa) aa.addEventListener('click', function () {
      if (pendingSplitParts.length > 1) autoSplitPendingByArt();
    });
    var an = $id('ptbSplitAutoByNameBtn');
    if (an) an.addEventListener('click', function () {
      if (pendingSplitParts.length > 1) autoSplitPendingByName();
    });
    var rs = $id('ptbSplitResetBtn');
    if (rs) rs.addEventListener('click', function () {
      resetPendingSplitState();
    });
  })();

  if (pendingTopBtn) pendingTopBtn.addEventListener('click', function () {
    pendingSelectedId = null;
    _lastSplitBarOrderId = null;
    showPendingTransferBar(null);
    renderPendingOrders();
    pendingModal.classList.remove('hidden');
  });
  if (closePending) closePending.addEventListener('click', function () {
    pendingModal.classList.add('hidden');
    pendingSelectedId = null;
    _lastSplitBarOrderId = null;
    showPendingTransferBar(null);
  });

  /* ============================================================
     TOP BAR — new estimation
     ============================================================ */
  if (newEstimationTopBtn) newEstimationTopBtn.addEventListener('click', function () {
    resetFormToStart();
  });

  /* ============================================================
     NOTE field — Enter jumps focus to the NEXT button
     ============================================================ */
  (function wireNoteEnterToNext() {
    var note = document.getElementById('note');
    var next = document.getElementById('nextBtn');
    if (!note || !next) return;

    note.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

      e.preventDefault();
      next.focus();
    });
  })();

  /* ============================================================
     INIT — wait until Railway is the current shared data source
     ============================================================ */
  gpOrderSharedReady.then(function () {
    if (groupSelect) currentGroupFilter = String(groupSelect.value || '3D IDOLS').toUpperCase();
    loadProductCatalog();
    renderItems();
    renderPartyList('');
    console.log('[order-form.js] Ready; shared data loaded:', GP_ORDER_SHARED.ready);
    console.log('[order-form.js] Existing estimations:', (_readJSON(ESTIMATIONS_KEY, []) || []).length);
    console.log('[order-form.js] Existing orders:', (_readJSON(ORDERS_KEY, []) || []).length);
  });

})();

/* ============================================================
   PARTY STEP — Enter key moves to next field (like Tab)
   ============================================================ */
(function wireEnterToTabInPartyStep() {
  var step = document.getElementById('partyStep');
  if (!step) return;

  function shouldSkip(el) {
    if (!el) return true;
    var tag = (el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag === 'BUTTON')   return true;
    if (el.type === 'hidden') return true;
    if (el.id === 'partyClearBtn') return true;
    return false;
  }

  function isPartyListOpen() {
    var list = document.getElementById('partyList');
    return !!(list && list.classList.contains('show'));
  }

  step.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

    var target = e.target;
    if (shouldSkip(target)) return;

    if (target.id === 'partySearchInput' && isPartyListOpen()) return;

    var focusables = Array.prototype.slice.call(
      step.querySelectorAll(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), ' +
        'select:not([disabled]), ' +
        'textarea:not([disabled]), ' +
        'button:not([disabled])'
      )
    ).filter(function (el) {
      if (el.offsetParent === null) return false;
      if (el.id === 'partyClearBtn') return false;
      if (el.type === 'hidden') return false;
      if (el.readOnly) return false;
      return true;
    });

    var idx = focusables.indexOf(target);
    if (idx === -1) return;

    e.preventDefault();

    if (idx < focusables.length - 1) {
      var next = focusables[idx + 1];
      next.focus();
      if (typeof next.select === 'function' &&
          (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA')) {
        try { next.select(); } catch (err) {}
      }
    } else {
      var nextBtnEl = document.getElementById('nextBtn');
      if (nextBtnEl) nextBtnEl.focus();
    }
  }, true);
})();