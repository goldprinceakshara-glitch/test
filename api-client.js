// api-client.js — replaces localStorage calls in index.html / manage-admin.html
'use strict';

const GP_API = {
  base: window.GP_API_BASE || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:4000' : ''),
  tokenKey: 'gp_jwt',

  getToken() { return localStorage.getItem(this.tokenKey) || ''; },
  setToken(t) { t ? localStorage.setItem(this.tokenKey, t) : localStorage.removeItem(this.tokenKey); },

  async req(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && this.getToken()) headers.Authorization = 'Bearer ' + this.getToken();
    const r = await fetch(this.base + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 202) throw Object.assign(new Error(data.error || r.statusText), { status: r.status, data });
    return { status: r.status, data };
  },

  /* ---- Auth ---- */
  login(username, password, deviceId) {
    return this.req('/api/auth/login', {
      method: 'POST', auth: false,
      body: { username, password, deviceId, userAgent: navigator.userAgent }
    });
  },
  pendingStatus(username, deviceId) {
    return this.req(`/api/auth/pending-status?username=${encodeURIComponent(username)}&deviceId=${encodeURIComponent(deviceId)}`, { auth: false });
  },
  me() { return this.req('/api/auth/me'); },

  /* ---- Accounts ---- */
  listAccounts(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.req('/api/accounts' + (q ? '?' + q : ''));
  },
  counts() { return this.req('/api/accounts/counts'); },
  createAccount(payload) { return this.req('/api/accounts', { method: 'POST', body: payload }); },
  updateAccount(id, payload) { return this.req('/api/accounts/' + id, { method: 'PUT', body: payload }); },
  deleteAccount(id) { return this.req('/api/accounts/' + id, { method: 'DELETE' }); },

  /* ---- Device requests ---- */
  listDeviceRequests() { return this.req('/api/device-requests'); },
  approveDeviceRequest(id) { return this.req(`/api/device-requests/${id}/approve`, { method: 'POST' }); },
  rejectDeviceRequest(id)  { return this.req(`/api/device-requests/${id}/reject`,  { method: 'POST' }); },
  listDevices() { return this.req('/api/devices'); },
  deleteDevice(id) { return this.req('/api/devices/' + id, { method: 'DELETE' }); }
};

window.GP_API = GP_API;