/* GP Portal shared-data bridge.
 * Keeps the legacy localStorage API working while persisting gp_* application records
 * in PostgreSQL, so different browsers/devices see the same data.
 */
(function () {
  'use strict';
  if (window.__GP_CLOUD_SYNC__) return;
  window.__GP_CLOUD_SYNC__ = true;

  var API = '/api/app-data';
  var PRIVATE = { gp_jwt:1, gp_logged_user:1, gp_orig_role:1, gp_cloud_migration_v1:1 };
  var lastLocal = Object.create(null);
  var knownRemote = Object.create(null);
  var busy = false;
  var pending = Object.create(null);
  var timer = 0;

  function token() { try { return localStorage.getItem('gp_jwt') || ''; } catch (_) { return ''; } }
  function isShared(k) { return /^gp_[a-z0-9_-]{1,120}$/i.test(k) && !PRIVATE[k]; }
  function request(method, payload, sync) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, API, !sync);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token());
    if (payload !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
    try { xhr.send(payload === undefined ? null : JSON.stringify(payload)); }
    catch (_) { return null; }
    if (sync) {
      if (xhr.status < 200 || xhr.status >= 300) return null;
      try { return JSON.parse(xhr.responseText); } catch (_) { return null; }
    }
    return xhr;
  }
  function readLocal() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!isShared(k)) continue;
      try { out[k] = JSON.parse(localStorage.getItem(k)); } catch (_) {}
    }
    return out;
  }
  function same(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; } }
  function mergeArray(local, remote) {
    var out = [], seen = Object.create(null);
    (Array.isArray(remote) ? remote : []).concat(Array.isArray(local) ? local : []).forEach(function (item) {
      var id = item && typeof item === 'object' && (item.id != null ? 'id:' + item.id : item._id != null ? '_id:' + item._id : null);
      var key = id || JSON.stringify(item);
      if (!seen[key]) { seen[key] = true; out.push(item); }
    });
    return out;
  }
  function setLocal(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      lastLocal[k] = JSON.stringify(v);
    } catch (_) {}
  }
  function initialSync() {
    if (!token()) return;
    var result = request('GET', undefined, true);
    if (!result || !result.items) return;
    var local = readLocal(), remote = result.items, upload = {};
    Object.keys(local).forEach(function (k) {
      var lv = local[k];
      if (!Object.prototype.hasOwnProperty.call(remote, k)) upload[k] = lv;
      else if (Array.isArray(lv) && Array.isArray(remote[k].value)) {
        var merged = mergeArray(lv, remote[k].value);
        if (!same(merged, remote[k].value)) upload[k] = merged;
      } else if (lv && remote[k].value && typeof lv === 'object' && typeof remote[k].value === 'object' && !Array.isArray(lv) && !Array.isArray(remote[k].value)) {
        var obj = Object.assign({}, lv, remote[k].value);
        if (!same(obj, remote[k].value)) upload[k] = obj;
      }
    });
    Object.keys(remote).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(upload, k)) setLocal(k, remote[k].value);
      knownRemote[k] = JSON.stringify(remote[k].value);
    });
    if (Object.keys(upload).length) {
      var saved = request('PUT', { items: upload }, true);
      if (saved) Object.keys(upload).forEach(function (k) { setLocal(k, upload[k]); knownRemote[k] = JSON.stringify(upload[k]); });
    }
    Object.keys(readLocal()).forEach(function (k) { lastLocal[k] = localStorage.getItem(k); });
    try { localStorage.setItem('gp_cloud_migration_v1', '1'); } catch (_) {}
  }
  function flush() {
    if (busy || !token()) return;
    var items = {};
    Object.keys(pending).forEach(function (k) { items[k] = pending[k]; delete pending[k]; });
    if (!Object.keys(items).length) return;
    busy = true;
    var xhr = request('PUT', { items: items }, false);
    if (!xhr) { busy = false; return; }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      busy = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        Object.keys(items).forEach(function (k) { knownRemote[k] = JSON.stringify(items[k]); });
      } else {
        Object.keys(items).forEach(function (k) { if (!(k in pending)) pending[k] = items[k]; });
      }
    };
  }
  function schedule(k, value) {
    if (!isShared(k) || !token()) return;
    pending[k] = value;
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  // Hydrate synchronously before legacy inline scripts and page bundles read localStorage.
  initialSync();

  var nativeSet = Storage.prototype.setItem;
  var nativeRemove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) {
    nativeSet.call(this, k, v);
    if (this === localStorage && isShared(String(k))) {
      var parsed; try { parsed = JSON.parse(String(v)); } catch (_) { parsed = String(v); }
      lastLocal[k] = String(v);
      schedule(String(k), parsed);
    }
  };
  Storage.prototype.removeItem = function (k) {
    nativeRemove.call(this, k);
    if (this === localStorage && isShared(String(k)) && token()) {
      var xhr = new XMLHttpRequest();
      xhr.open('DELETE', API + '/' + encodeURIComponent(k), true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token());
      xhr.send();
      delete knownRemote[k]; delete lastLocal[k];
    }
  };

  // Poll other devices. Do not overwrite a key changed locally since the last poll.
  setInterval(function () {
    if (!token() || busy) return;
    var xhr = request('GET', undefined, false);
    if (!xhr) return;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4 || xhr.status < 200 || xhr.status >= 300) return;
      var data; try { data = JSON.parse(xhr.responseText).items || {}; } catch (_) { return; }
      Object.keys(data).forEach(function (k) {
        var remote = JSON.stringify(data[k].value);
        var localNow = localStorage.getItem(k);
        if (remote !== knownRemote[k] && localNow === lastLocal[k]) {
          try { nativeSet.call(localStorage, k, remote); } catch (_) {}
          lastLocal[k] = remote;
        } else if (remote !== knownRemote[k] && localNow !== lastLocal[k]) {
          var v; try { v = JSON.parse(localNow); } catch (_) { v = localNow; }
          pending[k] = v;
        }
        knownRemote[k] = remote;
      });
      flush();
    };
  }, 5000);
})();
