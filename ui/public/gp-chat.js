/* ============================================================
   gp-chat.js — Internal chat for GP Portal
   + Voice / Image / Video support
   + WhatsApp-style read receipts (✓ sent, ✓✓ read)
   + Clear chat option
   + NO restrictions: every logged-in user can chat with every other user

   Storage key: gp_chat_messages
   Media messages store: { type:'text'|'image'|'audio'|'video',
                           media:dataURL, mime, name, duration }
   ============================================================ */
(function () {
  'use strict';

  var MSG_KEY = 'gp_chat_messages';
  var MAX_MESSAGES = 5000;
  var SESSION_KEYS = ['gp_logged_user', 'gp_user', 'logged_user', 'gp_current_user', 'currentUser'];

  /* media limits (client-side compression happens before this check) */
  var MAX_IMAGE_DIM = 1280;
  var MAX_VIDEO_BYTES = 8 * 1024 * 1024;   // 8 MB
  var MAX_VIDEO_SECONDS = 20;
  var MAX_VIDEO_DIM = 960;
  var MAX_AUDIO_SECONDS = 120;             // 2 min

  var MY_NAME = '';
  var MY_ROLE = '';
  var GP_CHAT_USERS = [];
  var GP_CHAT_SYNC = { version:0, pending:null, queue:null, ready:false, polling:false };
  var GP_CHAT_API = String(window.GP_API_BASE || 'https://test-production-313c31af.up.railway.app').replace(/\/+$/, '');
  var started = false;

  var SCRIPT_SRC = '';
  try { SCRIPT_SRC = (document.currentScript && document.currentScript.src) || ''; } catch (e) {}

  /* ---------- helpers ---------- */
  function readJSON(k, fb) {
    try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? fb : v; }
    catch (e) { return fb; }
  }
  function saveJSON(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      if (k === MSG_KEY) queueCloudSave(v);
      return true;
    } catch (e) {
      if (v && Array.isArray(v)) {
        var trimmed = v.filter(function (m) { return !m.media; });
        if (trimmed.length !== v.length) {
          try { localStorage.setItem(k, JSON.stringify(trimmed)); if (k === MSG_KEY) queueCloudSave(trimmed); return true; } catch (e2) {}
        }
      }
      console.warn('[GP Chat] localStorage write failed (quota?)', e);
      showToast('Storage full — old media messages removed to make room.');
      return false;
    }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

  function mergeChatMessages(remote, local) {
    var map = new Map();
    (Array.isArray(remote) ? remote : []).concat(Array.isArray(local) ? local : []).forEach(function (m, i) {
      if (!m || typeof m !== 'object') return;
      var id = String(m.id || (String(m.ts || '') + '|' + String(m.from || '') + '|' + String(m.to || '') + '|' + String(m.text || '') + '|' + i));
      var prior = map.get(id);
      if (!prior) map.set(id, Object.assign({}, m));
      else { var merged = Object.assign({}, prior, m); merged.read = !!(prior.read || m.read); map.set(id, merged); }
    });
    return Array.from(map.values()).sort(function (a,b) { return new Date(a.ts || 0) - new Date(b.ts || 0); }).slice(-MAX_MESSAGES);
  }
  function chatToken() { return localStorage.getItem('gp_jwt') || ''; }
  async function chatSnapshot() {
    var token = chatToken();
    if (!token) throw new Error('Login token missing');
    var r = await fetch(GP_CHAT_API + '/api/inventory', { headers:{ 'Authorization':'Bearer ' + token, 'Cache-Control':'no-cache' }, cache:'no-store' });
    var p = await r.json().catch(function(){ return {}; });
    if (!r.ok) throw new Error(p.error || ('Chat sync failed (' + r.status + ')'));
    return p;
  }
  async function putChatMessages(value) {
    var next = value;
    for (var i=0; i<6; i++) {
      var r = await fetch(GP_CHAT_API + '/api/inventory/' + encodeURIComponent(MSG_KEY), {
        method:'PUT', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + chatToken() },
        body:JSON.stringify({ value:next, expectedVersion:GP_CHAT_SYNC.version })
      });
      var p = await r.json().catch(function(){ return {}; });
      if (r.status === 409) { GP_CHAT_SYNC.version = Number(p.version || 0); next = mergeChatMessages(p.value, next); continue; }
      if (!r.ok) throw new Error(p.error || ('Chat save failed (' + r.status + ')'));
      GP_CHAT_SYNC.version = Number(p.version || 0);
      localStorage.setItem(MSG_KEY, JSON.stringify(p.value || next));
      return p;
    }
    throw new Error('Chat changed repeatedly; retry your message');
  }
  function queueCloudSave(value) {
    GP_CHAT_SYNC.pending = Array.isArray(value) ? value.slice(-MAX_MESSAGES) : [];
    if (!GP_CHAT_SYNC.ready || GP_CHAT_SYNC.queue) return;
    GP_CHAT_SYNC.queue = (async function(){
      while (GP_CHAT_SYNC.pending) { var next = GP_CHAT_SYNC.pending; GP_CHAT_SYNC.pending = null; await putChatMessages(next); }
    })().catch(function(e){
      console.error('[GP Chat] cloud save failed', e);
      GP_CHAT_SYNC.pending = mergeChatMessages(GP_CHAT_SYNC.pending || [], getMessages());
      showToast('Chat not synced yet: ' + e.message);
    }).finally(function(){
      GP_CHAT_SYNC.queue = null;
      if (GP_CHAT_SYNC.pending) setTimeout(function(){ if (GP_CHAT_SYNC.ready && !GP_CHAT_SYNC.queue) queueCloudSave(GP_CHAT_SYNC.pending); }, 5000);
    });
  }
  async function refreshChatUsers() {
    try {
      var r = await fetch(GP_CHAT_API + '/api/chat/users', { headers:{ 'Authorization':'Bearer ' + chatToken(), 'Cache-Control':'no-cache' }, cache:'no-store' });
      if (!r.ok) { console.warn('[GP Chat] user directory request failed (' + r.status + ')'); return; }
      var p = await r.json(); GP_CHAT_USERS = Array.isArray(p.users) ? p.users : [];
      if (started) { lastRenderedSig = ''; renderContacts(); }
    } catch(e) { console.warn('[GP Chat] user directory refresh failed', e); }
  }
  async function refreshCloudChat() {
    if (!GP_CHAT_SYNC.ready || GP_CHAT_SYNC.polling || document.visibilityState === 'hidden' || GP_CHAT_SYNC.queue || GP_CHAT_SYNC.pending) return;
    GP_CHAT_SYNC.polling = true;
    try {
      var p = await chatSnapshot(), remote = p.data && p.data[MSG_KEY];
      var version = Number(p.versions && p.versions[MSG_KEY] || 0);
      if (Array.isArray(remote) && version > GP_CHAT_SYNC.version) {
        GP_CHAT_SYNC.version = version; localStorage.setItem(MSG_KEY, JSON.stringify(remote));
        lastRenderedSig = ''; if (activeContact) renderThread(); renderContacts(); refreshBadge();
      }
    } catch(e) { console.warn('[GP Chat] cloud refresh failed', e); }
    finally { GP_CHAT_SYNC.polling = false; }
  }
  async function initCloudChat() {
    try {
      var p = await chatSnapshot(), remote = p.data && p.data[MSG_KEY], local = getMessages();
      GP_CHAT_SYNC.version = Number(p.versions && p.versions[MSG_KEY] || 0);
      var merged = mergeChatMessages(remote || [], local);
      localStorage.setItem(MSG_KEY, JSON.stringify(merged)); GP_CHAT_SYNC.ready = true;
      if (!Array.isArray(remote) || JSON.stringify(merged) !== JSON.stringify(remote)) queueCloudSave(merged);
      setInterval(refreshCloudChat, 3500);
      window.addEventListener('focus', refreshCloudChat);
    } catch(e) { console.error('[GP Chat] cloud initialization failed', e); showToast('Chat cloud sync unavailable: ' + e.message); setTimeout(function(){ if (!GP_CHAT_SYNC.ready) initCloudChat(); }, 8000); }
  }
  function nowISO() { return new Date().toISOString(); }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var t = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    var today = new Date();
    if (d.toDateString() === today.toDateString()) return t;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + t;
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/[\s_\-]+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }
  function formatBranchDisplayName(branch) {
    if (!branch) return '';
    var b = String(branch).trim();
    if (/^hq$/i.test(b)) return 'HO';
    return b;
  }
  function bytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ---------- toast ---------- */
  var toastEl, toastTimer;
  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'gp-chat-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  /* ---------- session detection ---------- */
  function parseSession(raw) {
    if (!raw) return null;
    var u = null;
    try { u = JSON.parse(raw); } catch (e) { u = raw; }
    if (typeof u === 'string') {
      u = u.trim();
      return u ? { username: u, role: '' } : null;
    }
    if (u && typeof u === 'object') {
      var name = u.username || u.userName || u.name || u.user || u.id;
      if (!name) return null;
      return { username: String(name), role: String(u.role || u.userRole || u.type || '') };
    }
    return null;
  }
  function findSession() {
    var stores = [];
    try { stores.push(sessionStorage); } catch (e) {}
    try { stores.push(localStorage); } catch (e) {}
    for (var s = 0; s < stores.length; s++) {
      for (var k = 0; k < SESSION_KEYS.length; k++) {
        var r = null;
        try { r = parseSession(stores[s].getItem(SESSION_KEYS[k])); } catch (e) {}
        if (r && r.username) return r;
      }
    }
    return null;
  }

  var diagLogged = false;
  function normRole(r) {
    var s = String(r == null ? '' : r).trim().toLowerCase().replace(/[\s\-]+/g, '_');
    if (s.indexOf('incharge') !== -1 || s.indexOf('in_charge') !== -1) return 'branch_incharge';
    if (s === 'cad' || s === 'cad_designers') return 'cad_designer';
    if (s === 'postproduction' || s === 'post-production') return 'post_production';
    return s;
  }

  /* ---------- contact directory (NO restrictions — everyone sees everyone) ---------- */
  function collectUsers() {
    var out = [];
    var seen = {};

    function push(username, role, branch) {
      if (!username) return;
      var key = norm(username);
      if (!key) return;
      if (key === norm(MY_NAME)) return;   // skip self
      if (seen[key]) return;
      seen[key] = true;
      out.push({
        username: String(username).trim(),
        role: normRole(role) || 'user',
        branch: formatBranchDisplayName(branch)
      });
    }
    function uname(u) {
      return u && (u.username || u.userName || u.name || u.user || u.id);
    }
    function list(key) {
      var v = readJSON(key, []);
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') {
        return Object.keys(v).map(function (k) {
          var o = v[k];
          return (o && typeof o === 'object') ? (o.username ? o : Object.assign({ username: k }, o)) : null;
        }).filter(Boolean);
      }
      return [];
    }

    /* Server directory is authoritative across browsers; local lists remain a fallback. */
    GP_CHAT_USERS.forEach(function (u) { push(uname(u), u && u.role, u && u.branch); });

    /* Core users: admin / developer / branch_incharge / user / workshop */
    list('gp_portal_users').forEach(function (u) {
      push(uname(u), u && (u.role || u.userRole || u.type), u && u.branch);
    });
    /* Designers */
    list('gp_designer_users').forEach(function (u) {
      push(uname(u), 'designer', u && u.branch);
    });
    /* CAD designers */
    list('gp_cad_designer_users').forEach(function (u) {
      push(uname(u), 'cad_designer', u && u.branch);
    });
    /* Post-production */
    list('gp_post_production_users').forEach(function (u) {
      push(uname(u), 'post_production', u && u.branch);
    });
    /* Stone stock — NEW: previously missing entirely */
    list('gp_stone_stock_users').forEach(function (u) {
      push(uname(u), (u && u.role) || 'stone_stock', u && u.branch);
    });

    if (!out.length && !diagLogged) {
      diagLogged = true;
      console.warn('[GP Chat] No contacts found. localStorage keys present:',
        ['gp_portal_users', 'gp_designer_users', 'gp_cad_designer_users',
         'gp_post_production_users', 'gp_stone_stock_users']
          .map(function (k) { return k + '=' + (localStorage.getItem(k) ? 'yes' : 'MISSING'); }).join(', '));
    }
    return out;
  }

  /**
   * No restrictions — every logged-in user sees every other user.
   * (Previously non-privileged users only saw branch_incharge + chat partners.)
   */
  function getAllowedContacts() {
    return collectUsers();
  }

  /* ---------- messages ---------- */
  function getMessages() {
    var arr = readJSON(MSG_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }
  function appendMessage(msg) {
    var arr = getMessages();
    arr.push(msg);
    if (arr.length > MAX_MESSAGES) arr = arr.slice(arr.length - MAX_MESSAGES);
    return saveJSON(MSG_KEY, arr);
  }
  function conversationWith(other) {
    var a = norm(MY_NAME), b = norm(other);
    return getMessages().filter(function (m) {
      var f = norm(m.from), t = norm(m.to);
      return (f === a && t === b) || (f === b && t === a);
    }).sort(function (x, y) { return new Date(x.ts) - new Date(y.ts); });
  }
  function unreadCountFrom(other) {
    var a = norm(MY_NAME), b = norm(other);
    return getMessages().filter(function (m) {
      return norm(m.from) === b && norm(m.to) === a && !m.read;
    }).length;
  }
  function totalUnread() {
    var a = norm(MY_NAME);
    return getMessages().filter(function (m) {
      return norm(m.to) === a && !m.read;
    }).length;
  }
  function markConversationRead(other) {
    var a = norm(MY_NAME), b = norm(other);
    var arr = getMessages(), changed = false;
    arr.forEach(function (m) {
      if (norm(m.from) === b && norm(m.to) === a && !m.read) { m.read = true; m.readAt = nowISO(); changed = true; }
    });
    if (changed) saveJSON(MSG_KEY, arr);
    refreshBadge();
  }
  function clearConversation(other) {
    var a = norm(MY_NAME), b = norm(other);
    var arr = getMessages();
    var kept = arr.filter(function (m) {
      var f = norm(m.from), t = norm(m.to);
      return !((f === a && t === b) || (f === b && t === a));
    });
    if (kept.length === arr.length) return 0;
    saveJSON(MSG_KEY, kept);
    refreshBadge();
    return arr.length - kept.length;
  }

  /* ---------- DOM ---------- */
  var panel, fab, contactsView, threadView, threadList, threadTitle, threadSub,
      searchInput, contactsList, composeInput, badgeEl,
      recBar, recTimeEl, recSendBtn, recCancelBtn,
      filePicker, attachBtn, micBtn, clearBtn;
  var activeContact = null;
  var lastRenderedSig = '';

  /* ---------- media recording state ---------- */
  var mediaRecorder = null;
  var recChunks = [];
  var recStart = 0;
  var recTimer = null;
  var recStream = null;
  var recIsVideo = false;

  function ensureCSS() {
    var has = false;
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if ((links[i].href || '').indexOf('gp-chat.css') !== -1) { has = true; break; }
    }
    if (has) return;
    var href = SCRIPT_SRC ? SCRIPT_SRC.replace(/gp-chat\.js(\?.*)?$/i, 'gp-chat.css') : 'gp-chat.css';
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
    console.warn('[GP Chat] gp-chat.css was not linked; loading from', href);
  }

  function buildUI() {
    if (document.getElementById('gpChatFab')) return;
    if (!document.body) return;
    ensureCSS();

    fab = document.createElement('button');
    fab.id = 'gpChatFab';
    fab.className = 'gp-chat-fab';
    fab.type = 'button';
    fab.title = 'Chat';
    fab.innerHTML = '<i class="fas fa-comments"></i><span class="gp-chat-badge hidden" id="gpChatBadge">0</span>';
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.id = 'gpChatPanel';
    panel.className = 'gp-chat-panel';
    panel.innerHTML =
      '<div class="gp-chat-head">' +
        '<h3><i class="fas fa-comments"></i> GP Chat</h3>' +
        '<div class="gp-chat-head-actions">' +
          '<button type="button" id="gpChatClearThread" class="gp-chat-head-btn" title="Clear this chat" style="display:none"><i class="fas fa-trash"></i></button>' +
          '<button type="button" id="gpChatClose" title="Close">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="gp-chat-body">' +
        '<div class="gp-chat-view active" id="gpChatContactsView">' +
          '<div class="gp-chat-search"><input id="gpChatSearch" type="text" placeholder="Search people..."></div>' +
          '<div class="gp-chat-contacts" id="gpChatContacts"></div>' +
        '</div>' +
        '<div class="gp-chat-view" id="gpChatThreadView">' +
          '<div class="gp-chat-thread-head">' +
            '<button type="button" id="gpChatBack" title="Back"><i class="fas fa-arrow-left"></i></button>' +
            '<div class="tinfo"><div class="t" id="gpChatThreadTitle">—</div>' +
            '<div class="s" id="gpChatThreadSub"></div></div>' +
            '<button type="button" id="gpChatClearThread2" class="gp-chat-thread-clear" title="Clear chat"><i class="fas fa-trash"></i></button>' +
          '</div>' +
          '<div class="gp-chat-thread" id="gpChatThread"></div>' +

          '<div class="gp-chat-rec-bar" id="gpChatRecBar">' +
            '<span class="dot"></span>' +
            '<span id="gpChatRecLabel">Recording</span>' +
            '<span class="time" id="gpChatRecTime">0:00</span>' +
            '<span class="spacer"></span>' +
            '<button type="button" class="danger" id="gpChatRecCancel">Cancel</button>' +
            '<button type="button" class="primary" id="gpChatRecSend">Send</button>' +
          '</div>' +

          '<div class="gp-chat-compose">' +
            '<input type="file" id="gpChatFile" accept="image/*,video/*,audio/*" style="display:none">' +
            '<button type="button" class="tool-btn" id="gpChatAttach" title="Attach image / video / audio">' +
              '<i class="fas fa-paperclip"></i>' +
            '</button>' +
            '<button type="button" class="tool-btn" id="gpChatMic" title="Record voice message">' +
              '<i class="fas fa-microphone"></i>' +
            '</button>' +
            '<textarea id="gpChatInput" placeholder="Type a message..." rows="1"></textarea>' +
            '<button type="button" class="send-btn" id="gpChatSend"><i class="fas fa-paper-plane"></i> Send</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(panel);

    badgeEl = document.getElementById('gpChatBadge');
    contactsView = document.getElementById('gpChatContactsView');
    threadView = document.getElementById('gpChatThreadView');
    contactsList = document.getElementById('gpChatContacts');
    threadList = document.getElementById('gpChatThread');
    threadTitle = document.getElementById('gpChatThreadTitle');
    threadSub = document.getElementById('gpChatThreadSub');
    searchInput = document.getElementById('gpChatSearch');
    composeInput = document.getElementById('gpChatInput');
    filePicker = document.getElementById('gpChatFile');
    attachBtn = document.getElementById('gpChatAttach');
    micBtn = document.getElementById('gpChatMic');
    recBar = document.getElementById('gpChatRecBar');
    recTimeEl = document.getElementById('gpChatRecTime');
    recSendBtn = document.getElementById('gpChatRecSend');
    recCancelBtn = document.getElementById('gpChatRecCancel');
    clearBtn = document.getElementById('gpChatClearThread2');

    fab.addEventListener('click', function () {
      if (panel.classList.contains('open')) { closeChat(); }
      else { openChat(); }
    });
    document.getElementById('gpChatClose').addEventListener('click', closeChat);
    document.getElementById('gpChatBack').addEventListener('click', showContactsView);
    document.getElementById('gpChatSend').addEventListener('click', sendCurrent);
    composeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
    });
    searchInput.addEventListener('input', renderContacts);

    /* clear-chat buttons (both places) */
    document.getElementById('gpChatClearThread').addEventListener('click', confirmClearChat);
    clearBtn.addEventListener('click', confirmClearChat);

    /* media buttons */
    attachBtn.addEventListener('click', function () { filePicker.click(); });
    filePicker.addEventListener('change', onFilePicked);
    micBtn.addEventListener('click', function () {
      if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording(true);
      else startRecording(false);
    });
    recCancelBtn.addEventListener('click', function () { stopRecording(false); });
    recSendBtn.addEventListener('click', function () { stopRecording(true); });

    refreshBadge();
    setInterval(refreshBadge, 2500);
    setInterval(function () {
      if (!panel.classList.contains('open')) return;
      if (activeContact) renderThread(); else renderContacts();
    }, 2000);
    window.addEventListener('storage', function (e) {
      if (e.key === MSG_KEY) {
        refreshBadge();
        if (panel.classList.contains('open')) {
          if (activeContact) renderThread(); else renderContacts();
        }
      }
    });
  }

  function openChat() {
    panel.classList.add('open');
    if (activeContact) showThreadView(activeContact);
    else showContactsView();
    setTimeout(function () { if (!activeContact) searchInput.focus(); }, 50);
  }
  function closeChat() {
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording(false);
    panel.classList.remove('open');
  }

  function showContactsView() {
    activeContact = null;
    lastRenderedSig = '';
    contactsView.classList.add('active');
    threadView.classList.remove('active');
    document.getElementById('gpChatClearThread').style.display = 'none';
    renderContacts();
  }
  function showThreadView(contact) {
    activeContact = contact;
    contactsView.classList.remove('active');
    threadView.classList.add('active');
    threadTitle.textContent = contact.username;

    var subText = contact.role || '';
    if (contact.branch) subText += (subText ? ' · ' : '') + formatBranchDisplayName(contact.branch);
    threadSub.textContent = subText;

    document.getElementById('gpChatClearThread').style.display = '';

    renderThread();
    markConversationRead(contact.username);
    setTimeout(function () { composeInput.focus(); }, 40);
  }

  function confirmClearChat() {
    if (!activeContact) return;
    var name = activeContact.username;
    var ok = window.confirm('Clear all messages with "' + name + '"?\nThis cannot be undone.');
    if (!ok) return;
    var removed = clearConversation(name);
    lastRenderedSig = '';
    renderThread();
    renderContacts();
    if (removed > 0) showToast('Chat cleared with ' + name + '.');
    else showToast('No messages to clear.');
  }

  function renderContacts() {
    var q = norm(searchInput ? searchInput.value : '');
    var contacts = getAllowedContacts();
    if (q) contacts = contacts.filter(function (c) { return norm(c.username).indexOf(q) !== -1; });

    contacts.sort(function (a, b) {
      var ua = unreadCountFrom(a.username), ub = unreadCountFrom(b.username);
      if (ua !== ub) return ub - ua;
      return a.username.localeCompare(b.username);
    });

    var sig = q + '#' + contacts.map(function (c) { return c.username + ':' + unreadCountFrom(c.username); }).join('|');
    if (sig === lastRenderedSig && contactsList.childElementCount) return;
    lastRenderedSig = sig;

    if (!contacts.length) {
      contactsList.innerHTML = '<div class="gp-chat-empty"><i class="fas fa-user-slash" style="font-size:24px;display:block;margin-bottom:6px;opacity:.5"></i>No contacts available.</div>';
      return;
    }

    var groups = {};
    contacts.forEach(function (c) {
      var r = c.role || 'user';
      if (!groups[r]) groups[r] = [];
      groups[r].push(c);
    });
    var order = ['admin', 'developer', 'branch_incharge', 'user', 'workshop',
                 'designer', 'cad_designer', 'post_production', 'stone_stock'];
    var roleLabel = {
      admin: 'Admins', developer: 'Developers', branch_incharge: 'Branch Incharge',
      user: 'Users', workshop: 'Workshops', designer: 'Designers',
      cad_designer: 'CAD Designers', post_production: 'Post-Production',
      stone_stock: 'Stone Stock'
    };
    Object.keys(groups).forEach(function (r) { if (order.indexOf(r) === -1) order.push(r); });

    var html = '';
    order.forEach(function (r) {
      if (!groups[r]) return;
      var headCls = (r === 'stone_stock') ? 'gp-chat-role-head stone' : 'gp-chat-role-head';
      html += '<div class="' + headCls + '">' + esc(roleLabel[r] || r) + '</div>';
      groups[r].forEach(function (c) {
        var un = unreadCountFrom(c.username);
        var sub = esc(c.role);
        if (c.branch) sub += ' · ' + esc(formatBranchDisplayName(c.branch));

        html += '<div class="gp-chat-contact" data-user="' + esc(c.username) + '" data-role="' + esc(c.role) + '" data-branch="' + esc(c.branch || '') + '">' +
                  '<div class="av">' + esc(initials(c.username)) + '</div>' +
                  '<div class="nm"><div class="t">' + esc(c.username) + '</div>' +
                  '<div class="s">' + sub + '</div></div>' +
                  (un > 0 ? '<span class="unread">' + (un > 99 ? '99+' : un) + '</span>' : '') +
                '</div>';
      });
    });
    contactsList.innerHTML = html;
    contactsList.querySelectorAll('.gp-chat-contact').forEach(function (el) {
      el.addEventListener('click', function () {
        showThreadView({ username: el.dataset.user, role: el.dataset.role || '', branch: el.dataset.branch || '' });
      });
    });
  }

  /* ---------- read-receipt tick ---------- */
  function receiptHTML(m) {
    if (m.read) {
      return '<span class="tick read" title="Read">' +
               '<svg viewBox="0 0 20 12" width="16" height="11" aria-hidden="true">' +
                 '<path d="M1 6.5 L5 10.5 L12.5 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
                 '<path d="M7 6.5 L11 10.5 L18.5 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
               '</svg></span>';
    }
    return '<span class="tick sent" title="Sent">' +
             '<svg viewBox="0 0 12 12" width="12" height="11" aria-hidden="true">' +
               '<path d="M1 6.5 L4.5 10 L11 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
             '</svg></span>';
  }

  /* ---------- render thread (with media) ---------- */
  function renderThread() {
    if (!activeContact) return;
    var msgs = conversationWith(activeContact.username);
    var mine = norm(MY_NAME);
    if (!msgs.length) {
      threadList.innerHTML = '<div class="gp-chat-thread-empty"><i class="fas fa-comment-dots" style="font-size:22px;display:block;margin-bottom:6px;opacity:.5"></i>No messages yet.<br>Say hi to ' + esc(activeContact.username) + '!</div>';
      return;
    }
    var html = msgs.map(function (m) {
      var out = norm(m.from) === mine;
      var cls = 'gp-chat-msg ' + (out ? 'out' : 'in');
      var body = '';

      if (m.type === 'image' && m.media) {
        body = '<div class="media">' +
                 '<img src="' + m.media + '" alt="image" data-full="' + m.media + '">' +
                 (m.text ? '<div class="cap">' + esc(m.text).replace(/\n/g, '<br>') + '</div>' : '') +
               '</div>';
      } else if (m.type === 'video' && m.media) {
        body = '<div class="media">' +
                 '<video src="' + m.media + '" controls preload="metadata" playsinline></video>' +
                 (m.text ? '<div class="cap">' + esc(m.text).replace(/\n/g, '<br>') + '</div>' : '') +
               '</div>';
      } else if (m.type === 'audio' && m.media) {
        body = '<div class="media">' +
                 '<audio src="' + m.media + '" controls preload="metadata"></audio>' +
                 (m.duration ? '<div class="cap">🎙️ ' + fmtDur(m.duration) + '</div>' : '') +
               '</div>';
      } else {
        body = esc(m.text).replace(/\n/g, '<br>');
      }

      var meta = esc(fmtTime(m.ts));
      if (out) meta += receiptHTML(m);
      var sender = out ? 'You' : (m.from || 'Unknown user');

      return '<div class="' + cls + '">' +
               '<div class="sender-name">' + esc(sender) + '</div>' + body +
               '<div class="meta">' + meta + '</div>' +
             '</div>';
    }).join('');
    threadList.innerHTML = html;

    /* lightbox hookup for images */
    threadList.querySelectorAll('img[data-full]').forEach(function (img) {
      img.addEventListener('click', function () {
        var lb = document.createElement('div');
        lb.className = 'gp-chat-lightbox';
        lb.innerHTML = '<img src="' + img.dataset.full + '" alt="image">';
        lb.addEventListener('click', function () { lb.remove(); });
        document.body.appendChild(lb);
      });
    });

    threadList.scrollTop = threadList.scrollHeight;
    markConversationRead(activeContact.username);
  }

  /* ---------- send text ---------- */
  function sendCurrent() {
    if (!activeContact) return;
    var txt = (composeInput.value || '').trim();
    if (!txt) return;
    pushMessage({ type: 'text', text: txt });
    composeInput.value = '';
    composeInput.style.height = '38px';
  }

  function pushMessage(fields) {
    if (!activeContact) return false;
    var contact = activeContact;
    var all = collectUsers();
    var rec = all.find(function (u) { return norm(u.username) === norm(contact.username); });
    var toRole = rec ? rec.role : (contact.role || 'user');

    var msg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      from: MY_NAME,
      fromRole: MY_ROLE,
      to: contact.username,
      toRole: toRole,
      text: fields.text || '',
      type: fields.type || 'text',
      ts: nowISO(),
      read: false
    };
    if (fields.media) { msg.media = fields.media; msg.mime = fields.mime; msg.name = fields.name; }
    if (fields.duration) msg.duration = fields.duration;

    var ok = appendMessage(msg);
    if (!ok) return false;
    renderThread();
    refreshBadge();
    return true;
  }

  /* ---------- file attach (image / video / audio) ---------- */
  function onFilePicked(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    var type = (file.type || '').toLowerCase();
    if (type.indexOf('image/') === 0) {
      handleImageFile(file);
    } else if (type.indexOf('video/') === 0) {
      handleVideoFile(file);
    } else if (type.indexOf('audio/') === 0) {
      handleAudioFile(file);
    } else {
      showToast('Unsupported file type.');
    }
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  function handleImageFile(file) {
    showToast('Processing image…');
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight;
      var scale = Math.min(1, MAX_IMAGE_DIM / Math.max(w, h));
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      pushMessage({ type: 'image', media: dataUrl, mime: 'image/jpeg', text: '' });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      showToast('Could not read image.');
    };
    img.src = url;
  }

  function handleAudioFile(file) {
    if (file.size > 6 * 1024 * 1024) { showToast('Audio too big (' + bytes(file.size) + '). Max 6 MB.'); return; }
    readAsDataURL(file).then(function (dataUrl) {
      var dur = 0;
      var a = new Audio();
      a.onloadedmetadata = function () {
        dur = a.duration || 0;
        pushMessage({ type: 'audio', media: dataUrl, mime: file.type || 'audio/mp3', duration: dur, name: file.name });
      };
      a.onerror = function () {
        pushMessage({ type: 'audio', media: dataUrl, mime: file.type || 'audio/mp3', duration: 0, name: file.name });
      };
      a.src = dataUrl;
    });
  }

  function handleVideoFile(file) {
    showToast('Compressing video…');
    var url = URL.createObjectURL(file);
    var v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';

    v.onloadedmetadata = function () {
      var dur = v.duration || 0;
      if (dur > MAX_VIDEO_SECONDS + 1) {
        URL.revokeObjectURL(url);
        showToast('Video too long (' + fmtDur(dur) + '). Max ' + MAX_VIDEO_SECONDS + 's.');
        return;
      }
      var w = v.videoWidth, h = v.videoHeight;
      var scale = Math.min(1, MAX_VIDEO_DIM / Math.max(w, h));
      var cw = Math.max(2, Math.round(w * scale / 2) * 2);
      var ch = Math.max(2, Math.round(h * scale / 2) * 2);

      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      var ctx = canvas.getContext('2d');

      /* pick mime */
      var mime = 'video/webm;codecs=vp8,opus';
      if (!(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime))) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported('video/webm')) mime = 'video/webm';
        else if (window.MediaRecorder && MediaRecorder.isTypeSupported('video/mp4')) mime = 'video/mp4';
      }
      if (!window.MediaRecorder) {
        URL.revokeObjectURL(url);
        showToast('Video not supported in this browser.');
        return;
      }

      var stream = canvas.captureStream(24);
      try {
        var actx = new (window.AudioContext || window.webkitAudioContext)();
        var src = actx.createMediaElementSource(v);
        var dest = actx.createMediaStreamDestination();
        src.connect(dest);
        src.connect(actx.destination);
        dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
      } catch (e) { /* audio optional */ }

      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 900000 });
      var chunks = [];
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = function () {
        URL.revokeObjectURL(url);
        var blob = new Blob(chunks, { type: mime });
        if (blob.size > MAX_VIDEO_BYTES) {
          showToast('Video still too large (' + bytes(blob.size) + '). Try a shorter clip.');
          return;
        }
        var fr = new FileReader();
        fr.onload = function () {
          pushMessage({ type: 'video', media: fr.result, mime: mime, duration: dur });
        };
        fr.readAsDataURL(blob);
      };

      var stopped = false;
      function drawLoop() {
        if (stopped) return;
        if (!v.paused && !v.ended) {
          ctx.drawImage(v, 0, 0, cw, ch);
        }
        requestAnimationFrame(drawLoop);
      }
      v.onended = function () {
        stopped = true;
        try { rec.stop(); } catch (e) {}
      };

      rec.start();
      v.play().catch(function () {});
      drawLoop();
      /* safety: stop after MAX_VIDEO_SECONDS + 2s */
      setTimeout(function () {
        if (rec.state === 'recording') {
          stopped = true;
          try { rec.stop(); } catch (e) {}
        }
      }, (MAX_VIDEO_SECONDS + 2) * 1000);
    };
    v.onerror = function () {
      URL.revokeObjectURL(url);
      showToast('Could not read video.');
    };
    v.src = url;
  }

  /* ---------- voice recording ---------- */
  function pickAudioMime() {
    var cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < cands.length; i++) if (MediaRecorder.isTypeSupported(cands[i])) return cands[i];
    return '';
  }

  function startRecording(asVideo) {
    if (!activeContact) { showToast('Open a conversation first.'); return; }
    if (mediaRecorder && mediaRecorder.state === 'recording') return;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      showToast('Recording not supported in this browser.');
      return;
    }
    recIsVideo = !!asVideo;

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(function (stream) {
        recStream = stream;
        var mime = pickAudioMime();
        try {
          mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        } catch (e) {
          stream.getTracks().forEach(function (t) { t.stop(); });
          showToast('Could not start recorder.');
          return;
        }
        recChunks = [];
        mediaRecorder.ondataavailable = function (ev) {
          if (ev.data && ev.data.size) recChunks.push(ev.data);
        };
        mediaRecorder.onstop = finalizeRecording;

        recStart = Date.now();
        mediaRecorder.start();
        micBtn.classList.add('recording');
        recBar.classList.add('show');
        document.getElementById('gpChatRecLabel').textContent = 'Recording voice…';
        tickRecTimer();
        recTimer = setInterval(tickRecTimer, 250);
      })
      .catch(function (err) {
        console.warn('[GP Chat] mic permission:', err);
        showToast('Microphone permission denied.');
      });
  }

  function tickRecTimer() {
    var sec = (Date.now() - recStart) / 1000;
    recTimeEl.textContent = fmtDur(sec);
    if (sec > MAX_AUDIO_SECONDS) {
      showToast('Max ' + MAX_AUDIO_SECONDS + 's reached — sending.');
      stopRecording(true);
    }
  }

  function stopRecording(keep) {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') {
      cleanupRecUI();
      return;
    }
    mediaRecorder._keep = !!keep;
    try { mediaRecorder.stop(); } catch (e) {}
  }

  function finalizeRecording() {
    var keep = !!(mediaRecorder && mediaRecorder._keep);
    var mime = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
    var blob = new Blob(recChunks, { type: mime });
    var duration = (Date.now() - recStart) / 1000;

    /* release the microphone */
    if (recStream) {
      recStream.getTracks().forEach(function (t) { t.stop(); });
      recStream = null;
    }
    cleanupRecUI();

    if (!keep) { showToast('Recording cancelled.'); return; }
    if (!blob.size) { showToast('Nothing recorded.'); return; }

    if (blob.size > 6 * 1024 * 1024) {
      showToast('Recording too large (' + bytes(blob.size) + ').');
      return;
    }

    var fr = new FileReader();
    fr.onload = function () {
      pushMessage({ type: 'audio', media: fr.result, mime: mime, duration: duration });
    };
    fr.readAsDataURL(blob);
  }

  function cleanupRecUI() {
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    mediaRecorder = null;
    recChunks = [];
    recStart = 0;
    if (micBtn) micBtn.classList.remove('recording');
    if (recBar) recBar.classList.remove('show');
  }

  /* ---------- badge ---------- */
  function refreshBadge() {
    if (!badgeEl) return;
    var n = totalUnread();
    if (n > 0) {
      badgeEl.textContent = n > 99 ? '99+' : n;
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  /* ---------- start-up ---------- */
  function tryStart() {
    if (started) return true;
    var s = findSession();
    if (!s) return false;
    MY_NAME = String(s.username).trim();
    MY_ROLE = normRole(s.role);
    started = true;
    console.log('[GP Chat] starting for', MY_NAME, '(' + (MY_ROLE || 'no role') + ')');
    buildUI();
    /* Load the server user directory right away, independent of message sync,
       so the contact list is complete even if cloud message sync is slow or fails. */
    refreshChatUsers();
    setInterval(refreshChatUsers, 30000);
    initCloudChat();
    return true;
  }

  function init() {
    if (tryStart()) return;
    console.warn('[GP Chat] no logged-in user found in sessionStorage/localStorage (keys tried: ' +
      SESSION_KEYS.join(', ') + '). Will keep checking.');
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (tryStart() || tries > 600) clearInterval(t);
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();