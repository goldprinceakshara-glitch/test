/* ============================================================
   SESSION + ROLE
   ============================================================ */
var DESIGNS_KEY = 'gp_designs_v1';
var ORDERS_KEY  = 'goldprince_orders_v3';
var SENDS_KEY   = 'goldprince_stock_sends_v1';
var COMPLETED_KEY = 'goldprince_completed_v1';
var CAD_DESIGNERS_KEY = 'gp_cad_designer_users';

// ★ NEW — section-to-section contacts registry
var SECTION_CONTACTS_KEY = 'gp_section_contacts';

/* Telegram config – fill these in for live notifications */
var TELEGRAM_BOT_TOKEN = '';
var ADMIN_TELEGRAM_CHAT_ID = '';

var session = null;
try { session = JSON.parse(sessionStorage.getItem('gp_logged_user') || 'null'); } catch(e){}

function showLoginPrompt(){
  var appEl = document.getElementById('app');
  if (appEl) appEl.classList.add('hidden');
  var div = document.createElement('div');
  div.className = 'login-wrap';
  div.innerHTML =
    '<h2><i class="fas fa-lock"></i> Login Required</h2>'
    + '<p>You are not logged in to <b>GP Portal</b>.</p>'
    + '<p>Please open <code>index.html</code> first and log in, then click <b>Designs</b> from the menu.</p>'
    + '<p style="margin-top:10px;color:#8a1c24;font-size:12px">Reason: <code>sessionStorage.gp_logged_user</code> is empty.</p>'
    + '<button class="btn primary" onclick="window.location.href=\'index.html\'"><i class="fas fa-sign-in-alt"></i> Go to Login</button>';
  document.body.appendChild(div);
}

if (!session || !session.username || !session.role){
  showLoginPrompt();
  throw new Error('No active session — showing login prompt instead of blank page.');
}

var CURRENT_BRANCH = session.branch ? String(session.branch).trim() : '';
var CURRENT_ROLE   = session.role   ? String(session.role).trim()   : '';
var CURRENT_SECTION = session.section ? String(session.section).trim() : '';
var CURRENT_USERNAME = session.username ? String(session.username).trim().toLowerCase() : '';

function getDesignerStore(){
  try { return JSON.parse(localStorage.getItem('gp_designer_users') || '[]') || []; } catch(e){ return []; }
}
function findDesignerByUsername(username){
  var list = getDesignerStore();
  var key = String(username || '').toLowerCase();
  for (var i = 0; i < list.length; i++){
    if (String(list[i].username || '').toLowerCase() === key) return list[i];
  }
  return null;
}

var MY_SECTION = '';
if (CURRENT_ROLE === 'cad_designer'){
  MY_SECTION = 'CAD';
} else if (CURRENT_ROLE === 'designer'){
  var dRec = findDesignerByUsername(session.username);
  if (dRec && dRec.section) MY_SECTION = dRec.section;
  else if (CURRENT_SECTION) MY_SECTION = CURRENT_SECTION;
  else MY_SECTION = 'Designs Bank';
}

/* ============================================================
   ROLE HELPERS
   ============================================================ */
function isCadChargeUser(){
  if (CURRENT_USERNAME === 'cad') return true;
  var sec = String(MY_SECTION || '').toLowerCase().replace(/[\s_]+/g, '-');
  return sec.indexOf('cad-charge') !== -1 || sec.indexOf('cadcharge') !== -1;
}
function isCadDesignerUser(){
  if (CURRENT_USERNAME === 'cad') return false;
  return CURRENT_ROLE === 'cad_designer';
}
function isAdminUser(){
  return CURRENT_ROLE === 'admin';
}
function canAllotCadDesign(){ return isAdminUser() || isCadChargeUser(); }
function canEditCadDesign(){ return isAdminUser() || isCadChargeUser(); }
function canForwardCadToCam(){ return isAdminUser() || isCadChargeUser(); }
function canDeleteCadDesign(){ return isAdminUser() || isCadChargeUser(); }
function canUpdateCadProgress(){ return isAdminUser() || isCadChargeUser() || isCadDesignerUser(); }
function canSeeAllCadDesigns(){ return isAdminUser() || isCadChargeUser(); }

function readJSON(k, fb){ try { var v = JSON.parse(localStorage.getItem(k)||'null'); return v==null?fb:v; } catch(e){ return fb; } }
function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)); }

/* ============================================================
   CAD DESIGNERS
   ============================================================ */
function getCadDesigners(){
  try { return JSON.parse(localStorage.getItem(CAD_DESIGNERS_KEY) || '[]') || []; } catch(e){ return []; }
}
function getCadDesignerDisplayList(){
  var list = getCadDesigners();
  var out = []; var seen = {};
  list.forEach(function(d){
    var name = String((d && d.username) || '').trim();
    if (name && !seen[name.toLowerCase()]){ seen[name.toLowerCase()] = true; out.push(name); }
  });
  return out;
}
function getCadDesignerPhone(username){
  var list = getCadDesigners();
  var key = String(username || '').toLowerCase();
  for (var i = 0; i < list.length; i++){
    var rec = list[i] || {};
    if (String(rec.username || '').toLowerCase() === key){
      return String(rec.phone || rec.mobile || rec.telegramChatId || rec.chatId || '').trim();
    }
  }
  return '';
}
function getAdminTelegramChatId(){
  try {
    var cfg = JSON.parse(localStorage.getItem('gp_telegram_config') || '{}') || {};
    if (cfg.adminChatId) return String(cfg.adminChatId).trim();
  } catch(e){}
  return ADMIN_TELEGRAM_CHAT_ID;
}

/* ============================================================
   ★ NEW — SECTION CONTACTS REGISTRY
   ============================================================ */
function getSectionContacts(){
  try { return JSON.parse(localStorage.getItem(SECTION_CONTACTS_KEY) || '{}') || {}; } catch(e){ return {}; }
}
function saveSectionContacts(obj){
  var current = getSectionContacts();
  Object.keys(obj || {}).forEach(function(k){ current[k] = obj[k]; });
  localStorage.setItem(SECTION_CONTACTS_KEY, JSON.stringify(current));
}
function getSectionChatId(sectionKey){
  var c = getSectionContacts();
  return String(c[sectionKey] || '').trim();
}
function getSectionWhatsAppNumber(sectionKey){
  var c = getSectionContacts();
  return String(c[sectionKey + '_wa'] || '').trim();
}
function sectionLabel(key){
  return ({
    designs: 'Designs Bank',
    cad:     'CAD Section',
    cam:     'CAM Section',
    casting: 'Casting Section',
    samples: 'Samples Section',
    ho:      'Head Office'
  })[key] || key;
}

/* ============================================================
   TELEGRAM SEND
   ============================================================ */
function sendTelegramMessage(chatId, text){
  if (!TELEGRAM_BOT_TOKEN){
    return Promise.resolve({ ok:false, skipped:true, reason:'Bot token not configured' });
  }
  if (!chatId){
    return Promise.resolve({ ok:false, skipped:true, reason:'No chat id' });
  }
  var url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
  }).then(function(r){ return r.json(); })
    .catch(function(err){ return { ok:false, error: String(err) }; });
}

function sendTelegramToDesignerAndAdmin(designerUsername, text){
  var results = [];
  var designerChatId = getCadDesignerPhone(designerUsername);
  var adminChatId = getAdminTelegramChatId();
  if (designerChatId){
    results.push(sendTelegramMessage(designerChatId, text).then(function(r){ r.target = 'designer (' + designerUsername + ')'; return r; }));
  } else {
    results.push(Promise.resolve({ ok:false, skipped:true, reason:'No Telegram chat ID registered for designer', target:'designer (' + designerUsername + ')' }));
  }
  if (adminChatId && adminChatId !== designerChatId){
    results.push(sendTelegramMessage(adminChatId, text).then(function(r){ r.target = 'admin'; return r; }));
  } else if (adminChatId && adminChatId === designerChatId) {
    results.push(Promise.resolve({ ok:true, skipped:true, reason:'Same chat id as designer', target:'admin' }));
  } else {
    results.push(Promise.resolve({ ok:false, skipped:true, reason:'No admin Telegram chat ID configured', target:'admin' }));
  }
  return Promise.all(results);
}

/* ============================================================
   ★ NEW — GENERIC SECTION-FORWARD TELEGRAM NOTIFICATION
   ============================================================ */
function notifySectionForward(opts){
  /*
    opts = {
      fromSection: 'designs' | 'cad' | 'cam' | 'casting' | 'samples',
      toSection:   'cad' | 'cam' | 'casting' | 'samples' | 'ho',
      design:      designObject,
      extra:       'optional HTML-safe line(s)'
    }
  */
  var fromId  = getSectionChatId(opts.fromSection);
  var toId    = getSectionChatId(opts.toSection);
  var adminId = getAdminTelegramChatId();

  var d = opts.design || {};
  var lines = [];
  lines.push('<b>🔔 DESIGN FORWARDED</b>');
  lines.push('From: <b>' + escapeHtml(sectionLabel(opts.fromSection)) + '</b>');
  lines.push('To: <b>'   + escapeHtml(sectionLabel(opts.toSection))   + '</b>');
  lines.push('Art No: <b>' + escapeHtml(d.artNo || '—') + '</b>');
  lines.push('Product: <b>' + escapeHtml(d.name || '—') + '</b>');
  if (d.category) lines.push('Category: ' + escapeHtml(d.category));
  if (d.group)    lines.push('Group: ' + escapeHtml(d.group));
  if (d.size)     lines.push('Size: ' + escapeHtml(d.size));
  if (opts.extra) lines.push(opts.extra);
  lines.push('Time: ' + formatDateTime(new Date().toISOString()));
  var text = lines.join('\n');

  var jobs = [];
  var seen = {};

  if (toId && !seen[toId]){
    seen[toId] = true;
    jobs.push(sendTelegramMessage(toId, text).then(function(r){
      r.target = 'to-section (' + opts.toSection + ')';
      return r;
    }));
  }
  if (fromId && !seen[fromId]){
    seen[fromId] = true;
    jobs.push(sendTelegramMessage(fromId, text).then(function(r){
      r.target = 'from-section (' + opts.fromSection + ')';
      return r;
    }));
  }
  if (adminId && !seen[adminId]){
    seen[adminId] = true;
    jobs.push(sendTelegramMessage(adminId, text).then(function(r){
      r.target = 'admin';
      return r;
    }));
  }
  if (!jobs.length){
    jobs.push(Promise.resolve({ ok:false, skipped:true, reason:'No section chat IDs or admin configured', target:'none' }));
  }
  return Promise.all(jobs);
}

/* ============================================================
   ★ NEW — WHATSAPP NOTIFICATION (wa.me deep link)
   ============================================================ */
function notifyWhatsApp(opts){
  /*
    Opens WhatsApp with a pre-filled message to the receiving section's
    registered WhatsApp number. The user still presses Send in WhatsApp.
    For fully-automatic WhatsApp, use WhatsApp Cloud API on a server.
  */
  var toNumber = getSectionWhatsAppNumber(opts.toSection);
  if (!toNumber){
    console.warn('No WhatsApp number configured for section:', opts.toSection);
    return;
  }
  var d = opts.design || {};
  var plainExtra = (opts.extra || '').replace(/<[^>]+>/g, '');
  var msg =
    '🔔 Design Forwarded\n' +
    'From: ' + sectionLabel(opts.fromSection) + '\n' +
    'To: ' + sectionLabel(opts.toSection) + '\n' +
    'Art No: ' + (d.artNo || '—') + '\n' +
    'Product: ' + (d.name || '—') + '\n' +
    (d.category ? 'Category: ' + d.category + '\n' : '') +
    (d.group    ? 'Group: '    + d.group    + '\n' : '') +
    (d.size     ? 'Size: '     + d.size     + '\n' : '') +
    (plainExtra ? plainExtra + '\n' : '') +
    'Time: ' + new Date().toLocaleString('en-IN');
  var url = 'https://wa.me/' + encodeURIComponent(toNumber) + '?text=' + encodeURIComponent(msg);
  try { window.open(url, '_blank'); } catch(e){ console.warn('WhatsApp open failed', e); }
}

/* ============================================================
   TELEGRAM RESULT MODAL
   ============================================================ */
function showTelegramResult(results){
  var body = document.getElementById('telegramResultBody');
  if (!body) return;
  var html = '';
  results.forEach(function(r){
    var icon, color, label;
    if (r && r.ok){ icon = 'fa-check-circle'; color = '#0a5c2e'; label = 'Sent successfully'; }
    else if (r && r.skipped){ icon = 'fa-info-circle'; color = '#8a6300'; label = 'Skipped — ' + escapeHtml(r.reason || ''); }
    else { icon = 'fa-times-circle'; color = '#8a1c24'; label = 'Failed — ' + escapeHtml((r && (r.error || (r.description) || JSON.stringify(r))) || 'Unknown error'); }
    html += '<div style="padding:8px 0;border-bottom:1px solid #eee">'
      + '<i class="fas ' + icon + '" style="color:' + color + '"></i> '
      + '<b>' + escapeHtml((r && r.target) || 'Target') + '</b>: ' + label + '</div>';
  });
  if (!results.length) html = '<div>No notification targets.</div>';
  body.innerHTML = html;
  document.getElementById('telegramResultModal').classList.remove('hidden');
}

function buildSilverCadOrderText(d, opts){
  opts = opts || {};
  var lines = [];
  lines.push('<b>🏷️ SILVER CAD ORDER</b>');
  lines.push('Date of Issue: <b>' + (opts.dateOfIssue || formatDate(todayIso())) + '</b>');
  lines.push('Running Date: <b>' + (opts.runningDate || formatDate(todayIso())) + '</b>');
  lines.push('Art Number: <b>' + escapeHtml(d.artNo || '—') + '</b>');
  lines.push('Item: <b>' + escapeHtml(d.name || '—') + '</b>');
  lines.push('Size: <b>' + escapeHtml(d.size || d.sizeIn || '—') + '</b>');
  var wt = (d.cad && d.cad.grossWt) || 0;
  lines.push('Estimated Weight: <b>' + (wt ? formatNumber2(wt) + ' g' : '—') + '</b>');
  var finalWt = (d.casting && d.casting.grossWt) || (d.cam && d.cam.grossWt) || 0;
  lines.push('Final Weight: <b>' + (finalWt ? formatNumber2(finalWt) + ' g' : '—') + '</b>');
  lines.push('CAD Artist Name: <b>' + escapeHtml((d.cad && d.cad.assignee) || opts.assignee || '—') + '</b>');
  lines.push('Branch: <b>CAD Section</b>');
  lines.push('Required Changes: <b>' + escapeHtml((d.cad && d.cad.changes) || opts.changes || '—') + '</b>');
  if (opts.cadCompletedAt) lines.push('CAD Completed Date: <b>' + formatDateTime(opts.cadCompletedAt) + '</b>');
  if (opts.forwarding) lines.push('➡️ Forwarded to <b>Casting Section</b>');
  return lines.join('\n');
}

/* ============================================================
   SILVER CAD ORDER PRINT
   ============================================================ */
function printSilverCadOrder(design, opts){
  opts = opts || {};
  if (!design){ alert('Design not found for printing.'); return; }

  var dateOfIssue = opts.dateOfIssue || formatDate(todayIso());
  var runningDate = opts.runningDate || formatDate(todayIso());
  var artNo = design.artNo || '—';
  var name = design.name || '—';
  var size = design.size || design.sizeIn || '—';

  var grossWt = (design.cad && design.cad.grossWt) || 0;
  var grossWtTxt = grossWt ? formatNumber2(grossWt) : '—';

  var finalWt = (design.casting && design.casting.grossWt) || (design.cam && design.cam.grossWt) || 0;
  var finalWtTxt = finalWt ? formatNumber2(finalWt) : '—';

  var artist = (design.cad && design.cad.assignee) || opts.assignee || '—';
  var changes = (design.cad && design.cad.changes) || opts.changes || '';

  var imgSrc = (design.cad && design.cad.image) || design.image || '';

  document.getElementById('spDate').textContent = dateOfIssue;
  document.getElementById('spRunningDate').textContent = runningDate;
  document.getElementById('spArtNo').textContent = artNo;
  document.getElementById('spName').textContent = name;
  document.getElementById('spSize').textContent = size;
  document.getElementById('spGrossWeight').textContent = grossWtTxt;
  document.getElementById('spNetWeight').textContent = finalWtTxt;
  document.getElementById('spChanges').textContent = changes;
  document.getElementById('spDeliveryDate').textContent = '';
  document.getElementById('spArtist').textContent = artist;
  document.getElementById('spBranch').textContent = 'CAD Section';

  var completedRow = document.getElementById('spCadCompletedRow');
  var completedCell = document.getElementById('spCadCompleted');
  if (opts.cadCompletedAt){
    completedRow.style.display = 'table-row';
    completedCell.textContent = formatDateTime(opts.cadCompletedAt);
  } else {
    completedRow.style.display = 'none';
    completedCell.textContent = '—';
  }

  var imgWrapper = document.getElementById('spImageWrapper');
  if (imgWrapper) {
    if (imgSrc) {
      imgWrapper.style.backgroundImage = 'url("' + imgSrc + '")';
    } else {
      imgWrapper.style.backgroundImage = 'none';
    }
  }

  var printArea = document.getElementById('silverPrintArea');
  printArea.style.display = 'flex';
  setTimeout(function(){
    window.print();
    setTimeout(function(){ printArea.style.display = 'none'; }, 500);
  }, 150);
}

