/* GP Portal cross-browser data bridge.
 * Shares legacy gp_* collections through the existing versioned PostgreSQL portal_data API.
 * Login tokens and browser session identity are never uploaded.
 */
(function () {
  'use strict';
  if (window.__GP_CLOUD_SYNC__) return;
  window.__GP_CLOUD_SYNC__ = true;

  var API_BASE = String(window.GP_API_BASE || 'https://test-production-313c31af.up.railway.app').replace(/\/+$/, '');
  var API = API_BASE + '/api/inventory';
  var PRIVATE = {
    gp_jwt:1, gp_logged_user:1, gp_orig_role:1, gp_pending_user:1,
    gp_user:1, gp_current_user:1, gp_cloud_migration_v1:1
  };
  var DIRECTORY = {
    gp_portal_users:1, gp_designer_users:1, gp_cad_designer_users:1,
    gp_post_production_users:1, gp_stone_stock_users:1
  };
  var ADMIN_ONLY = {
    gp_pending_logins:1, gp_admin_mobile:1, gp_device_access:1, gp_telegram_config:1
  };
  var STONE_ONLY = {
    gp_stone_catalogue:1, gp_stone_opening:1, gp_stone_purchase_orders:1,
    gp_stone_issue_orders:1, gp_stone_return_orders:1, gp_stone_damage:1,
    gp_stone_purchase_return:1, gp_stone_lowstock_dismissed:1
  };

  var nativeSet = Storage.prototype.setItem;
  var nativeRemove = Storage.prototype.removeItem;
  var knownRemote = Object.create(null);
  var versions = Object.create(null);
  var lastLocal = Object.create(null);
  var pending = Object.create(null);
  var queues = Object.create(null);
  var syncedToken = '';
  var pollBusy = false;

  function token() {
    try { return localStorage.getItem('gp_jwt') || ''; } catch (_) { return ''; }
  }
  function role() {
    try {
      var user = JSON.parse(sessionStorage.getItem('gp_logged_user') || 'null');
      return user && user.role ? String(user.role) : '';
    } catch (_) { return ''; }
  }
  function privileged() { return role() === 'admin' || role() === 'developer'; }
  function canWrite(key) {
    if (DIRECTORY[key] || ADMIN_ONLY[key]) return privileged();
    if (STONE_ONLY[key]) return privileged() || role() === 'stone_stock';
    return true;
  }
  function isShared(key) {
    return (/^gp_[a-z0-9_-]{1,120}$/i.test(key) || key === 'goldprince_parties' || /^orderCounter_[a-z0-9 _-]{1,80}$/i.test(key)) && !PRIVATE[key];
  }
  function json(value) {
    try { return JSON.stringify(value); } catch (_) { return ''; }
  }
  function same(a, b) { return json(a) === json(b); }
  function setLocal(key, value) {
    try {
      nativeSet.call(localStorage, key, json(value));
      lastLocal[key] = json(value);
    } catch (_) {}
  }
  function mergeArray(key, remote, local) {
    var out = Array.isArray(remote) ? remote.map(function (x) { return x; }) : [];
    var index = Object.create(null);
    function identity(item) {
      if (item && typeof item === 'object') {
        if (item.id != null) return 'id:' + item.id;
        if (item._id != null) return '_id:' + item._id;
        if (item.art != null) return 'art:' + item.art;
        if (item.partyId != null) return 'party:' + item.partyId;
        if (item.partyCode != null) return 'party:' + item.partyCode;
        if (item.code != null) return 'party:' + item.code;
        if (item.name != null) return 'name:' + String(item.name).toLowerCase();
        if (item.username != null) return 'user:' + String(item.username).toLowerCase();
      }
      return 'value:' + json(item);
    }
    out.forEach(function (item, i) { index[identity(item)] = i; });
    (Array.isArray(local) ? local : []).forEach(function (item) {
      var id = identity(item);
      if (Object.prototype.hasOwnProperty.call(index, id)) {
        var at = index[id], existing = out[at];
        if (existing && item && typeof existing === 'object' && typeof item === 'object' && !Array.isArray(existing) && !Array.isArray(item)) {
          out[at] = Object.assign({}, existing, item);
        }
      } else {
        index[id] = out.length;
        out.push(item);
      }
    });
    return out;
  }
  function mergeValue(key, remote, local) {
    if (remote == null) return local;
    if (local == null) return remote;
    if (/counter|_bump$/i.test(key) && typeof remote !== 'object' && typeof local !== 'object') {
      return Math.max(Number(remote) || 0, Number(local) || 0);
    }
    if (Array.isArray(remote) && Array.isArray(local)) return mergeArray(key, remote, local);
    if (remote && local && typeof remote === 'object' && typeof local === 'object' && !Array.isArray(remote) && !Array.isArray(local)) {
      return Object.assign({}, remote, local);
    }
    return local;
  }
  function getSync() {
    var xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', API, false);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token());
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.send(null);
      if (xhr.status < 200 || xhr.status >= 300) return null;
      return JSON.parse(xhr.responseText);
    } catch (_) { return null; }
  }
  function putSync(key, value, version) {
    var next = value, expected = Number(version || 0);
    for (var attempt = 0; attempt < 5; attempt++) {
      var xhr = new XMLHttpRequest();
      try {
        xhr.open('PUT', API + '/' + encodeURIComponent(key), false);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token());
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ value: next, expectedVersion: expected }));
      } catch (_) { return false; }
      var data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) {}
      if (xhr.status >= 200 && xhr.status < 300) {
        versions[key] = Number(data.version || 0);
        knownRemote[key] = json(data.value);
        setLocal(key, data.value);
        return true;
      }
      if (xhr.status === 403) return false;
      if (xhr.status !== 409) return false;
      expected = Number(data.version || 0);
      next = mergeValue(key, data.value, next);
    }
    return false;
  }
  function initialSync() {
    if (!token()) return false;
    var snapshot = getSync();
    if (!snapshot || !snapshot.data) return false;
    var remote = snapshot.data || {};
    versions = snapshot.versions || {};
    knownRemote = Object.create(null);
    lastLocal = Object.create(null);
    var local = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!isShared(key)) continue;
      try { local[key] = JSON.parse(localStorage.getItem(key)); }
      catch (_) { local[key] = localStorage.getItem(key); }
    }

    Object.keys(remote).forEach(function (key) {
      if (!isShared(key)) return;
      var remoteValue = remote[key];
      knownRemote[key] = json(remoteValue);
      if (DIRECTORY[key] && !privileged()) {
        // Non-admin users receive a redacted directory from the API; use that safe copy locally.
        setLocal(key, remoteValue);
      } else if (Object.prototype.hasOwnProperty.call(local, key)) {
        var merged = mergeValue(key, remoteValue, local[key]);
        if (!same(merged, remoteValue) && canWrite(key)) {
          if (!putSync(key, merged, versions[key])) pending[key] = merged;
        } else setLocal(key, merged);
      } else {
        setLocal(key, remoteValue);
      }
    });

    Object.keys(local).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(remote, key) || !canWrite(key)) return;
      if (!putSync(key, local[key], 0)) pending[key] = local[key];
    });

    for (var j = 0; j < localStorage.length; j++) {
      var k = localStorage.key(j);
      if (isShared(k)) lastLocal[k] = localStorage.getItem(k);
    }
    try { nativeSet.call(localStorage, 'gp_cloud_migration_v1', '1'); } catch (_) {}
    return true;
  }

  async function putAsync(key, value) {
    var next = value, expected = Number(versions[key] || 0);
    for (var attempt = 0; attempt < 5; attempt++) {
      var response;
      try {
        response = await fetch(API + '/' + encodeURIComponent(key), {
          method:'PUT',
          headers:{ 'Authorization':'Bearer ' + token(), 'Content-Type':'application/json' },
          body:JSON.stringify({ value:next, expectedVersion:expected })
        });
      } catch (_) { return false; }
      var data = await response.json().catch(function () { return {}; });
      if (response.ok) {
        versions[key] = Number(data.version || 0);
        knownRemote[key] = json(data.value);
        return true;
      }
      if (response.status === 403) return false;
      if (response.status !== 409) return false;
      expected = Number(data.version || 0);
      next = mergeValue(key, data.value, next);
      setLocal(key, next);
    }
    return false;
  }
  function schedule(key, value) {
    if (!isShared(key) || !token() || !canWrite(key)) return;
    pending[key] = value;
    if (queues[key]) return;
    queues[key] = Promise.resolve().then(async function () {
      while (Object.prototype.hasOwnProperty.call(pending, key)) {
        var next = pending[key];
        delete pending[key];
        var ok = await putAsync(key, next);
        if (!ok) {
          if (token() && canWrite(key)) pending[key] = next;
          break;
        }
        lastLocal[key] = localStorage.getItem(key);
      }
    }).catch(function (error) {
      console.warn('[GP Portal] shared-data save failed for ' + key, error);
    }).finally(function () {
      delete queues[key];
    });
  }
  async function deleteRemote(key) {
    if (!isShared(key) || !token() || !canWrite(key)) return;
    var expected = Number(versions[key] || 0);
    try {
      var response = await fetch(API + '/' + encodeURIComponent(key) + '?expectedVersion=' + expected, {
        method:'DELETE', headers:{ 'Authorization':'Bearer ' + token() }
      });
      var data = await response.json().catch(function () { return {}; });
      if (response.status === 409 && data.value != null) {
        versions[key] = Number(data.version || 0);
        setLocal(key, data.value);
        knownRemote[key] = json(data.value);
      } else if (response.ok) {
        delete knownRemote[key]; delete versions[key]; delete lastLocal[key];
      }
    } catch (_) {}
  }
  function poll() {
    if (!token() || pollBusy || Object.keys(queues).length) return;
    pollBusy = true;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API, true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token());
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      pollBusy = false;
      if (xhr.status < 200 || xhr.status >= 300) return;
      var snapshot;
      try { snapshot = JSON.parse(xhr.responseText); } catch (_) { return; }
      var remote = snapshot.data || {}, remoteVersions = snapshot.versions || {};
      Object.keys(knownRemote).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(remote, key) && localStorage.getItem(key) === lastLocal[key]) {
          try { nativeRemove.call(localStorage, key); } catch (_) {}
          delete knownRemote[key]; delete versions[key]; delete lastLocal[key];
        }
      });
      Object.keys(remote).forEach(function (key) {
        if (!isShared(key)) return;
        var value = json(remote[key]), localNow = localStorage.getItem(key);
        if (value !== knownRemote[key]) {
          if (DIRECTORY[key] && !privileged()) {
            setLocal(key, remote[key]);
          } else if (localNow === lastLocal[key] || (localNow === null && lastLocal[key] === undefined)) {
            setLocal(key, remote[key]);
          } else if (canWrite(key)) {
            var localValue;
            try { localValue = JSON.parse(localNow); } catch (_) { localValue = localNow; }
            schedule(key, mergeValue(key, remote[key], localValue));
          }
        }
        knownRemote[key] = value;
        versions[key] = Number(remoteVersions[key] || 0);
      });
      Object.keys(pending).forEach(function (key) {
        if (!queues[key] && canWrite(key)) schedule(key, pending[key]);
      });
    };
    try { xhr.send(null); } catch (_) { pollBusy = false; }
  }

  // Hydrate before page scripts run when a token already exists. After login, the
  // next page load or periodic token check performs the first migration.
  var current = token();
  if (current && initialSync()) syncedToken = current;

  Storage.prototype.setItem = function (key, value) {
    nativeSet.call(this, key, value);
    if (this === localStorage && isShared(String(key))) {
      var parsed;
      try { parsed = JSON.parse(String(value)); } catch (_) { parsed = String(value); }
      lastLocal[key] = String(value);
      schedule(String(key), parsed);
    }
  };
  Storage.prototype.removeItem = function (key) {
    nativeRemove.call(this, key);
    if (this === localStorage && isShared(String(key))) {
      delete pending[key];
      delete lastLocal[key];
      deleteRemote(String(key));
    }
  };

  setInterval(function () {
    var currentToken = token();
    if (currentToken && currentToken !== syncedToken) {
      knownRemote = Object.create(null);
      versions = Object.create(null);
      lastLocal = Object.create(null);
      pending = Object.create(null);
      if (initialSync()) syncedToken = currentToken;
      return;
    }
    poll();
  }, 5000);
})();