/* ============================================================
   HELPERS & UTILITIES
   ============================================================ */
var STAGES = ['BANK','CAD','CAM','CASTING','SAMPLES','SAMPLE','ORDERED'];
var STAGE_LABELS = { BANK:'Designs Bank', CAD:'CAD Section', CAM:'CAM Section', CASTING:'Casting Section', SAMPLES:'Samples Section', SAMPLE:'Sample Received (HO)', ORDERED:'Order Placed' };
var STAGE_BADGE = { BANK:'bank', CAD:'cad', CAM:'cam', CASTING:'casting', SAMPLES:'sample', SAMPLE:'sample', ORDERED:'ordered' };
function stageIndex(s){ return STAGES.indexOf(s); }

function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function formatNumber(v){ var n=Number(v||0); return n.toLocaleString('en-IN',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2}); }
function formatNumber2(v){ var n=Number(v||0); return n.toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2}); }
function formatDate(v){ if(!v) return '—'; var p=String(v).split('-'); return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:v; }
function formatDateTime(v){ if(!v) return '—'; try { var d=new Date(v); return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); } catch(e){ return v; } }
function todayIso(){ return new Date().toISOString().slice(0,10); }
function parseTime(v){ if (!v) return null; var d = new Date(v); if (isNaN(d)) return null; return d.getTime(); }
function formatDuration(ms){
  if (!ms || ms < 0) ms = 0;
  var s = Math.floor(ms/1000);
  var d = Math.floor(s/86400); s -= d*86400;
  var h = Math.floor(s/3600); s -= h*3600;
  var m = Math.floor(s/60); s -= m*60;
  var parts = [];
  if (d) parts.push(d + 'd');
  if (h) parts.push(h + 'h');
  if (m) parts.push(m + 'm');
  if (s && !parts.length) parts.push(s + 's');
  return parts.length ? parts.join(' ') : '0s';
}

function openZoom(src){ if (!src) return; var z=document.getElementById('zoomImg'); if(z) z.src=src; var m=document.getElementById('zoomModal'); if(m) m.classList.remove('hidden'); }
function closeZoom(){ var m=document.getElementById('zoomModal'); if(m) m.classList.add('hidden'); var z=document.getElementById('zoomImg'); if(z) z.removeAttribute('src'); }
function makeImg(src, size, nameHint){
  if (!src) return '<span style="color:#999;font-size:11px">—</span>';
  var s = size || 50;
  var fname = String(nameHint || 'design').replace(/[^a-z0-9_-]+/gi,'_').slice(0,40) + '_' + Date.now() + '.png';
  return '<div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px">'
    + '<img src="'+src+'" class="clickable-img" style="width:'+s+'px;height:'+s+'px;object-fit:contain;border:1px solid #ddd;border-radius:4px;background:#fff" alt="" onclick="openZoom(this.src)">'
    + '<a href="'+src+'" download="'+fname+'" title="Download image" style="font-size:10px;color:#8c004c;text-decoration:none;font-weight:700"><i class="fas fa-download"></i> DL</a>'
    + '</div>';
}

/* ============================================================
   LOGOUT & TABS
   ============================================================ */
function logout(){
  if (!confirm('Log out?')) return;
  try { sessionStorage.removeItem('gp_logged_user'); sessionStorage.clear(); } catch(e){}
  window.location.replace('index.html?t=' + Date.now() + '&logout=1');
}
document.getElementById('logoutBtn').addEventListener('click', logout);

var ROLE_TO_TABS = { admin: ['bank','cad','cam','casting','samples','orderpending','reports','report','tracking'], designs: ['bank'], cad: ['cad'], cad_designer: ['cad'], cam: ['cam'], casting: ['casting'], samples: ['samples','orderpending'] };
function allowedTabsForCurrentUser(){
  if (isCadDesignerUser()) return ['cad'];
  if (CURRENT_ROLE === 'designer'){
    if (isCadChargeUser()) return ['cad'];
    var sec = String(MY_SECTION || 'Designs Bank').toLowerCase().replace(/[\s_]+/g, '-');
    if (sec.indexOf('cad') !== -1) return ['cad'];
    if (sec.indexOf('cam') !== -1) return ['cam'];
    if (sec.indexOf('casting') !== -1) return ['casting'];
    if (sec.indexOf('sample') !== -1) return ['samples','orderpending'];
    return ['bank'];
  }
  return ROLE_TO_TABS[CURRENT_ROLE] || ['bank'];
}

function updateWorkflowTitle(tabName){
  var t = document.getElementById('workflowTitle');
  if (!t) return;
  if (tabName === 'cad') t.innerHTML = '<i class="fas fa-drafting-compass"></i> CAD Workflow';
  else if (tabName === 'cam') t.innerHTML = '<i class="fas fa-cogs"></i> CAM Workflow';
  else if (tabName === 'casting') t.innerHTML = '<i class="fas fa-fire"></i> Casting Workflow';
  else if (tabName === 'samples') t.innerHTML = '<i class="fas fa-cube"></i> Samples Workflow';
  else if (tabName === 'orderpending') t.innerHTML = '<i class="fas fa-hourglass-half"></i> Order Pending Workflow';
  else if (tabName === 'reports' || tabName === 'report') t.innerHTML = '<i class="fas fa-chart-line"></i> Reports &amp; Analysis';
  else if (tabName === 'tracking') t.innerHTML = '<i class="fas fa-route"></i> Design Tracking';
  else t.innerHTML = '<i class="fas fa-palette"></i> Designs Bank &amp; Workflow';
}

function applyRoleVisibility(){
  var allowed = allowedTabsForCurrentUser();
  var mainTabsEl = document.getElementById('mainTabs');
  if (mainTabsEl){
    if (isCadDesignerUser()) mainTabsEl.classList.add('hidden');
    else mainTabsEl.classList.remove('hidden');
  }
  var tabEls = document.querySelectorAll('#mainTabs .tab');
  for (var i = 0; i < tabEls.length; i++){
    if (allowed.indexOf(tabEls[i].dataset.tab) === -1) tabEls[i].classList.add('hidden');
    else tabEls[i].classList.remove('hidden');
  }
  var panels = document.querySelectorAll('.tab-panel');
  for (var j = 0; j < panels.length; j++) panels[j].classList.add('hidden');
  var firstTab = allowed[0] || 'bank';
  switchTab(firstTab);
  var cadSubs = document.querySelectorAll('#tab-cad .subtab');
  if (isCadDesignerUser()){
    for (var k = 0; k < cadSubs.length; k++){
      var name = cadSubs[k].getAttribute('data-subtab');
      if (name === 'cad-received' || name === 'cad-designer-report') cadSubs[k].classList.add('hidden');
      else cadSubs[k].classList.remove('hidden');
    }
    var upBtn = document.querySelector('#tab-cad .subtab[data-subtab="cad-updates"]');
    if (upBtn) upBtn.click();
  } else {
    for (var m = 0; m < cadSubs.length; m++) cadSubs[m].classList.remove('hidden');
  }
}

/* ============================================================
   BADGES
   ============================================================ */
var SEEN_KEY_MAP = { cad: 'gp_seen_cad', cam: 'gp_seen_cam', casting: 'gp_seen_casting', samples: 'gp_seen_samples', orderpending: 'gp_seen_pending' };
function designTimeForTab(d, tab){
  if (tab === 'cad') return parseTime(d.cadForwardedAt || (d.cad && d.cad.forwardedAt));
  if (tab === 'cam') return parseTime(d.camForwardedAt || (d.cam && d.cam.forwardedAt));
  if (tab === 'casting') return parseTime(d.castingForwardedAt || (d.cam && d.cam.forwardedAt));
  if (tab === 'samples') return parseTime(d.sampleForwardedAt || (d.casting && d.casting.sampleSentAt));
  if (tab === 'orderpending') return parseTime(d.hoSentAt || (d.samples && d.samples.hoSentAt));
  return null;
}
function designInTab(d, tab){
  if (tab === 'cad') return d.stage === 'CAD';
  if (tab === 'cam') return d.stage === 'CAM';
  if (tab === 'casting') return d.stage === 'CASTING';
  if (tab === 'samples') return d.stage === 'SAMPLES';
  if (tab === 'orderpending') return d.stage === 'SAMPLE' && !isOrderReceived(d);
  return false;
}
function isCadAllotmentIncomplete(d){
  if (!d || d.stage !== 'CAD') return false;
  var cad = d.cad || {};
  return !d.artNo || !cad.assignee;
}
function cadNeedsFirstUpload(d){
  if (!d || d.stage !== 'CAD') return false;
  var cad = d.cad || {};
  if (!cad.assignee) return false;
  if (String(cad.assignee).toLowerCase() !== CURRENT_USERNAME) return false;
  var updates = Array.isArray(cad.updates) ? cad.updates : [];
  return updates.length === 0;
}
function getUnseenCountsByTab(){
  var all = getAllDesigns();
  var out = {};
  for (var tab in SEEN_KEY_MAP){
    if (!SEEN_KEY_MAP.hasOwnProperty(tab)) continue;
    var seen = Number(sessionStorage.getItem(SEEN_KEY_MAP[tab]) || 0);
    out[tab] = all.filter(function(d){
      if (!designInTab(d, tab)) return false;
      if (tab === 'cad' && isCadDesignerUser()) return cadNeedsFirstUpload(d);
      if (tab === 'cad' && isCadAllotmentIncomplete(d) && canAllotCadDesign()) return true;
      var ts = designTimeForTab(d, tab);
      if (!ts) ts = parseTime(d.createdAt);
      return ts && ts > seen;
    }).length;
  }
  return out;
}
function updateTabBadges(){
  var counts = getUnseenCountsByTab();
  var total = 0;
  for (var tab in SEEN_KEY_MAP){
    if (!SEEN_KEY_MAP.hasOwnProperty(tab)) continue;
    var btn = document.querySelector('#mainTabs .tab[data-tab="'+tab+'"]');
    if (!btn) continue;
    var existing = btn.querySelector('.notif-dot');
    if (existing) existing.remove();
    if (btn.classList.contains('hidden')) continue;
    var c = counts[tab] || 0;
    if (c > 0){
      var dot = document.createElement('span');
      dot.className = 'notif-dot';
      dot.textContent = c > 9 ? '9+' : String(c);
      btn.appendChild(dot);
      total += c;
    }
  }
  var bellCount = document.getElementById('headerBellCount');
  if (bellCount){
    if (total > 0){
      bellCount.textContent = total > 99 ? '99+' : String(total);
      bellCount.classList.remove('hidden');
      bellCount.classList.add('pulse');
    } else {
      bellCount.classList.add('hidden');
      bellCount.classList.remove('pulse');
    }
  }
}
function markTabSeen(tabName){
  if (SEEN_KEY_MAP[tabName]) sessionStorage.setItem(SEEN_KEY_MAP[tabName], Date.now());
}
function switchTab(tabName){
  var tabs = document.querySelectorAll('#mainTabs .tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  var target = document.querySelector('#mainTabs .tab[data-tab="'+tabName+'"]');
  if (target) target.classList.add('active');
  var panels = document.querySelectorAll('.tab-panel');
  for (var j = 0; j < panels.length; j++) panels[j].classList.add('hidden');
  var panel = document.getElementById('tab-' + tabName);
  if (panel) panel.classList.remove('hidden');

  var bellBtn = document.getElementById('headerBellBtn');
  if (bellBtn){
    if (tabName === 'bank') bellBtn.classList.add('hidden');
    else bellBtn.classList.remove('hidden');
  }

  markTabSeen(tabName);
  updateWorkflowTitle(tabName);
  renderAll();
}
var mainTabEls = document.querySelectorAll('#mainTabs .tab');
for (var mt = 0; mt < mainTabEls.length; mt++){
  (function(el){ el.addEventListener('click', function(){ switchTab(el.dataset.tab); }); })(mainTabEls[mt]);
}

/* ---- Bank subtabs (Add New Design / Artist Wise Reports) ---- */
var bankSubTabEls = document.querySelectorAll('#tab-bank .subtab');
for (var bs = 0; bs < bankSubTabEls.length; bs++){
  (function(el){
    el.addEventListener('click', function(){
      var subs = document.querySelectorAll('#tab-bank .subtab');
      for (var k = 0; k < subs.length; k++) subs[k].classList.remove('active');
      el.classList.add('active');
      var name = el.dataset.subtab;
      var addPane = document.getElementById('subtab-bank-add');
      var rptPane = document.getElementById('subtab-bank-artist-report');
      if (addPane) addPane.classList.toggle('hidden', name !== 'bank-add');
      if (rptPane) rptPane.classList.toggle('hidden', name !== 'bank-artist-report');
      if (name === 'bank-artist-report') renderArtistWiseReport();
    });
  })(bankSubTabEls[bs]);
}

var cadSubTabEls = document.querySelectorAll('#tab-cad .subtab');
for (var st = 0; st < cadSubTabEls.length; st++){
  (function(el){
    el.addEventListener('click', function(){
      var subs = document.querySelectorAll('#tab-cad .subtab');
      for (var k = 0; k < subs.length; k++) subs[k].classList.remove('active');
      el.classList.add('active');
      var name = el.dataset.subtab;
      document.getElementById('subtab-cad-received').classList.toggle('hidden', name !== 'cad-received');
      document.getElementById('subtab-cad-updates').classList.toggle('hidden', name !== 'cad-updates');
      var dr = document.getElementById('subtab-cad-designer-report');
      if (dr) dr.classList.toggle('hidden', name !== 'cad-designer-report');
      if (name === 'cad-updates') renderCadUpdates();
      if (name === 'cad-designer-report') renderCadDesignerReport();
    });
  })(cadSubTabEls[st]);
}
document.getElementById('headerBellBtn').addEventListener('click', function(){
  if (isCadDesignerUser()){
    switchTab('cad');
    var upBtn = document.querySelector('#tab-cad .subtab[data-subtab="cad-updates"]');
    if (upBtn) upBtn.click();
    return;
  }
  if (!isCadDesignerUser()){
    var all = getAllDesigns();
    var incomplete = all.filter(isCadAllotmentIncomplete);
    if (incomplete.length && canAllotCadDesign()){
      switchTab('cad');
      var recBtn = document.querySelector('#tab-cad .subtab[data-subtab="cad-received"]');
      if (recBtn) recBtn.click();
      return;
    }
  }
  var counts = getUnseenCountsByTab();
  var order = ['cad','cam','casting','samples','orderpending'];
  for (var i = 0; i < order.length; i++){
    var tab = order[i];
    var btn = document.querySelector('#mainTabs .tab[data-tab="'+tab+'"]');
    if (!btn || btn.classList.contains('hidden')) continue;
    if ((counts[tab] || 0) > 0){ switchTab(tab); return; }
  }
  alert('No new items. You are all caught up!');
});

/* ============================================================
   DATA MODEL & ART NUMBER
   ============================================================ */
function normalizeArtNo(raw){
  if (!raw) return '';
  var s = String(raw).trim();
  var matches = s.match(/(\d+)(?!.*\d)/);
  if (matches) return matches[1];
  return s.replace(/[^a-z0-9]/gi,'').toLowerCase();
}
function getAllDesigns(){ var d = readJSON(DESIGNS_KEY, []); return Array.isArray(d) ? d : []; }
function saveAllDesigns(list){ saveJSON(DESIGNS_KEY, list); }
function getDesignById(id){ return getAllDesigns().find(function(x){ return x.id === id; }); }
function updateDesign(id, patch){
  var list = getAllDesigns();
  var idx = list.findIndex(function(x){ return x.id === id; });
  if (idx === -1) return null;
  list[idx] = Object.assign({}, list[idx], patch);
  saveAllDesigns(list);
  return list[idx];
}
function deleteDesign(id){
  var list = getAllDesigns();
  var idx = list.findIndex(function(x){ return x.id === id; });
  if (idx === -1) return false;
  list.splice(idx, 1); saveAllDesigns(list); return true;
}

function getOrderedArtNoSet(){
  var set = {};
  var orders = readJSON(ORDERS_KEY, []);
  if (Array.isArray(orders)){
    orders.forEach(function(o){
      if (!o) return;
      var items = Array.isArray(o.items) ? o.items : [];
      items.forEach(function(it){ var real = normalizeArtNo(it && (it.artNo || it.artNumber || '')); if (real) set[real] = true; });
      var mainReal = normalizeArtNo(o && (o.artNo || '')); if (mainReal) set[mainReal] = true;
    });
  }
  return set;
}
function isOrderReceived(design){
  var real = normalizeArtNo(design.artNo); if (!real) return false;
  return !!getOrderedArtNoSet()[real];
}
function getOrderPlacedAt(design){
  if (!design) return null;
  if (design.orderPlacedAt) return design.orderPlacedAt;
  var real = normalizeArtNo(design.artNo); if (!real) return null;
  var orders = readJSON(ORDERS_KEY, []);
  if (!Array.isArray(orders)) return null;
  for (var i = 0; i < orders.length; i++){
    var o = orders[i]; if (!o) continue;
    var found = false;
    var items = Array.isArray(o.items) ? o.items : [];
    items.forEach(function(it){ if (it && normalizeArtNo(it.artNo || it.artNumber || '') === real) found = true; });
    if (normalizeArtNo(o.artNo || '') === real) found = true;
    if (found) return o.date || o.createdAt || o.updatedAt || null;
  }
  return null;
}

/* ============================================================
   SEARCHABLE SELECT
   ============================================================ */
function initSearchableSelect(opts){
  var input = document.getElementById(opts.inputId);
  var hidden = document.getElementById(opts.hiddenId);
  var dropdown = document.getElementById(opts.dropdownId);
  var wrap = document.getElementById(opts.wrapId);
  if (!input || !dropdown) return null;
  var highlightIdx = -1;

  function buildDropdown(filter){
    var options = opts.getOptions();
    var q = String(filter||'').toLowerCase().trim();
    var matches = options.filter(function(g){ return String(g).toLowerCase().indexOf(q) !== -1; });
    if (!matches.length){
      dropdown.innerHTML = '<div class="no-match">No matching option</div>';
    } else {
      dropdown.innerHTML = matches.map(function(g, i){
        return '<div class="option" data-value="'+escapeHtml(g)+'" data-idx="'+i+'">'+escapeHtml(g)+'</div>';
      }).join('');
    }
    dropdown.classList.add('show');
    highlightIdx = -1;
  }
  function selectOption(value){ hidden.value = value; input.value = value; dropdown.classList.remove('show'); }

  input.addEventListener('focus', function(){ buildDropdown(input.value); });
  input.addEventListener('input', function(){ hidden.value = ''; buildDropdown(input.value); });
  input.addEventListener('keydown', function(e){
    var options = dropdown.querySelectorAll('.option'); if (!options.length) return;
    if (e.key === 'ArrowDown'){ e.preventDefault(); highlightIdx = Math.min(highlightIdx + 1, options.length - 1); updateHighlight(options); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); highlightIdx = Math.max(highlightIdx - 1, 0); updateHighlight(options); }
    else if (e.key === 'Enter'){ e.preventDefault(); if (highlightIdx >= 0 && options[highlightIdx]) selectOption(options[highlightIdx].getAttribute('data-value')); }
    else if (e.key === 'Escape'){ dropdown.classList.remove('show'); }
  });
  function updateHighlight(options){
    for (var i = 0; i < options.length; i++) options[i].classList.toggle('highlight', i === highlightIdx);
    if (options[highlightIdx]) options[highlightIdx].scrollIntoView({block:'nearest'});
  }
  dropdown.addEventListener('mousedown', function(e){
    var opt = e.target.closest('.option');
    if (opt){ e.preventDefault(); selectOption(opt.getAttribute('data-value')); }
  });
  document.addEventListener('click', function(e){ if (!wrap.contains(e.target)) dropdown.classList.remove('show'); });

  return {
    reset: function(){ hidden.value = ''; input.value = ''; dropdown.classList.remove('show'); },
    setValue: function(v){ hidden.value = v || ''; input.value = v || ''; }
  };
}

var cadDesignerSelect = initSearchableSelect({
  inputId:'cadDesignerSearch', hiddenId:'cadDesignerValue', dropdownId:'cadDesignerDropdown', wrapId:'cadDesignerSearchWrap',
  getOptions: function(){ return getCadDesignerDisplayList(); }
});
var cadFilterAssigneeSelect = initSearchableSelect({
  inputId:'cadFilterAssigneeSearch', hiddenId:'cadFilterAssigneeValue', dropdownId:'cadFilterAssigneeDropdown', wrapId:'cadFilterAssigneeWrap',
  getOptions: function(){ return getCadDesignerDisplayList(); }
});

/* ============================================================
   IMAGE PREVIEW HELPERS
   ============================================================ */
var uploadedImage = null;
document.getElementById('fImage').addEventListener('change', function(e){
  var file = e.target.files && e.target.files[0];
  if (!file) { uploadedImage = null; var p = document.getElementById('imgPreview'); p.classList.add('hidden'); p.src=''; return; }
  var reader = new FileReader();
  reader.onload = function(ev){
    uploadedImage = ev.target.result;
    var img = document.getElementById('imgPreview');
    img.src = uploadedImage; img.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

var modalImages = { cam: null, cast: null, cadUpdate: null };
function setupModalImage(inputId, previewId, key){
  var input = document.getElementById(inputId);
  var preview = document.getElementById(previewId);
  if (!input || !preview) return;
  input.addEventListener('change', function(e){
    var file = e.target.files && e.target.files[0];
    if (!file) { modalImages[key] = null; preview.classList.add('hidden'); preview.src=''; return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      modalImages[key] = ev.target.result;
      preview.src = modalImages[key]; preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });
}
setupModalImage('camImage','camImgPreview','cam');
setupModalImage('castImage','castImgPreview','cast');
setupModalImage('cadUpdateImage','cadUpdatePreview','cadUpdate');

function resetModalImage(key, previewId){
  modalImages[key] = null;
  var p = document.getElementById(previewId);
  if (p) { p.classList.add('hidden'); p.src = ''; }
  var map = { cam:'camImage', cast:'castImage', cadUpdate:'cadUpdateImage' };
  var input = document.getElementById(map[key]);
  if (input) input.value = '';
}

var editImages = { base: null, cad: null, cam: null, cast: null };
function setupEditImage(inputId, previewId, key){
  var input = document.getElementById(inputId);
  var preview = document.getElementById(previewId);
  if (!input || !preview) return;
  input.addEventListener('change', function(e){
    var file = e.target.files && e.target.files[0];
    if (!file) { editImages[key] = null; preview.classList.add('hidden'); preview.src=''; return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      editImages[key] = ev.target.result;
      preview.src = editImages[key]; preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });
}
setupEditImage('eImage','eImgPreview','base');
setupEditImage('eCadImage','eCadImgPreview','cad');
setupEditImage('eCamImage','eCamImgPreview','cam');
setupEditImage('eCastImage','eCastImgPreview','cast');

function resetEditImages(){
  ['base','cad','cam','cast'].forEach(function(k){ editImages[k] = null; });
  ['eImgPreview','eCadImgPreview','eCamImgPreview','eCastImgPreview'].forEach(function(id){
    var el = document.getElementById(id); if (el) { el.classList.add('hidden'); el.src = ''; }
  });
  ['eImage','eCadImage','eCamImage','eCastImage'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
}

/* ============================================================
   CATEGORY → SHOW/HIDE NAME & SAVE
   ============================================================ */
function updateCategoryFields(){
  var nameWrap = document.getElementById('nameWrap');
  if (nameWrap) nameWrap.style.display = '';
}
document.getElementById('fCategory').addEventListener('change', updateCategoryFields);

function showBankMsg(text, isError){
  var msg = document.getElementById('bankMessage');
  msg.textContent = text;
  msg.classList.remove('show','error'); msg.classList.add('show');
  if (isError) msg.classList.add('error');
}
document.getElementById('saveDesignBtn').addEventListener('click', function(){
  try {
    var cat = document.getElementById('fCategory').value;
    var name = document.getElementById('fName').value.trim();
    var grp = document.getElementById('fGroup').value;
    var date = document.getElementById('fDate').value;
    var artist = document.getElementById('fArtist').value.trim();
    if (!name){ showBankMsg('Product Name is required.', true); return; }
    if (!uploadedImage){ showBankMsg('Please upload an image.', true); return; }
    var list = getAllDesigns();
    var design = {
      id: 'D' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      artNo: '', realArtNo: '', name: name, category: cat, group: grp,
      size: '', sizeIn: '', date: date, artist: artist, image: uploadedImage, stage: 'BANK',
      createdAt: new Date().toISOString(), cad: null, cam: null, casting: null, samples: null, orderPlacedAt: null
    };
    list.push(design); saveAllDesigns(list);
    document.getElementById('fName').value = '';
    document.getElementById('fArtist').value = '';
    document.getElementById('fImage').value = '';
    var prev = document.getElementById('imgPreview'); prev.classList.add('hidden'); prev.src = '';
    uploadedImage = null;
    showBankMsg('✓ Design "'+name+'" saved to Designs Bank.', false);
    setTimeout(function(){ document.getElementById('bankMessage').classList.remove('show'); }, 5000);
    renderAll();
  } catch(err){ console.error(err); showBankMsg('Error saving design: ' + err.message, true); }
});

/* ============================================================
   EDIT DESIGN MODAL
   ============================================================ */
var editingDesignId = null;
function openEditModal(id){
  var d = getDesignById(id);
  if (!d){ alert('Design not found.'); return; }
  editingDesignId = id;
  document.getElementById('editStageInfo').innerHTML = '<b>' + escapeHtml(d.artNo || '(no art no yet)') + '</b> — ' + escapeHtml(d.name) + '<br><span style="font-size:12px;color:#555">Current Stage: <b>' + STAGE_LABELS[d.stage] + '</b></span>';
  document.getElementById('eCategory').value = d.category || '3D IDOLS';
  document.getElementById('eGroup').value = d.group || 'Regular';
  document.getElementById('eArtNo').value = d.artNo || '';
  document.getElementById('eName').value = d.name || '';
  document.getElementById('eSize').value = d.size || '';
  document.getElementById('eSizeIn').value = d.sizeIn || '';
  document.getElementById('eDate').value = d.date || '';
  document.getElementById('eArtist').value = d.artist || '';
  updateEditCategoryFields();
  resetEditImages();
  var cadSec = document.getElementById('editCadSection');
  if (d.cad){
    cadSec.classList.remove('hidden');
    document.getElementById('eCadGrossWt').value = d.cad.grossWt || '';
    document.getElementById('eCadNetWt').value = d.cad.netWt || '';
    document.getElementById('eCadArtist').value = d.cad.artist || '';
    document.getElementById('eCadBranch').value = d.cad.branch || '';
    document.getElementById('eCadAssignee').value = d.cad.assignee || '';
    document.getElementById('eCadChanges').value = d.cad.changes || '';
    if (d.cad.image){ var p = document.getElementById('eCadImgPreview'); p.src = d.cad.image; p.classList.remove('hidden'); }
  } else cadSec.classList.add('hidden');
  var camSec = document.getElementById('editCamSection');
  if (d.cam){
    camSec.classList.remove('hidden');
    document.getElementById('eCamGrossWt').value = d.cam.grossWt || '';
    document.getElementById('eCamBranch').value = d.cam.branch || '';
    document.getElementById('eCamChanges').value = d.cam.changes || '';
    if (d.cam.image){ var p2 = document.getElementById('eCamImgPreview'); p2.src = d.cam.image; p2.classList.remove('hidden'); }
  } else camSec.classList.add('hidden');
  var castSec = document.getElementById('editCastingSection');
  if (d.casting){
    castSec.classList.remove('hidden');
    document.getElementById('eCastGrossWt').value = d.casting.grossWt || '';
    if (d.casting.image){ var p3 = document.getElementById('eCastImgPreview'); p3.src = d.casting.image; p3.classList.remove('hidden'); }
  } else castSec.classList.add('hidden');
  document.getElementById('editMessage').classList.remove('show','error');
  document.getElementById('editModal').classList.remove('hidden');
}
function updateEditCategoryFields(){
  var w = document.getElementById('eNameWrap');
  if (w) w.style.display = '';
}
document.getElementById('eCategory').addEventListener('change', updateEditCategoryFields);
function showEditMsg(text, isError){
  var m = document.getElementById('editMessage');
  m.textContent = text; m.classList.remove('show','error'); m.classList.add('show');
  if (isError) m.classList.add('error');
}
document.getElementById('closeEditModal').addEventListener('click', function(){ document.getElementById('editModal').classList.add('hidden'); editingDesignId = null; });
document.getElementById('cancelEditBtn').addEventListener('click', function(){ document.getElementById('editModal').classList.add('hidden'); editingDesignId = null; });
document.getElementById('saveEditBtn').addEventListener('click', function(){
  if (!editingDesignId) return;
  var d = getDesignById(editingDesignId);
  if (!d){ showEditMsg('Design not found.', true); return; }
  var newArt = document.getElementById('eArtNo').value.trim();
  var newName = document.getElementById('eName').value.trim();
  var catVal = document.getElementById('eCategory').value;
  if (!newName){ showEditMsg('Product Name is required.', true); return; }
  var realArt = normalizeArtNo(newArt);
  var list = getAllDesigns();
  if (newArt){
    var dup = list.find(function(x){ return x.id !== editingDesignId && normalizeArtNo(x.artNo) === realArt; });
    if (dup){ showEditMsg('Art Number "'+newArt+'" already exists as "'+dup.artNo+'".', true); return; }
  }
  var patch = {
    artNo: newArt, realArtNo: realArt, name: newName, category: catVal, group: document.getElementById('eGroup').value,
    size: document.getElementById('eSize').value.trim(), sizeIn: document.getElementById('eSizeIn').value.trim(),
    date: document.getElementById('eDate').value, artist: document.getElementById('eArtist').value.trim()
  };
  if (editImages.base) patch.image = editImages.base;
  if (d.cad){
    patch.cad = Object.assign({}, d.cad, {
      grossWt: Number(document.getElementById('eCadGrossWt').value) || 0,
      netWt: Number(document.getElementById('eCadNetWt').value) || 0,
      artist: document.getElementById('eCadArtist').value.trim(),
      branch: document.getElementById('eCadBranch').value,
      changes: document.getElementById('eCadChanges').value.trim()
    });
    if (editImages.cad) patch.cad.image = editImages.cad;
  }
  if (d.cam){
    patch.cam = Object.assign({}, d.cam, {
      grossWt: Number(document.getElementById('eCamGrossWt').value) || 0,
      branch: document.getElementById('eCamBranch').value,
      changes: document.getElementById('eCamChanges').value.trim()
    });
    if (editImages.cam) patch.cam.image = editImages.cam;
  }
  if (d.casting){
    patch.casting = Object.assign({}, d.casting, { grossWt: Number(document.getElementById('eCastGrossWt').value) || 0 });
    if (editImages.cast) patch.casting.image = editImages.cast;
  }
  updateDesign(editingDesignId, patch);
  showEditMsg('✓ Changes saved.', false);
  setTimeout(function(){ document.getElementById('editModal').classList.add('hidden'); editingDesignId = null; renderAll(); }, 500);
});

function deleteDesignById(id){
  var d = getDesignById(id);
  if (!d) return;
  if (d.stage === 'CAD' && !canDeleteCadDesign()){ alert('You are not allowed to delete this CAD design.'); return; }
  if (!confirm('Delete design "' + (d.artNo || d.name) + ' — ' + d.name + '"?\n\nThis will permanently remove it from all sections.')) return;
  deleteDesign(id); renderAll();
}

/* ============================================================
   FORWARD TO CAD  (★ CHANGED: now sends Telegram + WhatsApp)
   ============================================================ */
var pendingCadId = null;
function openCadModal(id){
  var design = getDesignById(id);
  if (!design){ alert('Design not found.'); return; }
  if (design.stage !== 'BANK'){ alert('This design is already in ' + STAGE_LABELS[design.stage] + '.'); return; }
  pendingCadId = id;
  var imgHtml = design.image ? '<img src="'+design.image+'" alt="Design" onclick="openZoom(this.src)">' : '<div style="text-align:center;color:#999;font-size:12px;padding:10px">No image available</div>';
  document.getElementById('cadDesignInfo').innerHTML =
    '<div class="info-row"><span class="k">Product Name</span><span class="v">'+escapeHtml(design.name)+'</span></div>'
    + '<div class="info-row"><span class="k">Category</span><span class="v">'+escapeHtml(design.category)+'</span></div>'
    + '<div class="info-row"><span class="k">Group</span><span class="v">'+escapeHtml(design.group)+'</span></div>'
    + (design.date ? '<div class="info-row"><span class="k">Date</span><span class="v">'+formatDate(design.date)+'</span></div>' : '')
    + imgHtml;
  document.getElementById('cadGrossWt').value = '';
  document.getElementById('cadChanges').value = '';
  document.getElementById('cadMessage').classList.remove('show','error');
  document.getElementById('cadModal').classList.remove('hidden');
}
document.getElementById('closeCadModal').addEventListener('click', function(){ document.getElementById('cadModal').classList.add('hidden'); pendingCadId = null; });
document.getElementById('cancelCadBtn').addEventListener('click', function(){ document.getElementById('cadModal').classList.add('hidden'); pendingCadId = null; });
document.getElementById('confirmCadBtn').addEventListener('click', function(){
  if (!pendingCadId) return;
  var m = document.getElementById('cadMessage'); m.classList.remove('show','error');
  var design = getDesignById(pendingCadId);
  if (!design){ m.textContent = 'Design not found.'; m.classList.add('show','error'); return; }
  var cad = {
    grossWt: Number(document.getElementById('cadGrossWt').value) || 0, netWt: 0,
    changes: document.getElementById('cadChanges').value.trim(),
    image: design.image || '', forwardedAt: new Date().toISOString(),
    assignee: '', assignedAt: null, updates: []
  };
  updateDesign(pendingCadId, { stage:'CAD', cad: cad, cadForwardedAt: cad.forwardedAt });

  // ★ NEW — notify CAD section + Designs section + admin via Telegram, and open WhatsApp
  var updatedDesign = getDesignById(pendingCadId);
  var extraLine = 'Est. Wt: <b>' + formatNumber2(cad.grossWt || 0) + ' g</b>'
                + (cad.changes ? '\nChanges: ' + escapeHtml(cad.changes) : '');
  notifySectionForward({
    fromSection: 'designs',
    toSection:   'cad',
    design:      updatedDesign,
    extra:       extraLine
  }).then(function(results){
    var attempted = results.filter(function(r){ return r && !r.skipped; });
    if (attempted.length > 0) showTelegramResult(results);
  }).catch(function(err){ console.error('Telegram error', err); });

  try {
    notifyWhatsApp({
      fromSection: 'designs',
      toSection:   'cad',
      design:      updatedDesign,
      extra:       'Est. Wt: ' + formatNumber2(cad.grossWt || 0) + ' g' + (cad.changes ? ' | Changes: ' + cad.changes : '')
    });
  } catch(e){ console.warn('WhatsApp notify failed', e); }

  document.getElementById('cadModal').classList.add('hidden');
  pendingCadId = null;
  renderAll();
});

/* ============================================================
   CAD ALLOTMENT
   ============================================================ */
var pendingAllotCadId = null;
function openAllotCadModal(id){
  if (!canAllotCadDesign()){ alert('Only Admin or CAD Charge can allot designs to CAD designers.'); return; }
  var design = getDesignById(id);
  if (!design){ alert('Design not found.'); return; }
  if (design.stage !== 'CAD'){ alert('Design not in CAD stage.'); return; }
  pendingAllotCadId = id;
  var cad = design.cad || {};
  document.getElementById('allotDesignInfo').innerHTML =
    '<div class="info-row"><span class="k">Product</span><span class="v">'+escapeHtml(design.name)+'</span></div>'
    + '<div class="info-row"><span class="k">Category</span><span class="v">'+escapeHtml(design.category)+'</span></div>'
    + '<div class="info-row"><span class="k">Current Art No</span><span class="v">'+escapeHtml(design.artNo || '—')+'</span></div>'
    + '<div class="info-row"><span class="k">Current Assignee</span><span class="v">'+escapeHtml(cad.assignee || '—')+'</span></div>';
  document.getElementById('allotArtNo').value = design.artNo || '';
  var cadDesigners = getCadDesignerDisplayList();
  var hint = document.getElementById('cadDesignerEmptyHint');
  if (!cadDesigners.length){ if (hint) hint.classList.remove('hidden'); } else { if (hint) hint.classList.add('hidden'); }
  if (cadDesignerSelect){ cadDesignerSelect.reset(); if (cad.assignee) cadDesignerSelect.setValue(cad.assignee); }
  document.getElementById('allotCadMessage').classList.remove('show','error');
  document.getElementById('allotCadModal').classList.remove('hidden');
}
document.getElementById('closeAllotCadModal').addEventListener('click', function(){ document.getElementById('allotCadModal').classList.add('hidden'); pendingAllotCadId = null; });
document.getElementById('cancelAllotCadBtn').addEventListener('click', function(){ document.getElementById('allotCadModal').classList.add('hidden'); pendingAllotCadId = null; });
document.getElementById('confirmAllotCadBtn').addEventListener('click', function(){
  if (!pendingAllotCadId) return;
  var m = document.getElementById('allotCadMessage'); m.classList.remove('show','error');
  var designer = document.getElementById('cadDesignerValue').value.trim();
  var artInput = document.getElementById('allotArtNo');
  var artNo = (artInput && artInput.value ? artInput.value : '').trim();

  if (designer){
    var valid = getCadDesignerDisplayList().some(function(n){ return String(n).toLowerCase() === designer.toLowerCase(); });
    if (!valid){ m.textContent = '⚠ Selected designer not found in CAD Designers list.'; m.classList.add('show','error'); return; }
  }
  if (!designer){ m.textContent = '⚠ Please select a CAD designer.'; m.classList.add('show','error'); return; }
  if (!artNo){ m.textContent = '⚠ Art Number is required.'; m.classList.add('show','error'); if (artInput) artInput.focus(); return; }
  var realArt = normalizeArtNo(artNo);
  if (!realArt){ m.textContent = '⚠ Art Number must contain at least one digit.'; m.classList.add('show','error'); if (artInput) artInput.focus(); return; }
  var d = getDesignById(pendingAllotCadId);
  if (!d){ m.textContent = 'Design not found.'; m.classList.add('show','error'); return; }
  var list = getAllDesigns();
  var dup = list.find(function(x){ return x.id !== pendingAllotCadId && normalizeArtNo(x.artNo) === realArt; });
  if (dup){ m.textContent = '⚠ Art Number "'+artNo+'" already exists as "'+dup.artNo+'".'; m.classList.add('show','error'); if (artInput) artInput.focus(); return; }

  var branchForOrder = (d.cad && d.cad.branch) || CURRENT_BRANCH || '';
  var cad = Object.assign({}, d.cad || {}, { assignee: designer, assignedAt: new Date().toISOString(), artNoAllottedAt: new Date().toISOString(), branch: (d.cad && d.cad.branch) || branchForOrder || '' });
  updateDesign(pendingAllotCadId, { cad: cad, artNo: artNo, realArtNo: realArt });

  var updated = getDesignById(pendingAllotCadId);
  try { printSilverCadOrder(updated, { dateOfIssue: formatDate(todayIso()), assignee: designer, branch: 'CAD Section', changes: (updated.cad && updated.cad.changes) || '' }); } catch(e){ console.error(e); }

  var telegramText = buildSilverCadOrderText(updated, { dateOfIssue: formatDate(todayIso()), assignee: designer, branch: 'CAD Section', changes: (updated.cad && updated.cad.changes) || '' });
  sendTelegramToDesignerAndAdmin(designer, telegramText).then(function(results){
    var attempted = results.filter(function(r){ return r && !r.skipped; });
    if (attempted.length > 0) showTelegramResult(results);
  }).catch(function(err){ console.error('Telegram error', err); });

  document.getElementById('allotCadModal').classList.add('hidden');
  pendingAllotCadId = null;
  renderAll();
});

/* ============================================================
   CAD UPDATE & PRINT
   ============================================================ */
var pendingCadUpdateId = null;
function openCadUpdateModal(id){
  if (!canUpdateCadProgress()){ alert('You are not allowed to upload CAD progress.'); return; }
  var design = getDesignById(id);
  if (!design){ alert('Design not found.'); return; }
  if (design.stage !== 'CAD'){ alert('Design not in CAD stage.'); return; }
  if (!design.artNo){ alert('This design has no Art Number yet. Please allot it first using the "Allot" button in CAD Section — Designs Received.'); return; }
  if (isCadDesignerUser()){
    var cadA = design.cad || {};
    if (cadA.assignee && String(cadA.assignee).toLowerCase() !== CURRENT_USERNAME){ alert('This design is allotted to someone else.'); return; }
  }
  pendingCadUpdateId = id;
  var cad = design.cad || {};
  var count = (cad.updates || []).length;
  document.getElementById('cadUpdateInfo').innerHTML =
    '<div class="info-row"><span class="k">Product</span><span class="v">'+escapeHtml(design.name)+'</span></div>'
    + '<div class="info-row"><span class="k">Assignee</span><span class="v">'+escapeHtml(cad.assignee||'Unassigned')+'</span></div>'
    + '<div class="info-row"><span class="k">Art Number</span><span class="v">'+escapeHtml(design.artNo||'—')+'</span></div>'
    + '<div class="info-row"><span class="k">Existing Updates</span><span class="v">'+count+'</span></div>';
  document.getElementById('cadUpdateArtDisplay').textContent = design.artNo || '—';
  document.getElementById('cadUpdateSizeMm').value = design.size || '';
  document.getElementById('cadUpdateNote').value = '';
  document.getElementById('cadUpdateMessage').classList.remove('show','error');
  resetModalImage('cadUpdate','cadUpdatePreview');
  document.getElementById('cadUpdateModal').classList.remove('hidden');
}
document.getElementById('closeCadUpdateModal').addEventListener('click', function(){ document.getElementById('cadUpdateModal').classList.add('hidden'); pendingCadUpdateId = null; });
document.getElementById('cancelCadUpdateBtn').addEventListener('click', function(){ document.getElementById('cadUpdateModal').classList.add('hidden'); pendingCadUpdateId = null; });
document.getElementById('confirmCadUpdateBtn').addEventListener('click', function(){
  try {
    if (!pendingCadUpdateId){ alert('No design selected.'); return; }
    var m = document.getElementById('cadUpdateMessage'); m.classList.remove('show','error');
    if (!modalImages.cadUpdate){ m.textContent = '⚠ Please upload an image.'; m.classList.add('show','error'); return; }
    var d = getDesignById(pendingCadUpdateId);
    if (!d){ m.textContent = 'Design not found.'; m.classList.add('show','error'); return; }
    if (!d.artNo){ m.textContent = '⚠ No Art Number allotted. Please allot first.'; m.classList.add('show','error'); return; }
    if (isCadDesignerUser()){
      var cA = d.cad || {};
      if (cA.assignee && String(cA.assignee).toLowerCase() !== CURRENT_USERNAME){ m.textContent = '⚠ This design is allotted to someone else.'; m.classList.add('show','error'); return; }
    }
    var newSizeMm = (document.getElementById('cadUpdateSizeMm').value || '').trim();
    var cad = Object.assign({}, d.cad || {});
    cad.updates = Array.isArray(cad.updates) ? cad.updates.slice() : [];
    var by = (session && session.username) ? session.username : 'unknown';
    if (cad.assignee) by = cad.assignee;
    cad.updates.push({ image: modalImages.cadUpdate, at: new Date().toISOString(), note: (document.getElementById('cadUpdateNote').value || '').trim(), by: by, artNo: d.artNo, sizeMm: newSizeMm });
    var patch = { cad: cad };
    if (newSizeMm) patch.size = newSizeMm;
    updateDesign(pendingCadUpdateId, patch);
    document.getElementById('cadUpdateModal').classList.add('hidden');
    pendingCadUpdateId = null;
    renderAll();
  } catch(err){ console.error(err); var m2 = document.getElementById('cadUpdateMessage'); if (m2){ m2.textContent = '⚠ Error: ' + err.message; m2.classList.add('show','error'); } else alert('Error: ' + err.message); }
});

/* ============================================================
   FORWARD TO CAM  (kept as Silver CAD Order Telegram — already wired)
   ============================================================ */
var pendingCamId = null;
function getLastCadUpdateImage(design){
  if (!design || !design.cad) return null;
  var updates = Array.isArray(design.cad.updates) ? design.cad.updates : [];
  if (updates.length){ var last = updates[updates.length-1]; if (last && last.image) return last.image; }
  return null;
}
function openCamModal(id){
  if (!canForwardCadToCam()){ alert('Only Admin or CAD Charge can forward a design to CAM.'); return; }
  var design = getDesignById(id);
  if (!design){ alert('Design not found.'); return; }
  if (design.stage !== 'CAD'){ alert('This design is not in the CAD stage (current: ' + STAGE_LABELS[design.stage] + ').'); return; }
  pendingCamId = id;
  var defaultArtNo = design.artNo || '';
  if (!defaultArtNo && design.cad && Array.isArray(design.cad.updates)){
    for (var i = design.cad.updates.length - 1; i >= 0; i--){ if (design.cad.updates[i] && design.cad.updates[i].artNo){ defaultArtNo = design.cad.updates[i].artNo; break; } }
  }
  document.getElementById('camDesignInfo').innerHTML =
    '<b>' + escapeHtml(design.name) + '</b><br><span style="font-size:12px;color:#555">' + escapeHtml(design.category) + ' · ' + escapeHtml(design.group) + '</span>'
    + (defaultArtNo ? '<br><span style="font-size:11px;color:#094d9c;font-weight:700">📋 Art Number pre-filled: <b>'+escapeHtml(defaultArtNo)+'</b></span>' : '');
  document.getElementById('camArtNo').value = defaultArtNo;
  document.getElementById('camSizeMm').value = design.size || '';
  document.getElementById('camGrossWt').value = (design.cad && design.cad.grossWt) ? design.cad.grossWt : '';
  document.getElementById('camForwardDate').value = todayIso();
  document.getElementById('camBranch').value = '';
  document.getElementById('camChanges').value = '';
  document.getElementById('camMessage').classList.remove('show','error');
  resetModalImage('cam','camImgPreview');
  var defaultImgBox = document.getElementById('camDefaultImgBox');
  var defaultImg = document.getElementById('camDefaultImg');
  var lastCadImg = getLastCadUpdateImage(design);
  if (lastCadImg){ modalImages.cam = lastCadImg; defaultImg.src = lastCadImg; defaultImgBox.classList.remove('hidden'); }
  else { defaultImgBox.classList.add('hidden'); defaultImg.src = ''; }
  document.getElementById('camModal').classList.remove('hidden');
}
document.getElementById('closeCamModal').addEventListener('click', function(){ document.getElementById('camModal').classList.add('hidden'); pendingCamId = null; modalImages.cam = null; document.getElementById('camDefaultImgBox').classList.add('hidden'); });
document.getElementById('cancelCamBtn').addEventListener('click', function(){ document.getElementById('camModal').classList.add('hidden'); pendingCamId = null; modalImages.cam = null; document.getElementById('camDefaultImgBox').classList.add('hidden'); });
document.getElementById('confirmCamBtn').addEventListener('click', function(){
  if (!pendingCamId) return;
  var m = document.getElementById('camMessage'); m.classList.remove('show','error');
  var artNo = document.getElementById('camArtNo').value.trim();
  var sizeMm = document.getElementById('camSizeMm').value.trim();
  var gw = Number(document.getElementById('camGrossWt').value) || 0;
  var fwdDate = document.getElementById('camForwardDate').value || todayIso();
  var branch = document.getElementById('camBranch').value;
  if (!artNo){ m.textContent = '⚠ Art Number is required.'; m.classList.add('show','error'); document.getElementById('camArtNo').focus(); return; }
  var realArt = normalizeArtNo(artNo);
  if (!realArt){ m.textContent = '⚠ Art Number must contain at least one digit.'; m.classList.add('show','error'); document.getElementById('camArtNo').focus(); return; }
  var list = getAllDesigns();
  var dup = list.find(function(x){ return x.id !== pendingCamId && normalizeArtNo(x.artNo) === realArt; });
  if (dup){ m.textContent = '⚠ Art Number "'+artNo+'" already exists as "'+dup.artNo+'".'; m.classList.add('show','error'); document.getElementById('camArtNo').focus(); return; }
  if (!(gw > 0)){ m.textContent = '⚠ Weight must be greater than 0.'; m.classList.add('show','error'); document.getElementById('camGrossWt').focus(); return; }
  if (!branch){ m.textContent = '⚠ Please select a Branch.'; m.classList.add('show','error'); document.getElementById('camBranch').focus(); return; }
  if (!modalImages.cam){ m.textContent = '⚠ Please upload an image for CAM.'; m.classList.add('show','error'); return; }

  var cam = { grossWt: gw, netWt: 0, changes: document.getElementById('camChanges').value.trim(), artist: '', branch: branch, image: modalImages.cam, forwardDate: fwdDate, forwardedAt: fwdDate + 'T' + new Date().toTimeString().slice(0,8) };
  var cadCompletedAt = new Date().toISOString();
  updateDesign(pendingCamId, { stage:'CAM', artNo: artNo, realArtNo: realArt, size: sizeMm, sizeIn: '', cam: cam, camForwardedAt: cam.forwardedAt, cadCompletedAt: cadCompletedAt });

  var updated = getDesignById(pendingCamId);
  try { printSilverCadOrder(updated, { dateOfIssue: formatDate(todayIso()), cadCompletedAt: cadCompletedAt, branch: branch, changes: (updated.cad && updated.cad.changes) || '' }); } catch(e){ console.error(e); }

  var designer = (updated.cad && updated.cad.assignee) || '';
  var telegramText = buildSilverCadOrderText(updated, { dateOfIssue: formatDate(todayIso()), cadCompletedAt: cadCompletedAt, branch: branch, changes: (updated.cad && updated.cad.changes) || '', forwarding: true });
  sendTelegramToDesignerAndAdmin(designer, telegramText).then(function(results){
    var attempted = results.filter(function(r){ return r && !r.skipped; });
    if (attempted.length > 0) showTelegramResult(results);
  }).catch(function(err){ console.error('Telegram error', err); });

  // ★ NEW — also notify CAM section + CAD section + admin via generic forward + WhatsApp
  notifySectionForward({
    fromSection: 'cad',
    toSection:   'cam',
    design:      updated,
    extra:       'Branch: <b>' + escapeHtml(branch) + '</b>\nWeight: <b>' + formatNumber2(gw) + ' g</b>'
  }).catch(function(err){ console.error('Telegram error', err); });
  try {
    notifyWhatsApp({ fromSection: 'cad', toSection: 'cam', design: updated, extra: 'Branch: ' + branch + ' | Weight: ' + formatNumber2(gw) + ' g' });
  } catch(e){ console.warn('WhatsApp notify failed', e); }

  document.getElementById('camModal').classList.add('hidden');
  document.getElementById('camDefaultImgBox').classList.add('hidden');
  modalImages.cam = null;
  pendingCamId = null;
  renderAll();
});

/* ============================================================
   CAM → CASTING  (★ CHANGED: sends Telegram + WhatsApp)
   ============================================================ */
function forwardCamToCasting(id){
  var d = getDesignById(id);
  if (!d){ alert('Design not found.'); return; }
  if (d.stage !== 'CAM'){ alert('Design is not in CAM stage (current: ' + STAGE_LABELS[d.stage] + ').'); return; }
  if (!d.cam || !d.cam.branch){ alert('⚠ No branch on this CAM record.'); return; }
  var ok = confirm('Forward design "' + (d.artNo || d.name) + ' — ' + d.name + '" to Casting Section?');
  if (!ok) return;

  updateDesign(id, { stage: 'CASTING', castingForwardedAt: new Date().toISOString() });
  var updated = getDesignById(id);

  // ★ NEW
  notifySectionForward({
    fromSection: 'cam',
    toSection:   'casting',
    design:      updated,
    extra:       'Branch: <b>' + escapeHtml(d.cam.branch) + '</b>'
  }).then(function(results){
    var attempted = results.filter(function(r){ return r && !r.skipped; });
    if (attempted.length > 0) showTelegramResult(results);
  }).catch(function(err){ console.error('Telegram error', err); });
  try {
    notifyWhatsApp({ fromSection: 'cam', toSection: 'casting', design: updated, extra: 'Branch: ' + d.cam.branch });
  } catch(e){ console.warn('WhatsApp notify failed', e); }

  renderAll();
}

/* ============================================================
   CASTING → SAMPLES  (★ CHANGED: sends Telegram + WhatsApp)
   ============================================================ */
var pendingCastingId = null;
function openCastingModal(id){
  var design = getDesignById(id);
  if (!design){ alert('Design not found.'); return; }
  if (design.stage !== 'CASTING'){ alert('This design is not in the Casting stage.'); return; }
  pendingCastingId = id;
  document.getElementById('castDesignInfo').innerHTML =
    '<b>' + escapeHtml(design.artNo || design.name) + '</b> — ' + escapeHtml(design.name) +
    '<br><span style="font-size:12px;color:#555">Branch: '+escapeHtml((design.cam && design.cam.branch) || '—')+'</span>';
  document.getElementById('castGrossWt').value = (design.cam && design.cam.grossWt) ? design.cam.grossWt : '';
  document.getElementById('castSampleDate').value = todayIso();
  document.getElementById('castingMessage').classList.remove('show','error');
  resetModalImage('cast','castImgPreview');
  document.getElementById('castingModal').classList.remove('hidden');
}
document.getElementById('closeCastingModal').addEventListener('click', function(){ document.getElementById('castingModal').classList.add('hidden'); pendingCastingId = null; });
document.getElementById('cancelCastingBtn').addEventListener('click', function(){ document.getElementById('castingModal').classList.add('hidden'); pendingCastingId = null; });
document.getElementById('confirmCastingBtn').addEventListener('click', function(){
  if (!pendingCastingId) return;
  var m = document.getElementById('castingMessage'); m.classList.remove('show','error');
  if (!modalImages.cast){ m.textContent = '⚠ Please upload a sample image.'; m.classList.add('show','error'); return; }
  var sampleDate = document.getElementById('castSampleDate').value || todayIso();
  var casting = { grossWt: Number(document.getElementById('castGrossWt').value) || 0, netWt: 0, image: modalImages.cast, sampleDate: sampleDate, sampleSentAt: sampleDate + 'T' + new Date().toTimeString().slice(0,8) };
  updateDesign(pendingCastingId, { stage:'SAMPLES', casting: casting, sampleForwardedAt: casting.sampleSentAt });

  var updated = getDesignById(pendingCastingId);

  // ★ NEW
  notifySectionForward({
    fromSection: 'casting',
    toSection:   'samples',
    design:      updated,
    extra:       'Sample Date: <b>' + formatDate(sampleDate) + '</b>\nWeight: <b>' + formatNumber2(casting.grossWt) + ' g</b>'
  }).then(function(results){
    var attempted = results.filter(function(r){ return r && !r.skipped; });
    if (attempted.length > 0) showTelegramResult(results);
  }).catch(function(err){ console.error('Telegram error', err); });
  try {
    notifyWhatsApp({ fromSection: 'casting', toSection: 'samples', design: updated, extra: 'Sample Date: ' + formatDate(sampleDate) + ' | Weight: ' + formatNumber2(casting.grossWt) + ' g' });
  } catch(e){ console.warn('WhatsApp notify failed', e); }

  document.getElementById('castingModal').classList.add('hidden');
  pendingCastingId = null;
  renderAll();
});

/* ============================================================
   SAMPLES → HO  (★ CHANGED: sends Telegram + WhatsApp)
   ============================================================ */
var pendingHoId = null;
function openHoModal(id){
  var design = getDesignById(id);
  if (!design){ alert('Design not found.'); return; }
  if (design.stage !== 'SAMPLES'){ alert('This design is not in the Samples stage.'); return; }
  pendingHoId = id;
  document.getElementById('hoDesignInfo').innerHTML =
    '<b>' + escapeHtml(design.artNo || design.name) + '</b> — ' + escapeHtml(design.name) +
    '<br><span style="font-size:12px;color:#555">Branch: '+escapeHtml((design.cam && design.cam.branch) || design.branch || '—')+' · Size: '+escapeHtml(design.size || '—')+'</span>';
  document.getElementById('hoDate').value = todayIso();
  document.getElementById('hoRemarks').value = '';
  document.getElementById('hoMessage').classList.remove('show','error');
  document.getElementById('hoModal').classList.remove('hidden');
}
document.getElementById('closeHoModal').addEventListener('click', function(){ document.getElementById('hoModal').classList.add('hidden'); pendingHoId = null; });
document.getElementById('cancelHoBtn').addEventListener('click', function(){ document.getElementById('hoModal').classList.add('hidden'); pendingHoId = null; });
function pushSampleToOrderFormReceived(design, sampleRow){
  var syntheticOrderId = 'SAMPLE-' + design.id;
  var syntheticOrderNo = 'SMP-' + String(design.artNo || design.name || '').replace(/\s+/g,'').slice(0,20);
  var branch = (sampleRow && sampleRow.branch) || (design.cam && design.cam.branch) || design.branch || CURRENT_BRANCH || 'Designs';
  var nowIso = new Date().toISOString();
  var grossWt = Number((design.casting && design.casting.grossWt) || (design.cam && design.cam.grossWt) || 0);
  var image = (design.casting && design.casting.image) || design.image || '';
  var sends = readJSON(SENDS_KEY, []);
  if (!Array.isArray(sends)) sends = [];
  var alreadySent = sends.some(function(s){ if (!s || !Array.isArray(s.rows)) return false; return s.rows.some(function(r){ return r && r.orderId === syntheticOrderId; }); });
  if (!alreadySent){
    sends.push({
      branch: branch, date: nowIso, totalQty: 1, totalWeight: grossWt,
      rows: [{ orderId: syntheticOrderId, orderNo: syntheticOrderNo, party: 'Sample Received', group: design.category || '', artNo: design.artNo || '', name: design.name, touch: '', orderQty: 1, stockQty: 1, weight: grossWt, rowTotal: grossWt, image: image, source: 'designs.html', group_source: design.group || '' }]
    });
    saveJSON(SENDS_KEY, sends);
  }
}
document.getElementById('confirmHoBtn').addEventListener('click', function(){
  if (!pendingHoId) return;
  var m = document.getElementById('hoMessage'); m.classList.remove('show','error');
  var hoDate = document.getElementById('hoDate').value || todayIso();
  var remarks = document.getElementById('hoRemarks').value.trim();
  var design = getDesignById(pendingHoId);
  if (!design){ m.textContent = 'Design not found.'; m.classList.add('show','error'); return; }
  var samples = Object.assign({}, design.samples || {}, { hoDate: hoDate, hoRemarks: remarks, hoSentAt: hoDate + 'T' + new Date().toTimeString().slice(0,8) });
  updateDesign(pendingHoId, { stage:'SAMPLE', samples: samples, hoSentAt: samples.hoSentAt });
  try { pushSampleToOrderFormReceived(design, samples); } catch(e){ console.error(e); }

  var updated = getDesignById(pendingHoId);

  // ★ NEW
  notifySectionForward({
    fromSection: 'samples',
    toSection:   'ho',
    design:      updated,
    extra:       'HO Date: <b>' + formatDate(hoDate) + '</b>' + (remarks ? '\nRemarks: ' + escapeHtml(remarks) : '')
  }).then(function(results){
    var attempted = results.filter(function(r){ return r && !r.skipped; });
    if (attempted.length > 0) showTelegramResult(results);
  }).catch(function(err){ console.error('Telegram error', err); });
  try {
    notifyWhatsApp({ fromSection: 'samples', toSection: 'ho', design: updated, extra: 'HO Date: ' + formatDate(hoDate) + (remarks ? ' | Remarks: ' + remarks : '') });
  } catch(e){ console.warn('WhatsApp notify failed', e); }

  document.getElementById('hoModal').classList.add('hidden');
  pendingHoId = null;
  renderAll();
});

/* ============================================================
   FILTERS & RENDER HELPERS
   ============================================================ */
var bankFilter = { name:'', category:'all', group:'all', date:'' };
function readBankFilterInputs(){
  bankFilter.name = (document.getElementById('bankFilterName').value || '').trim().toLowerCase();
  bankFilter.category = document.getElementById('bankFilterCategory').value || 'all';
  bankFilter.group = document.getElementById('bankFilterGroup').value || 'all';
  bankFilter.date = document.getElementById('bankFilterDate').value || '';
}
function bankFilterActive(){ return !!(bankFilter.name || (bankFilter.category && bankFilter.category !== 'all') || (bankFilter.group && bankFilter.group !== 'all') || bankFilter.date); }
document.getElementById('bankApplyFilter').addEventListener('click', function(){ readBankFilterInputs(); renderBank(); });
document.getElementById('bankResetFilter').addEventListener('click', function(){
  document.getElementById('bankFilterName').value = '';
  document.getElementById('bankFilterCategory').value = 'all';
  document.getElementById('bankFilterGroup').value = 'all';
  document.getElementById('bankFilterDate').value = '';
  bankFilter = { name:'', category:'all', group:'all', date:'' };
  renderBank();
});
['bankFilterName','bankFilterCategory','bankFilterGroup','bankFilterDate'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('change', function(){ readBankFilterInputs(); renderBank(); });
  if (el && el.tagName === 'INPUT' && el.type === 'text') el.addEventListener('input', function(){ readBankFilterInputs(); renderBank(); });
});

var cadReceivedFilter = { artNo:'', name:'', category:'all', assignee:'' };
function readCadReceivedFilterInputs(){
  cadReceivedFilter.artNo = (document.getElementById('cadFilterArtNo').value || '').trim();
  cadReceivedFilter.name = (document.getElementById('cadFilterName').value || '').trim().toLowerCase();
  cadReceivedFilter.category = document.getElementById('cadFilterCategory').value || 'all';
  cadReceivedFilter.assignee = (document.getElementById('cadFilterAssigneeValue').value || '').trim();
}
function cadReceivedFilterActive(){ return !!(cadReceivedFilter.artNo || cadReceivedFilter.name || (cadReceivedFilter.category && cadReceivedFilter.category !== 'all') || cadReceivedFilter.assignee); }
document.getElementById('cadApplyFilter').addEventListener('click', function(){ readCadReceivedFilterInputs(); renderCad(); });
document.getElementById('cadResetFilter').addEventListener('click', function(){
  document.getElementById('cadFilterArtNo').value = '';
  document.getElementById('cadFilterName').value = '';
  document.getElementById('cadFilterCategory').value = 'all';
  if (cadFilterAssigneeSelect) cadFilterAssigneeSelect.reset();
  document.getElementById('cadFilterAssigneeValue').value = '';
  cadReceivedFilter = { artNo:'', name:'', category:'all', assignee:'' };
  renderCad();
});
['cadFilterArtNo','cadFilterName','cadFilterCategory'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.addEventListener('change', function(){ readCadReceivedFilterInputs(); renderCad(); });
  if (el && el.tagName === 'INPUT' && el.type === 'text') el.addEventListener('input', function(){ readCadReceivedFilterInputs(); renderCad(); });
});

/* ============================================================
   RENDER: DESIGNS BANK
   ============================================================ */
function renderBank(){
  var tbody = document.getElementById('bankBody');
  var list = getAllDesigns().filter(function(d){ return d.stage === 'BANK'; });
  if (bankFilterActive()){
    list = list.filter(function(d){
      if (bankFilter.name && String(d.name||'').toLowerCase().indexOf(bankFilter.name) === -1) return false;
      if (bankFilter.category && bankFilter.category !== 'all' && d.category !== bankFilter.category) return false;
      if (bankFilter.group && bankFilter.group !== 'all' && d.group !== bankFilter.group) return false;
      if (bankFilter.date && d.date !== bankFilter.date) return false;
      return true;
    });
  }
  var filterBadge = bankFilterActive() ? ' <span class="filter-active-badge">FILTERED</span>' : '';
  if (!list.length){ tbody.innerHTML = '<tr><td colspan="10" class="empty-list">' + (bankFilterActive() ? 'No designs match the current filters.' : 'No designs waiting in the Bank. Add a design above.') + filterBadge + '</td></tr>'; return; }
  tbody.innerHTML = list.map(function(d, i){
    var badge = '<span class="badge '+STAGE_BADGE[d.stage]+'">'+STAGE_LABELS[d.stage]+'</span>';
    var editDelete = '<div class="btn-row"><button class="btn small" type="button" onclick="openEditModal(\''+d.id+'\')" title="Edit"><i class="fas fa-edit"></i></button><button class="btn red small" type="button" onclick="deleteDesignById(\''+d.id+'\')" title="Delete"><i class="fas fa-trash"></i></button></div>';
    var action = '<button class="btn primary small" type="button" onclick="openCadModal(\''+d.id+'\')"><i class="fas fa-arrow-right"></i> Forward to CAD</button>';
    return '<tr><td>'+(i+1)+'</td><td style="text-align:left"><b>'+escapeHtml(d.name)+'</b></td><td>'+escapeHtml(d.category)+'</td><td>'+escapeHtml(d.group)+'</td><td>'+formatDate(d.date)+'</td><td>'+escapeHtml(d.artist||'—')+'</td><td>'+makeImg(d.image,50,d.name)+'</td><td>'+badge+'</td><td>'+editDelete+'</td><td>'+action+'</td></tr>';
  }).join('');
}

/* ============================================================
   RENDER: CAD (Received)
   ============================================================ */
function renderCad(){
  var tbody = document.getElementById('cadBody');
  var all = getAllDesigns();
  var list = all.filter(function(d){ return d.stage === 'CAD'; });

  if (isCadDesignerUser()){
    list = list.filter(function(d){ var cad = d.cad || {}; return cad.assignee && String(cad.assignee).toLowerCase() === CURRENT_USERNAME; });
  }
  if (cadReceivedFilterActive()){
    var realArtQ = normalizeArtNo(cadReceivedFilter.artNo);
    list = list.filter(function(d){
      if (realArtQ && normalizeArtNo(d.artNo) !== realArtQ) return false;
      if (cadReceivedFilter.name && String(d.name||'').toLowerCase().indexOf(cadReceivedFilter.name) === -1) return false;
      if (cadReceivedFilter.category && cadReceivedFilter.category !== 'all' && d.category !== cadReceivedFilter.category) return false;
      if (cadReceivedFilter.assignee){ var assignee = (d.cad && d.cad.assignee) || ''; if (String(assignee).toLowerCase() !== cadReceivedFilter.assignee.toLowerCase()) return false; }
      return true;
    });
  }

  var showAllot = canAllotCadDesign();
  var showEditDelete = canEditCadDesign();
  var showForwardCam = canForwardCadToCam();

  if (!list.length){
    var emptyTxt = isCadDesignerUser() ? 'No designs allotted to you yet. Please wait for CAD Charge to allot a design.' : 'No designs in CAD section. Forward from Designs Bank.';
    if (cadReceivedFilterActive()) emptyTxt = 'No designs match the current filters.';
    tbody.innerHTML = '<tr><td colspan="13" class="empty-list">' + emptyTxt + '</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(function(d, i){
    var cad = d.cad || {};
    var editDelete = '<div class="btn-row"><button class="btn small" type="button" onclick="openEditModal(\''+d.id+'\')" title="Edit"><i class="fas fa-edit"></i></button><button class="btn red small" type="button" onclick="deleteDesignById(\''+d.id+'\')" title="Delete"><i class="fas fa-trash"></i></button></div>';
    var artNoCell = d.artNo ? '<b style="color:#8c004c">'+escapeHtml(d.artNo)+'</b>' : '<span style="color:#b3261e;font-size:11px;font-weight:700">Not allotted</span>';
    var assigneeCell = cad.assignee ? '<span class="badge cad">'+escapeHtml(cad.assignee)+'</span><br><span style="font-size:10px;color:#777">'+formatDateTime(cad.assignedAt)+'</span>' : '<span style="color:#999;font-size:11px">Unassigned</span>';
    var statusCell;
    if (!d.artNo || !cad.assignee) statusCell = '<span class="status-pill awaiting"><i class="fas fa-hourglass-half"></i> Awaiting Allotment</span>';
    else if (cadNeedsFirstUpload(d)) statusCell = '<span class="status-pill needs-upload"><i class="fas fa-upload"></i> Draft Pending</span>';
    else statusCell = '<span class="status-pill running"><i class="fas fa-play-circle"></i> CAD Running</span>';
    var allotBtn = showAllot ? '<button class="btn small" type="button" onclick="openAllotCadModal(\''+d.id+'\')" title="Allot / re-allot"><i class="fas fa-user-tag"></i> ' + (cad.assignee ? 'Re-allot' : 'Allot') + '</button>' : '<span style="color:#999;font-size:11px">—</span>';
    var editDeleteCell = showEditDelete ? editDelete : '<span style="color:#999;font-size:11px">—</span>';
    var camBtn = showForwardCam ? '<button class="btn primary small" type="button" onclick="openCamModal(\''+d.id+'\')"><i class="fas fa-arrow-right"></i> Forward to CAM</button>' : '<span style="color:#999;font-size:11px">—</span>';
    return '<tr><td>'+(i+1)+'</td><td>'+artNoCell+'</td><td style="text-align:left">'+escapeHtml(d.name)+'</td><td>'+escapeHtml(d.category)+'</td><td>'+escapeHtml(d.group)+'</td><td>'+formatNumber2(cad.grossWt||0)+'</td><td>'+formatDateTime(cad.forwardedAt)+'</td><td>'+makeImg(cad.image,50,d.name)+'</td><td>'+assigneeCell+'</td><td>'+statusCell+'</td><td>'+editDeleteCell+'</td><td>'+allotBtn+'</td><td>'+camBtn+'</td></tr>';
  }).join('');
}

/* ============================================================
   RENDER: CAD UPDATES
   ============================================================ */
function renderCadUpdates(){
  var tbody = document.getElementById('cadUpdatesBody'); if (!tbody) return;
  var all = getAllDesigns();
  var list = all.filter(function(d){ return d.stage === 'CAD'; });

  if (isCadDesignerUser()){ list = list.filter(function(d){ var cad = d.cad || {}; return cad.assignee && String(cad.assignee).toLowerCase() === CURRENT_USERNAME; }); }
  if (!list.length){
    var emptyTxt = isCadDesignerUser() ? 'No designs allotted to you yet.' : 'No designs in CAD section.';
    tbody.innerHTML = '<tr><td colspan="10" class="empty-list">' + emptyTxt + '</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(function(d, i){
    var cad = d.cad || {};
    var updates = Array.isArray(cad.updates) ? cad.updates : [];
    var last = updates.length ? updates[updates.length-1] : null;
    var originalBankImage = d.image || (cad && cad.image) || '';
    var lastImageSrc = (last && last.image) ? last.image : originalBankImage;
    var lastImgCell = lastImageSrc ? makeImg(lastImageSrc,50,d.name+(last && last.image ? '_update' : '_bank_original')) : '<span style="color:#999">—</span>';
    var lastAtCell;
    if (last) lastAtCell = formatDateTime(last.at);
    else if (cadNeedsFirstUpload(d)) lastAtCell = '<span style="color:#8a6300;font-weight:700"><i class="fas fa-bell"></i> Upload draft image</span>';
    else lastAtCell = (originalBankImage ? '<span style="color:#777">Received from Designs Bank</span>' : '—');
    var artNoCell = d.artNo ? '<b style="color:#8c004c">'+escapeHtml(d.artNo)+'</b>' : '<span style="color:#b3261e;font-size:11px">Not allotted</span>';
    var uploadBtn = d.artNo ? '<button class="btn primary small" type="button" onclick="openCadUpdateModal(\''+d.id+'\')"><i class="fas fa-upload"></i> Upload</button>' : '<button class="btn small" type="button" disabled title="Allot an Art Number first"><i class="fas fa-ban"></i> Allot First</button>';
    var printBtn = '<button class="btn small" type="button" onclick="printSilverCadOrderById(\''+d.id+'\')" title="Print Silver CAD Order"><i class="fas fa-print"></i></button>';
    return '<tr><td>'+(i+1)+'</td><td>'+artNoCell+'</td><td style="text-align:left"><b>'+escapeHtml(d.name)+'</b></td><td>'+escapeHtml(d.size||'—')+'</td><td>'+(cad.assignee ? '<span class="badge cad">'+escapeHtml(cad.assignee)+'</span>' : '<span style="color:#999">—</span>')+'</td><td>'+lastImgCell+'</td><td>'+lastAtCell+'</td><td>'+uploadBtn+'</td><td><button class="btn small" type="button" onclick="toggleCadHistory(\''+d.id+'\')"><i class="fas fa-list"></i> '+updates.length+'</button></td><td>'+printBtn+'</td></tr>'
      + '<tr id="cadHist_'+d.id+'" class="hidden"><td colspan="10" style="text-align:left;background:#fafafa">' + renderCadHistory(d) + '</td></tr>';
  }).join('');
}
function printSilverCadOrderById(id){
  var d = getDesignById(id);
  if (!d){ alert('Design not found.'); return; }
  printSilverCadOrder(d, { dateOfIssue: formatDate(todayIso()) });
}
function renderCadHistory(d){
  var cad = d.cad || {};
  var updates = Array.isArray(cad.updates) ? cad.updates : [];
  var originalBankImage = d.image || cad.image || '';
  var cards = [];
  if (originalBankImage){ cards.push('<div class="cad-history-card">' + makeImg(originalBankImage,130,d.name+'_bank_original') + '<div class="ch-when">Original Design</div><div class="ch-by">Received from Designs Bank</div>' + (d.artNo ? '<div class="ch-by" style="color:#094d9c;font-weight:700">Art: '+escapeHtml(d.artNo)+'</div>' : '') + '</div>'); }
  updates.forEach(function(u){
    if (!u || !u.image) return;
    cards.push('<div class="cad-history-card">' + makeImg(u.image,130,d.name+'_hist') + '<div class="ch-when">'+formatDateTime(u.at)+'</div><div class="ch-by">by '+escapeHtml(u.by||'—')+'</div>' + (u.artNo ? '<div class="ch-by" style="color:#094d9c;font-weight:700">Art: '+escapeHtml(u.artNo)+'</div>' : '') + (u.sizeMm ? '<div class="ch-by" style="color:#8a6300">Size: '+escapeHtml(u.sizeMm)+'</div>' : '') + (u.note ? '<div class="ch-note">'+escapeHtml(u.note)+'</div>' : '') + '</div>');
  });
  if (!cards.length) return '<div style="padding:10px;color:#999;font-style:italic">No original design image or progress updates available.</div>';
  return '<div class="cad-history-strip">' + cards.join('') + '</div>';
}
function toggleCadHistory(id){ var row = document.getElementById('cadHist_' + id); if (row) row.classList.toggle('hidden'); }

/* ============================================================
   RENDER: CAM, CASTING, SAMPLES, PENDING
   ============================================================ */
function renderCam(){
  var tbody = document.getElementById('camBody');
  var list = getAllDesigns().filter(function(d){ return d.stage === 'CAM'; });
  if (!list.length){ tbody.innerHTML = '<tr><td colspan="12" class="empty-list">No designs in CAM section.</td></tr>'; return; }
  tbody.innerHTML = list.map(function(d, i){
    var cam = d.cam || {};
    var editDelete = '<div class="btn-row"><button class="btn small" type="button" onclick="openEditModal(\''+d.id+'\')" title="Edit"><i class="fas fa-edit"></i></button><button class="btn red small" type="button" onclick="deleteDesignById(\''+d.id+'\')" title="Delete"><i class="fas fa-trash"></i></button></div>';
    return '<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(d.artNo||'—')+'</b></td><td style="text-align:left">'+escapeHtml(d.name)+'</td><td>'+escapeHtml(d.category)+'</td><td>'+escapeHtml(d.group)+'</td><td>'+escapeHtml(d.size||'—')+'</td><td>'+formatNumber2(cam.grossWt||0)+'</td><td>'+escapeHtml(cam.branch||'—')+'</td><td>'+formatDate(cam.forwardDate || (cam.forwardedAt && cam.forwardedAt.slice(0,10)) || '')+'</td><td>'+makeImg(cam.image,50,d.name)+'</td><td>'+editDelete+'</td><td><button class="btn primary small" type="button" onclick="forwardCamToCasting(\''+d.id+'\')"><i class="fas fa-arrow-right"></i> Forward to Casting</button></td></tr>';
  }).join('');
}

function renderCasting(){
  var tbody = document.getElementById('castingBody');
  var list = getAllDesigns().filter(function(d){ return d.stage === 'CASTING'; });
  if (!list.length){ tbody.innerHTML = '<tr><td colspan="12" class="empty-list">No designs in Casting section.</td></tr>'; return; }
  tbody.innerHTML = list.map(function(d, i){
    var cam = d.cam || {};
    var fwdDate = d.castingForwardedAt || (cam.forwardDate ? cam.forwardDate + 'T00:00:00' : cam.forwardedAt) || '—';
    var editDelete = '<div class="btn-row"><button class="btn small" type="button" onclick="openEditModal(\''+d.id+'\')" title="Edit"><i class="fas fa-edit"></i></button><button class="btn red small" type="button" onclick="deleteDesignById(\''+d.id+'\')" title="Delete"><i class="fas fa-trash"></i></button></div>';
    return '<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(d.artNo||'—')+'</b></td><td style="text-align:left">'+escapeHtml(d.name)+'</td><td>'+escapeHtml(d.category)+'</td><td>'+escapeHtml(d.group)+'</td><td>'+escapeHtml(d.size||'—')+'</td><td>'+formatNumber2(cam.grossWt||0)+'</td><td>'+escapeHtml(cam.branch||d.branch||'—')+'</td><td>'+formatDateTime(fwdDate)+'</td><td>'+makeImg(cam.image,50,d.name)+'</td><td>'+editDelete+'</td><td><button class="btn primary small" type="button" onclick="openCastingModal(\''+d.id+'\')"><i class="fas fa-arrow-right"></i> Forward to Samples</button></td></tr>';
  }).join('');
}

function renderSamples(){
  var tbody = document.getElementById('samplesBody');
  var list = getAllDesigns().filter(function(d){ return d.stage === 'SAMPLES'; });
  if (!list.length){ tbody.innerHTML = '<tr><td colspan="12" class="empty-list">No samples waiting.</td></tr>'; return; }
  tbody.innerHTML = list.map(function(d, i){
    var cam = d.cam || {}, cast = d.casting || {};
    var sampleDate = cast.sampleDate || (cast.sampleSentAt && cast.sampleSentAt.slice(0,10)) || '—';
    var editDelete = '<div class="btn-row"><button class="btn small" type="button" onclick="openEditModal(\''+d.id+'\')" title="Edit"><i class="fas fa-edit"></i></button><button class="btn red small" type="button" onclick="deleteDesignById(\''+d.id+'\')" title="Delete"><i class="fas fa-trash"></i></button></div>';
    return '<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(d.artNo||'—')+'</b></td><td style="text-align:left">'+escapeHtml(d.name)+'</td><td>'+escapeHtml(d.category)+'</td><td>'+escapeHtml(d.group)+'</td><td>'+escapeHtml(d.size||'—')+'</td><td>'+formatNumber2(cast.grossWt||cam.grossWt||0)+'</td><td>'+escapeHtml(cam.branch||d.branch||'—')+'</td><td>'+formatDate(sampleDate)+'</td><td>'+makeImg(cast.image,50,d.name)+'</td><td>'+editDelete+'</td><td><button class="btn green small" type="button" onclick="openHoModal(\''+d.id+'\')"><i class="fas fa-paper-plane"></i> Forward to HO</button></td></tr>';
  }).join('');
}

function renderOrderPending(){
  var tbody = document.getElementById('orderPendingBody');
  var orderedSet = getOrderedArtNoSet();
  var list = getAllDesigns().filter(function(d){ if (d.stage !== 'SAMPLE') return false; var real = normalizeArtNo(d.artNo); return !orderedSet[real]; });
  if (!list.length){ tbody.innerHTML = '<tr><td colspan="11" class="empty-list">No pending orders.</td></tr>'; return; }
  tbody.innerHTML = list.map(function(d, i){
    var cast = d.casting || {};
    var sentAt = (d.samples && d.samples.hoSentAt) || d.sampleForwardedAt || cast.sampleSentAt || '—';
    var editDelete = '<div class="btn-row"><button class="btn small" type="button" onclick="openEditModal(\''+d.id+'\')" title="Edit"><i class="fas fa-edit"></i></button><button class="btn red small" type="button" onclick="deleteDesignById(\''+d.id+'\')" title="Delete"><i class="fas fa-trash"></i></button></div>';
    return '<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(d.artNo||'—')+'</b></td><td style="text-align:left">'+escapeHtml(d.name)+'</td><td>'+escapeHtml(d.category)+'</td><td>'+escapeHtml(d.group)+'</td><td>'+escapeHtml(d.size||'—')+'</td><td>'+escapeHtml((d.cam && d.cam.branch) || d.branch || '—')+'</td><td>'+formatDateTime(sentAt)+'</td><td>'+makeImg(cast.image,50,d.name)+'</td><td>'+editDelete+'</td><td><span class="badge pending">Pending Order</span></td></tr>';
  }).join('');
}

/* ============================================================
   QUICK REPORT & REPORTS
   ============================================================ */
function renderReport(){
  var all = getAllDesigns();
  var counts = { BANK:0, CAD:0, CAM:0, CASTING:0, SAMPLES:0, SAMPLE:0, ORDERED:0, PENDING:0 };
  all.forEach(function(d){ if (counts[d.stage] !== undefined) counts[d.stage]++; if (d.stage !== 'ORDERED') counts.PENDING++; });
  var grid = document.getElementById('reportGrid');
  grid.innerHTML =
    '<div class="report-card"><div class="label"><i class="fas fa-database"></i> Designs Bank</div><div class="value">'+formatNumber(counts.BANK)+'</div><div class="sub">designs waiting</div></div>'
    + '<div class="report-card"><div class="label"><i class="fas fa-drafting-compass"></i> CAD Section</div><div class="value">'+formatNumber(counts.CAD)+'</div><div class="sub">in progress</div></div>'
    + '<div class="report-card"><div class="label"><i class="fas fa-cogs"></i> CAM Section</div><div class="value">'+formatNumber(counts.CAM)+'</div><div class="sub">in progress</div></div>'
    + '<div class="report-card"><div class="label"><i class="fas fa-fire"></i> Casting</div><div class="value">'+formatNumber(counts.CASTING)+'</div><div class="sub">in progress</div></div>'
    + '<div class="report-card"><div class="label"><i class="fas fa-cube"></i> Samples</div><div class="value">'+formatNumber(counts.SAMPLES)+'</div><div class="sub">at samples</div></div>'
    + '<div class="report-card"><div class="label"><i class="fas fa-check-circle"></i> Sample Received (HO)</div><div class="value">'+formatNumber(counts.SAMPLE)+'</div><div class="sub">at HO</div></div>'
    + '<div class="report-card"><div class="label"><i class="fas fa-shopping-cart"></i> Order Placed</div><div class="value">'+formatNumber(counts.ORDERED)+'</div><div class="sub">completed</div></div>'
    + '<div class="report-card total"><div class="label"><i class="fas fa-hourglass-half"></i> Pending</div><div class="value">'+formatNumber(counts.PENDING)+'</div><div class="sub">not yet ordered</div></div>';
  var tbody = document.getElementById('reportBody');
  if (!all.length){ tbody.innerHTML = '<tr><td colspan="12" class="empty-list">No designs recorded.</td></tr>'; return; }
  tbody.innerHTML = all.map(function(d){
    function stageCell(stageName, badgeClass, label){ if (d.stage === stageName) return '<td style="background:#fbf2f7"><span class="badge '+badgeClass+'">'+label+'</span></td>'; if (stageIndex(d.stage) > stageIndex(stageName)) return '<td style="color:#8c004c;font-weight:700">✓</td>'; return '<td style="color:#ccc">—</td>'; }
    return '<tr><td><b>'+escapeHtml(d.artNo||'—')+'</b></td><td style="text-align:left">'+escapeHtml(d.name)+'</td><td>'+escapeHtml(d.category)+'</td><td>'+escapeHtml(d.group)+'</td>'
      + stageCell('BANK','bank','In Bank') + stageCell('CAD','cad','In CAD') + stageCell('CAM','cam','In CAM') + stageCell('CASTING','casting','In Casting') + stageCell('SAMPLES','sample','In Samples')
      + (stageIndex(d.stage) >= stageIndex('SAMPLE') ? '<td style="color:#8c004c;font-weight:700">✓</td>' : '<td style="color:#ccc">—</td>')
      + (d.stage === 'ORDERED' ? '<td><span class="badge ordered">Placed</span></td>' : '<td style="color:#ccc">—</td>')
      + (d.stage !== 'ORDERED' ? '<td><span class="badge pending">Pending</span></td>' : '<td><span class="badge ordered">Placed</span></td>')
      + '</tr>';
  }).join('');
}

function dateInRange(iso, from, to){ if (!iso) return false; var d = new Date(iso); if (isNaN(d)) return false; var ymd = d.toISOString().slice(0,10); if (from && ymd < from) return false; if (to && ymd > to) return false; return true; }
function buildSectionReport(){
  var from = (document.getElementById('rFromDate') || {}).value || '';
  var to = (document.getElementById('rToDate') || {}).value || '';
  var sec = (document.getElementById('rSection') || {}).value || 'all';
  var cat = (document.getElementById('rCategory') || {}).value || 'all';
  var all = getAllDesigns();
  var sections = [
    { key:'BANK', title:'Designs Bank (Uploaded)', icon:'fa-database', dateFn:function(d){ return d.createdAt; } },
    { key:'CAD', title:'CAD Section (Forwarded)', icon:'fa-drafting-compass', dateFn:function(d){ return (d.cad && d.cad.forwardedAt) || d.cadForwardedAt; } },
    { key:'CAM', title:'CAM Section (Forwarded)', icon:'fa-cogs', dateFn:function(d){ return (d.cam && d.cam.forwardedAt) || d.camForwardedAt; } },
    { key:'CASTING', title:'Casting Section (Forwarded)', icon:'fa-fire', dateFn:function(d){ return d.castingForwardedAt || (d.cam && d.cam.forwardedAt); } },
    { key:'SAMPLES', title:'Samples Section (Ready for HO)', icon:'fa-cube', dateFn:function(d){ return (d.casting && d.casting.sampleSentAt) || d.sampleForwardedAt; } },
    { key:'SAMPLE', title:'HO Sent / Sample Received', icon:'fa-paper-plane', dateFn:function(d){ return (d.samples && d.samples.hoSentAt) || d.sampleForwardedAt || (d.casting && d.casting.sampleSentAt); } },
    { key:'PENDING', title:'Order Pending', icon:'fa-hourglass-half', dateFn:function(d){ return (d.samples && d.samples.hoSentAt) || d.sampleForwardedAt || (d.casting && d.casting.sampleSentAt); }, filterFn:function(d){ return d.stage === 'SAMPLE' && !isOrderReceived(d); } },
    { key:'ORDERED', title:'Order Placed', icon:'fa-shopping-cart', dateFn:function(d){ return getOrderPlacedAt(d); }, filterFn:function(d){ return d.stage === 'SAMPLE' && isOrderReceived(d); } }
  ];
  var host = document.getElementById('reportsContent');
  if (!all.length){ host.innerHTML = '<div class="report-section-empty">No designs recorded yet.</div>'; return; }
  var totalAll = 0, html = '';
  sections.forEach(function(s){
    if (sec !== 'all' && sec !== s.key) return;
    var rows = all.filter(function(d){
      if (cat !== 'all' && d.category !== cat) return false;
      if (stageIndex(d.stage) < stageIndex(s.key === 'ORDERED' ? 'SAMPLE' : s.key)){ if (s.key !== 'PENDING' && s.key !== 'ORDERED') return false; if (s.key === 'ORDERED' && stageIndex(d.stage) < stageIndex('SAMPLE')) return false; }
      if (s.filterFn && !s.filterFn(d)) return false;
      if (from || to){ var iso = s.dateFn(d); if (!dateInRange(iso, from, to)) return false; }
      return true;
    });
    totalAll += rows.length;
    html += '<div class="report-section"><div class="report-section-header"><h3><i class="fas '+s.icon+'"></i> '+escapeHtml(s.title)+'</h3><span class="rs-count">'+rows.length+'</span></div>';
    if (!rows.length) html += '<div class="report-section-empty">No designs match.</div>';
    else {
      html += '<div class="table-wrap"><table><thead><tr><th>SL</th><th>ART NO.</th><th>NAME</th><th>CATEGORY</th><th>GROUP</th><th>SIZE (MM)</th><th>DATE / FORWARDED</th><th>IMAGE</th></tr></thead><tbody>';
      rows.forEach(function(d, i){
        var iso = s.dateFn(d);
        var imgSrc = d.image;
        if (s.key === 'CAD' && d.cad && d.cad.image) imgSrc = d.cad.image;
        if (s.key === 'CAM' && d.cam && d.cam.image) imgSrc = d.cam.image;
        if (s.key === 'CASTING' && d.casting && d.casting.image) imgSrc = d.casting.image;
        if ((s.key === 'SAMPLES' || s.key === 'SAMPLE' || s.key === 'PENDING' || s.key === 'ORDERED') && d.casting && d.casting.image) imgSrc = d.casting.image;
        html += '<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(d.artNo||'—')+'</b></td><td style="text-align:left">'+escapeHtml(d.name)+'</td><td>'+escapeHtml(d.category||'—')+'</td><td>'+escapeHtml(d.group||'—')+'</td><td>'+escapeHtml(d.size||'—')+'</td><td>'+ (iso ? formatDateTime(iso) : '—') +'</td><td>'+makeImg(imgSrc,44,d.name)+'</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
  });
  html = '<div class="report-grid" style="margin-bottom:16px"><div class="report-card total"><div class="label"><i class="fas fa-list"></i> Total Designs Shown</div><div class="value">'+formatNumber(totalAll)+'</div><div class="sub">'+(from||to ? 'Date filtered' : 'All time')+'</div></div></div>' + html;
  host.innerHTML = html;
}
document.getElementById('rApplyBtn').addEventListener('click', buildSectionReport);
document.getElementById('rResetBtn').addEventListener('click', function(){ document.getElementById('rFromDate').value = ''; document.getElementById('rToDate').value = ''; document.getElementById('rSection').value = 'all'; document.getElementById('rCategory').value = 'all'; buildSectionReport(); });
(function(){ var rFrom = document.getElementById('rFromDate'); var rTo = document.getElementById('rToDate'); if (rTo) rTo.value = new Date().toISOString().slice(0,10); if (rFrom){ var d = new Date(); d.setDate(d.getDate() - 30); rFrom.value = d.toISOString().slice(0,10); } })();

/* ============================================================
   DESIGN TRACKING
   ============================================================ */
function buildTimelineForDesign(d){
  var entries = [];
  entries.push({ stage:'Designs Bank', icon:'fa-database', badge:'bank', whenIso: d.createdAt || (d.date ? d.date + 'T00:00:00' : null), stageKey:'BANK', detailFn: function(){ var p = []; if (d.category) p.push('Category: <b>'+escapeHtml(d.category)+'</b>'); if (d.group) p.push('Group: <b>'+escapeHtml(d.group)+'</b>'); if (d.artist) p.push('Artist: <b>'+escapeHtml(d.artist)+'</b>'); return p.join(' &nbsp;·&nbsp; '); } });
  entries.push({ stage:'CAD Section', icon:'fa-drafting-compass', badge:'cad', whenIso: (d.cad && d.cad.forwardedAt) || d.cadForwardedAt || null, stageKey:'CAD', detailFn: function(){ if (!d.cad) return ''; var p = []; if (d.artNo) p.push('Art No: <b>'+escapeHtml(d.artNo)+'</b>'); if (d.cad.grossWt) p.push('Est. Wt: <b>'+formatNumber2(d.cad.grossWt)+' g</b>'); if (d.cad.assignee) p.push('Assignee: <b>'+escapeHtml(d.cad.assignee)+'</b>'); if (d.cad.changes) p.push('Changes: <b>'+escapeHtml(d.cad.changes)+'</b>'); if (Array.isArray(d.cad.updates) && d.cad.updates.length) p.push('Progress updates: <b>'+d.cad.updates.length+'</b>'); return p.join(' &nbsp;·&nbsp; '); } });
  entries.push({ stage:'CAM Section', icon:'fa-cogs', badge:'cam', whenIso: (d.cam && d.cam.forwardedAt) || d.camForwardedAt || null, stageKey:'CAM', detailFn: function(){ if (!d.cam) return ''; var p = []; if (d.artNo) p.push('Art No: <b>'+escapeHtml(d.artNo)+'</b>'); if (d.size) p.push('Size: <b>'+escapeHtml(d.size)+'</b>'); if (d.cam.grossWt) p.push('Weight: <b>'+formatNumber2(d.cam.grossWt)+' g</b>'); if (d.cam.branch) p.push('Branch: <b>'+escapeHtml(d.cam.branch)+'</b>'); return p.join(' &nbsp;·&nbsp; '); } });
  entries.push({ stage:'Casting Section', icon:'fa-fire', badge:'casting', whenIso: d.castingForwardedAt || (d.cam && d.cam.forwardedAt) || null, stageKey:'CASTING', detailFn: function(){ var p = []; if (d.cam && d.cam.branch) p.push('Branch: <b>'+escapeHtml(d.cam.branch)+'</b>'); return p.join(' &nbsp;·&nbsp; '); } });
  entries.push({ stage:'Samples Section', icon:'fa-cube', badge:'sample', whenIso: (d.casting && d.casting.sampleSentAt) || d.sampleForwardedAt || null, stageKey:'SAMPLES', detailFn: function(){ if (!d.casting) return ''; var p = []; if (d.casting.sampleDate) p.push('Sample Date: <b>'+formatDate(d.casting.sampleDate)+'</b>'); if (d.casting.grossWt) p.push('Weight: <b>'+formatNumber2(d.casting.grossWt)+' g</b>'); return p.join(' &nbsp;·&nbsp; '); } });
  entries.push({ stage:'Sent to HO', icon:'fa-paper-plane', badge:'sample', whenIso: (d.samples && d.samples.hoSentAt) || d.hoSentAt || null, stageKey:'SAMPLE', detailFn: function(){ if (!d.samples) return ''; var p = []; if (d.samples.hoDate) p.push('HO Date: <b>'+formatDate(d.samples.hoDate)+'</b>'); if (d.samples.hoRemarks) p.push('Remarks: <b>'+escapeHtml(d.samples.hoRemarks)+'</b>'); return p.join(' &nbsp;·&nbsp; '); } });
  var received = isOrderReceived(d);
  entries.push({ stage:'Order Received', icon:'fa-shopping-cart', badge:'ordered', whenIso: getOrderPlacedAt(d) || (received ? ((d.samples && d.samples.hoSentAt) || d.hoSentAt) : null), stageKey:'ORDERED', detailFn: function(){ return received ? 'Order status: <b>Received</b>' : ''; } });
  return entries;
}
function renderDesignTracking(){
  var host = document.getElementById('trackingContent'); if (!host) return;
  var artQuery = (document.getElementById('trackArtNo').value || '').trim();
  var nameQuery = (document.getElementById('trackName').value || '').trim().toLowerCase();
  if (!artQuery && !nameQuery){ host.innerHTML = '<div class="track-prompt"><i class="fas fa-search"></i>Enter an <b>Art Number</b> or <b>Product Name</b> above and click <b>Track</b>.</div>'; return; }
  var all = getAllDesigns();
  var matches = all;
  if (artQuery){ var realQ = normalizeArtNo(artQuery); matches = matches.filter(function(d){ if (!realQ) return false; return normalizeArtNo(d.artNo) === realQ; }); }
  if (nameQuery){ matches = matches.filter(function(d){ return String(d.name||'').toLowerCase().indexOf(nameQuery) !== -1; }); }
  if (!matches.length){ host.innerHTML = '<div class="track-empty"><i class="fas fa-exclamation-circle"></i>No design found matching <b>'+escapeHtml(artQuery || nameQuery)+'</b>.</div>'; return; }
  var now = Date.now();
  var html = '';
  matches.forEach(function(d){
    var entries = buildTimelineForDesign(d);
    var currentStageIdx = stageIndex(d.stage);
    var timeMs = entries.map(function(e){ return e.whenIso ? parseTime(e.whenIso) : null; });
    var firstTime = null;
    for (var j = 0; j < timeMs.length; j++){ if (timeMs[j] != null){ firstTime = timeMs[j]; break; } }
    var totalElapsed = (firstTime != null) ? (now - firstTime) : null;
    var headerImg = d.image ? '<img src="'+d.image+'" alt="Design" onclick="openZoom(this.src)">' : '';
    var headerHtml = '<div class="track-header">' + headerImg + '<div class="track-meta"><div class="track-art">'+escapeHtml(d.artNo || '(no art no yet)')+'</div><div class="track-name">'+escapeHtml(d.name)+'</div><div class="track-sub">' + (d.category ? '<b>'+escapeHtml(d.category)+'</b>' : '') + (d.group ? ' · '+escapeHtml(d.group) : '') + ((d.size || d.sizeIn) ? ' · '+escapeHtml(d.size||'')+(d.sizeIn ? ' ('+escapeHtml(d.sizeIn)+')' : '') : '') + '</div>' + (totalElapsed != null ? '<div class="track-total">Total Time Elapsed: <span class="dur">'+formatDuration(totalElapsed)+'</span></div>' : '') + '</div><div class="track-current"><span class="badge '+STAGE_BADGE[d.stage]+'">'+STAGE_LABELS[d.stage]+'</span></div></div>';
    var timelineHtml = '<div class="timeline">';
    entries.forEach(function(entry, idx){
      var mappedIdx = stageIndex(entry.stageKey);
      var cls = 'pending'; if (mappedIdx < currentStageIdx) cls = 'done'; else if (mappedIdx === currentStageIdx) cls = 'current';
      if (d.stage === 'ORDERED' && entry.stageKey === 'ORDERED') cls = 'current';
      var durationHtml = '';
      var startMs = timeMs[idx];
      if (startMs != null){
        var nextMs = null; for (var k = idx + 1; k < timeMs.length; k++){ if (timeMs[k] != null){ nextMs = timeMs[k]; break; } }
        var endMs = (nextMs != null) ? nextMs : now;
        var durMs = endMs - startMs; if (durMs < 0) durMs = 0;
        var running = (nextMs == null);
        if (!(cls === 'pending' && nextMs == null)){ durationHtml = '<div class="timeline-duration'+(running ? ' running' : '')+'"><i class="fas fa-hourglass-half"></i> '+(running ? 'In stage: ' : 'Time in stage: ')+'<b>'+formatDuration(durMs)+'</b>'+(running ? ' (running)' : '')+'</div>'; }
      }
      var dotIcon = cls === 'done' ? '<i class="fas fa-check"></i>' : (cls === 'current' ? '<i class="fas fa-circle"></i>' : '<i class="fas fa-circle" style="opacity:.3"></i>');
      var whenTxt = entry.whenIso ? formatDateTime(entry.whenIso) : 'Pending';
      var whenClass = entry.whenIso ? 'timeline-when' : 'timeline-when pending';
      var detailsHtml = ''; try { var dstr = entry.detailFn ? entry.detailFn() : ''; if (dstr) detailsHtml = '<div class="timeline-details">'+dstr+'</div>'; } catch(e){}
      timelineHtml += '<div class="timeline-row '+cls+'"><div class="timeline-dot">'+dotIcon+'</div><div class="timeline-content"><div class="timeline-stage"><i class="fas '+entry.icon+'"></i> '+escapeHtml(entry.stage) + (cls === 'current' ? ' <span class="badge '+entry.badge+'">Current</span>' : (cls === 'done' ? ' <span class="badge '+entry.badge+'">Done</span>' : ' <span class="badge pending">Pending</span>')) + '</div><div class="'+whenClass+'"><i class="fas fa-clock" style="font-size:10px;margin-right:4px;opacity:.6"></i>'+whenTxt+'</div>' + detailsHtml + durationHtml + '</div></div>';
    });
    timelineHtml += '</div>';
    html += '<div class="track-card">' + headerHtml + timelineHtml + '</div>';
  });
  host.innerHTML = html;
}
document.getElementById('trackApplyBtn').addEventListener('click', renderDesignTracking);
document.getElementById('trackResetBtn').addEventListener('click', function(){ document.getElementById('trackArtNo').value = ''; document.getElementById('trackName').value = ''; renderDesignTracking(); });
['trackArtNo','trackName'].forEach(function(id){ var el = document.getElementById(id); if (el) el.addEventListener('keydown', function(e){ if (e.key === 'Enter') renderDesignTracking(); }); });

/* ============================================================
   ARTIST WISE REPORT (Designs Bank)
   ============================================================ */
function renderArtistWiseReport(){
  var host = document.getElementById('artistReportContent');
  if (!host) return;
  var all = getAllDesigns();

  var fromDate = (document.getElementById('artistRptFromDate') || {}).value || '';
  var toDate   = (document.getElementById('artistRptToDate')   || {}).value || '';
  var groupF   = (document.getElementById('artistRptGroup')    || {}).value || 'all';
  var nameF    = (document.getElementById('artistRptName')     || {}).value || '';
  var artistF  = (document.getElementById('artistRptArtist')   || {}).value || 'all';

  function artistKey(v){ return String(v == null ? '' : v).trim().toLowerCase(); }

  var artistVariants = {};
  all.forEach(function(d){
    var raw = String(d.artist || '').trim();
    if (!raw) return;
    var k = artistKey(raw);
    if (!artistVariants[k]) artistVariants[k] = { counts: {}, total: 0 };
    artistVariants[k].counts[raw] = (artistVariants[k].counts[raw] || 0) + 1;
    artistVariants[k].total++;
  });

  function displayNameFor(key){
    var rec = artistVariants[key];
    if (!rec) return key;
    var best = key, bestCount = -1;
    Object.keys(rec.counts).forEach(function(c){
      if (rec.counts[c] > bestCount){ best = c; bestCount = rec.counts[c]; }
    });
    return best;
  }

  var aSel = document.getElementById('artistRptArtist');
  if (aSel){
    var existingKeys = {};
    for (var i = 0; i < aSel.options.length; i++){
      existingKeys[aSel.options[i].value.toLowerCase()] = true;
    }
    Object.keys(artistVariants).sort().forEach(function(k){
      if (existingKeys[k]) return;
      var opt = document.createElement('option');
      opt.value = k;
      opt.textContent = displayNameFor(k);
      aSel.appendChild(opt);
      existingKeys[k] = true;
    });
  }

  var filtered = all.filter(function(d){
    if (fromDate || toDate){
      var iso = d.date ? (d.date.length === 10 ? d.date + 'T00:00:00' : d.date) : d.createdAt;
      if (!iso) return false;
      var ymd = String(iso).slice(0,10);
      if (fromDate && ymd < fromDate) return false;
      if (toDate   && ymd > toDate)   return false;
    }
    if (groupF !== 'all' && d.group !== groupF) return false;
    if (nameF && String(d.name||'').toLowerCase().indexOf(nameF.toLowerCase()) === -1) return false;

    if (artistF !== 'all'){
      var dKey = artistKey(d.artist);
      if (dKey !== artistKey(artistF)) return false;
    }
    return true;
  });

  var groups = {};
  filtered.forEach(function(d){
    var key = artistKey(d.artist) || 'unassigned';
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  });
  var keys = Object.keys(groups).sort(function(a, b){
    return displayNameFor(a).localeCompare(displayNameFor(b));
  });

  if (!keys.length){
    host.innerHTML = '<div class="report-section-empty">No designs match the current filters.</div>';
    return;
  }

  var grandTotal  = filtered.length;
  var grandImages = filtered.filter(function(d){ return !!d.image; }).length;

  var html = '<div class="report-grid" style="margin-bottom:16px">'
    + '<div class="report-card total"><div class="label"><i class="fas fa-palette"></i> Total Designs</div><div class="value">'+formatNumber(grandTotal)+'</div><div class="sub">'+(fromDate||toDate?'Date filtered':'All time')+'</div></div>'
    + '<div class="report-card total"><div class="label"><i class="fas fa-image"></i> Images Uploaded</div><div class="value">'+formatNumber(grandImages)+'</div><div class="sub">with image</div></div>'
    + '<div class="report-card total"><div class="label"><i class="fas fa-user-pen"></i> Artists</div><div class="value">'+keys.length+'</div><div class="sub">active</div></div>'
    + '</div>';

  keys.forEach(function(key){
    var rows = groups[key];
    var imgCount = rows.filter(function(d){ return !!d.image; }).length;
    var shownName = displayNameFor(key) || 'Unassigned';
    html += '<div class="report-section"><div class="report-section-header"><h3><i class="fas fa-user-pen"></i> '+escapeHtml(shownName)+'</h3><span class="rs-count">'+rows.length+' designs · '+imgCount+' images</span></div>';
    html += '<div class="table-wrap"><table><thead><tr><th>SL</th><th>PRODUCT GROUP</th><th>PRODUCT NAME</th><th>DATE</th><th>IMAGE</th></tr></thead><tbody>';
    rows.forEach(function(d, i){
      html += '<tr><td>'+(i+1)+'</td><td>'+escapeHtml(d.group||'—')+'</td><td style="text-align:left">'+escapeHtml(d.name)+'</td><td>'+formatDate(d.date)+'</td><td>'+makeImg(d.image, 60, d.name)+'</td></tr>';
    });
    html += '</tbody></table></div></div>';
  });

  host.innerHTML = html;
}

/* ============================================================
   CAD DESIGNER WISE REPORT
   ============================================================ */
function renderCadDesignerReport(){
  var host = document.getElementById('cadDesignerReportContent');
  if (!host) return;

  var fromDate = (document.getElementById('cadRptFromDate') || {}).value || '';
  var toDate   = (document.getElementById('cadRptToDate')   || {}).value || '';
  var designerF = (document.getElementById('cadRptDesigner') || {}).value || 'all';

  var all = getAllDesigns();

  var dSel = document.getElementById('cadRptDesigner');
  if (dSel){
    var seen = {};
    for (var i = 0; i < dSel.options.length; i++) seen[dSel.options[i].value] = true;
    var names = {};
    all.forEach(function(d){ if (d.cad && d.cad.assignee) names[String(d.cad.assignee).trim()] = true; });
    Object.keys(names).sort().forEach(function(n){
      if (!seen[n]){
        var opt = document.createElement('option');
        opt.value = n; opt.textContent = n;
        dSel.appendChild(opt);
        seen[n] = true;
      }
    });
  }

  function cadCompleteDate(d){
    return (d.cam && d.cam.forwardedAt) || d.camForwardedAt || d.cadCompletedAt || null;
  }
  function isCadCompleted(d){
    if (!d.cad || !d.cad.assignee) return false;
    return stageIndex(d.stage) > stageIndex('CAD');
  }
  function getFinalCadImage(d){
    var updates = (d.cad && Array.isArray(d.cad.updates)) ? d.cad.updates : [];
    var lastUpdate = updates.length ? updates[updates.length - 1] : null;
    return (lastUpdate && lastUpdate.image)
        || (d.cam && d.cam.image)
        || (d.cad && d.cad.image)
        || d.image
        || '';
  }

  var completed = all.filter(function(d){
    if (!isCadCompleted(d)) return false;
    var assignee = String((d.cad && d.cad.assignee) || '').trim();
    if (designerF !== 'all' && assignee.toLowerCase() !== String(designerF).toLowerCase()) return false;
    if (fromDate || toDate){
      var iso = cadCompleteDate(d);
      if (!iso) return false;
      var ymd = String(iso).slice(0,10);
      if (fromDate && ymd < fromDate) return false;
      if (toDate   && ymd > toDate)   return false;
    }
    return true;
  });

  var groups = {};
  completed.forEach(function(d){
    var key = String((d.cad && d.cad.assignee) || 'Unassigned').trim() || 'Unassigned';
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  });
  var keys = Object.keys(groups).sort();

  if (!keys.length){
    host.innerHTML = '<div class="report-section-empty">No completed CAD designs match the current filters.</div>';
    return;
  }

  var grandTotal = completed.length;
  var grandImages = completed.filter(function(d){ return !!getFinalCadImage(d); }).length;

  var html = '<div class="report-grid" style="margin-bottom:16px">'
    + '<div class="report-card total"><div class="label"><i class="fas fa-check-circle"></i> Total Completed</div><div class="value">'+formatNumber(grandTotal)+'</div><div class="sub">'+(fromDate||toDate?'Date filtered':'All time')+'</div></div>'
    + '<div class="report-card total"><div class="label"><i class="fas fa-image"></i> Final Images</div><div class="value">'+formatNumber(grandImages)+'</div><div class="sub">last CAD image / forwarded</div></div>'
    + '<div class="report-card total"><div class="label"><i class="fas fa-users"></i> Designers</div><div class="value">'+keys.length+'</div><div class="sub">with completions</div></div>'
    + '</div>';

  keys.forEach(function(name){
    var rows = groups[name];
    var imgCount = rows.filter(function(d){ return !!getFinalCadImage(d); }).length;
    html += '<div class="report-section"><div class="report-section-header"><h3><i class="fas fa-user-tag"></i> '+escapeHtml(name)+'</h3><span class="rs-count">'+rows.length+' designs · '+imgCount+' images</span></div>';
    html += '<div class="table-wrap"><table><thead><tr><th>SL</th><th>ART NO.</th><th>PRODUCT GROUP</th><th>PRODUCT NAME</th><th>FINAL CAD IMAGE</th><th>COMPLETED / FORWARDED</th></tr></thead><tbody>';
    rows.forEach(function(d, i){
      var lastImg = getFinalCadImage(d);
      var imgHtml = lastImg ? makeImg(lastImg, 60, d.name + '_cad_final') : '<span style="color:#999">—</span>';
      var when = cadCompleteDate(d);
      html += '<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(d.artNo||'—')+'</b></td><td>'+escapeHtml(d.group||'—')+'</td><td style="text-align:left">'+escapeHtml(d.name)+'</td><td>'+imgHtml+'</td><td>'+(when ? formatDateTime(when) : '—')+'</td></tr>';
    });
    html += '</tbody></table></div></div>';
  });

  host.innerHTML = html;
}

(function bindNewReportEvents(){
  var a = document.getElementById('artistRptApplyBtn');
  var r = document.getElementById('artistRptResetBtn');
  if (a && !a.dataset.bound){ a.dataset.bound = '1'; a.addEventListener('click', renderArtistWiseReport); }
  if (r && !r.dataset.bound){ r.dataset.bound = '1'; r.addEventListener('click', function(){
    ['artistRptFromDate','artistRptToDate','artistRptName'].forEach(function(id){ var el = document.getElementById(id); if (el) el.value = ''; });
    ['artistRptGroup','artistRptArtist'].forEach(function(id){ var el = document.getElementById(id); if (el) el.value = 'all'; });
    renderArtistWiseReport();
  }); }
  var ca = document.getElementById('cadRptApplyBtn');
  var cr = document.getElementById('cadRptResetBtn');
  if (ca && !ca.dataset.bound){ ca.dataset.bound = '1'; ca.addEventListener('click', renderCadDesignerReport); }
  if (cr && !cr.dataset.bound){ cr.dataset.bound = '1'; cr.addEventListener('click', function(){
    ['cadRptFromDate','cadRptToDate'].forEach(function(id){ var el = document.getElementById(id); if (el) el.value = ''; });
    var sel = document.getElementById('cadRptDesigner'); if (sel) sel.value = 'all';
    renderCadDesignerReport();
  }); }
})();

/* ============================================================
   BOOT & RENDER ALL
   ============================================================ */
function renderAll(){
  try {
    renderBank(); renderCad(); renderCadUpdates(); renderCam(); renderCasting(); renderSamples(); renderOrderPending(); renderReport(); buildSectionReport(); renderDesignTracking(); updateTabBadges();
    try { renderArtistWiseReport(); } catch(e){ console.error('artist report', e); }
    try { renderCadDesignerReport(); } catch(e){ console.error('cad designer report', e); }
  } catch(err){ console.error('Render error:', err); }
}

function bootApp(){
  document.getElementById('app').classList.remove('hidden');
  var label = CURRENT_BRANCH || 'Designs';
  var icon = 'fa-store';
  if (CURRENT_ROLE === 'admin'){ label = 'Admin'; icon = 'fa-user-shield'; }
  else if (isCadDesignerUser()){ label = session.username || 'CAD Designer'; icon = 'fa-drafting-compass'; }
  else if (CURRENT_ROLE === 'designer'){
    if (MY_SECTION) label = MY_SECTION;
    if (isCadChargeUser()){ label = 'CAD Charge'; icon = 'fa-user-tie'; }
    else icon = 'fa-palette';
  }
  else if (CURRENT_ROLE === 'workshop'){ icon = 'fa-tools'; }
  var pillIcon = document.getElementById('branchIcon');
  if (pillIcon) pillIcon.className = 'fas ' + icon;
  document.getElementById('branchName').textContent = label;
  document.getElementById('fDate').value = new Date().toISOString().slice(0,10);
  updateCategoryFields();
  (function initReportDates(){
    var today = new Date().toISOString().slice(0,10);
    var d30 = new Date(); d30.setDate(d30.getDate() - 30);
    var d30iso = d30.toISOString().slice(0,10);
    var arf = document.getElementById('artistRptFromDate'); if (arf) arf.value = d30iso;
    var art = document.getElementById('artistRptToDate');   if (art) art.value = today;
    var crf = document.getElementById('cadRptFromDate');    if (crf) crf.value = d30iso;
    var crt = document.getElementById('cadRptToDate');      if (crt) crt.value = today;
  })();
  applyRoleVisibility();
  renderAll();
}

window.addEventListener('storage', function(e){ if (e.key === DESIGNS_KEY || e.key === ORDERS_KEY || e.key === SENDS_KEY || e.key === COMPLETED_KEY || e.key === CAD_DESIGNERS_KEY || e.key === SECTION_CONTACTS_KEY) renderAll(); });
setInterval(function(){ if (document.getElementById('app') && !document.getElementById('app').classList.contains('hidden')) renderAll(); }, 5000);

window.normalizeArtNo = normalizeArtNo;
window.getOrderedArtNoSet = getOrderedArtNoSet;
window.openZoom = openZoom;
window.closeZoom = closeZoom;
var zoomCloseButton = document.getElementById('zoomClose');
var zoomModalElement = document.getElementById('zoomModal');
if (zoomCloseButton) zoomCloseButton.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); closeZoom(); });
if (zoomModalElement) {
  zoomModalElement.addEventListener('click', function(e){ if (e.target === zoomModalElement) closeZoom(); });
  var zoomImageElement = document.getElementById('zoomImg');
  if (zoomImageElement) zoomImageElement.addEventListener('click', function(e){ e.stopPropagation(); });
}
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeZoom(); });
window.openEditModal = openEditModal;
window.deleteDesignById = deleteDesignById;
window.openCadModal = openCadModal;
window.openCamModal = openCamModal;
window.openCastingModal = openCastingModal;
window.openHoModal = openHoModal;
window.forwardCamToCasting = forwardCamToCasting;
window.openAllotCadModal = openAllotCadModal;
window.openCadUpdateModal = openCadUpdateModal;
window.toggleCadHistory = toggleCadHistory;
window.printSilverCadOrder = printSilverCadOrder;
window.printSilverCadOrderById = printSilverCadOrderById;

/* ★ NEW — expose contact registry helpers for console / future admin UI */
window.getSectionContacts = getSectionContacts;
window.saveSectionContacts = saveSectionContacts;
window.notifySectionForward = notifySectionForward;
window.notifyWhatsApp = notifyWhatsApp;

var trClose = document.getElementById('closeTelegramResultModal');
var trOk = document.getElementById('telegramResultOkBtn');
function hideTelegramResult(){ document.getElementById('telegramResultModal').classList.add('hidden'); }
if (trClose) trClose.addEventListener('click', hideTelegramResult);
if (trOk) trOk.addEventListener('click', hideTelegramResult);

try { bootApp(); } catch(err){ console.error('BOOT ERROR:', err); var b = document.getElementById('globalErrorBanner'); if (b){ b.style.display = 'block'; b.textContent = 'BOOT ERROR: ' + (err && err.stack ? err.stack : String(err)); } else alert('BOOT ERROR: ' + err.message); }