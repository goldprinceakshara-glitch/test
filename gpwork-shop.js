/* ============================================================
   gpwork-shop.js — v19.0
   - CHANGED: "HQ" renamed to "HO" (Head Office) in demo data & labels.
             formatBranchDisplayName still maps legacy "HQ" → "HO"
             so older saved records display correctly.
   - Allow sending MORE than pending/ordered quantity.
   - Pending math handles negative values (over-sent) properly.
   - Clear Order button allows skipping minor pending items.
   - NEW: Priority orders highlighted in the orders table, a
          priority stat card, and a priority badge in the detail modal.
   ============================================================ */

function _readJSON(k, fb){ try { var v = JSON.parse(localStorage.getItem(k)||'null'); return v==null?fb:v; } catch(e){ return fb; } }
function _norm(v){ return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase(); }
/* === canonical art-number normaliser (used EVERYWHERE) === */
function normArt(v){ return String(v == null ? '' : v).trim().toLowerCase(); }

/* ---------- SESSION ---------- */
var session = null;
try { session = JSON.parse(sessionStorage.getItem('gp_logged_user') || 'null'); } catch(e){}
var _sessionProblem = null;

var CURRENT_ROLE = String((session && session.role) || '').toLowerCase();
var CURRENT_USER_LABEL = (session && session.username) || 'branch';

function isAdminLikeRole(){
  return CURRENT_ROLE === 'admin'
      || CURRENT_ROLE === 'developer'
      || CURRENT_ROLE === 'branch_incharge'
      || CURRENT_ROLE === 'branch incharge'
      || CURRENT_ROLE === 'branchincharge';
}

/* Optional explicit branch from URL (?branch=Kalimatha). Never persisted. */
var _queryBranch = '';
try { _queryBranch = (new URLSearchParams(location.search).get('branch') || '').trim(); } catch(e){}
function _isAllToken(v){ var n = _norm(v); return n === 'all' || n === '*' || n === 'all workshops'; }

if (!session || !session.username){
  _sessionProblem = 'No login session found. Please log in again.';
  session = session || {};
}

/* ------------------------------------------------------------
   BRANCH RESOLUTION
   - admin / developer / branch_incharge  -> ALL workshops by default
     (their session.branch is 'HO' / 'ALL' / username, which is NOT a
     workshop name, so it must never be used as a filter).
     Only an explicit ?branch=Name narrows the view.
   - workshop users -> their own branch only.
   ------------------------------------------------------------ */
var _resolvedBranch = '';
if (isAdminLikeRole()){
  if (_queryBranch && !_isAllToken(_queryBranch)) _resolvedBranch = _queryBranch;
} else if (session && session.username){
  var _candidates = [
    _queryBranch, session.branch, session.branchName, session.workshop,
    session.branch_name, session.branchCode, session.username
  ];
  for (var i = 0; i < _candidates.length; i++){
    var c = _candidates[i];
    if (c && String(c).trim() && !_isAllToken(c)) { _resolvedBranch = String(c).trim(); break; }
  }
  if (!_resolvedBranch){
    try {
      var allOrders0 = _readJSON('goldprince_orders_v3', []);
      if (Array.isArray(allOrders0)){
        var uname2 = _norm(session.username);
        for (var oi = 0; oi < allOrders0.length; oi++){
          var o0 = allOrders0[oi] || {};
          var wName = _norm(o0.workshop);
          if (wName && (wName === uname2 || wName.indexOf(uname2) !== -1 || uname2.indexOf(wName) !== -1)){
            _resolvedBranch = String(o0.workshop).trim(); break;
          }
        }
      }
    } catch(e){}
  }
  if (!_resolvedBranch) _sessionProblem = _sessionProblem || 'Login succeeded, but no branch was found in the session.';
}

var CURRENT_BRANCH = _resolvedBranch;
var SHOW_ALL_WORKSHOPS = isAdminLikeRole() && !CURRENT_BRANCH;

function showSessionWarning(msg, extra){
  var el = document.getElementById('sessionWarn');
  if (!el) return;
  var html = '<b>⚠ Session warning:</b> ' + msg;
  if (extra) html += ' <code>' + String(extra).replace(/[<>&]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;'}[c]; }) + '</code>';
  html += ' <button onclick="window.location.replace(\'index.html\')">Log in again</button>';
  el.innerHTML = html;
  el.classList.remove('hidden');
  console.warn('[gpwork-shop]', msg, extra);
}
if (_sessionProblem) showSessionWarning(_sessionProblem, 'session=' + JSON.stringify(session));

/* ---------- DISPLAY HELPERS ---------- */
/* Legacy "HQ" values are now shown as "HO" (Head Office). */
function formatBranchDisplayName(branchStr){
  if (!branchStr) return '';
  var b = String(branchStr).trim();
  if (/^hq$/i.test(b)) return 'HO';
  return b;
}
function getBranchTitleLabel(){
  if (CURRENT_ROLE === 'admin')            return 'admin';
  if (CURRENT_ROLE === 'developer')        return 'developer';
  if (CURRENT_ROLE === 'branch_incharge')  return 'branch incharge';
  if (CURRENT_ROLE === 'branch incharge')  return 'branch incharge';
  if (CURRENT_ROLE === 'branchincharge')   return 'branch incharge';
  if (!CURRENT_BRANCH) return 'Branch (no branch in session)';
  return formatBranchDisplayName(CURRENT_BRANCH) + ' Branch';
}

/* ---------- KEYS ---------- */
var ORDERS_KEY    = 'goldprince_orders_v3';
var STAGES_KEY    = 'goldprince_stage_history_v1';
var COMPLETED_KEY = 'goldprince_completed_v1';
var SEEN_KEY      = 'gp_seen_order_ids_' + (CURRENT_BRANCH || 'ALL');
var NOTIF_LOG_KEY = 'gp_notif_log_' + (CURRENT_BRANCH || 'ALL');

var STAGES = ['NEW','WAX','CASTING','FILING','HO'];
var STAGE_LABELS = { NEW:'New', WAX:'Wax Section', CASTING:'Casting Section', FILING:'Filing Section', HO:'Head Office' };
var STAGE_CLASS  = { NEW:'new', WAX:'wax', CASTING:'casting', FILING:'filing', HO:'ho' };

function readJSON(k, fb){ return _readJSON(k, fb); }
function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function escapeAttr(v){ return escapeHtml(v); }
function formatNumber(v){ var n=Number(v||0); return n.toLocaleString('en-IN',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2}); }
function formatNumber2(v){ var n=Number(v||0); return n.toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2}); }
function formatDate(v){ if(!v) return '—'; var p=String(v).split('-'); return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:v; }
function formatDateTime(iso){ if(!iso) return '—'; var d=new Date(iso); if(isNaN(d)) return '—'; return d.toLocaleDateString('en-IN')+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
function formatShortDate(iso){ if(!iso) return '—'; var d=new Date(iso); if(isNaN(d)) return '—'; return d.toLocaleDateString('en-IN'); }
function safeFilePart(v){ return String(v||'FILE').replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,''); }
function _sameBranch(a, b){
  var na = _norm(a), nb = _norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1;
}

/* ============================================================
   DEMO DATA — only if database empty
   NOTE: "HO" (Head Office) is used instead of the old "HQ".
   ============================================================ */
function generateDemoDataIfEmpty() {
  var existing = readJSON(ORDERS_KEY, []);
  if (existing && existing.length > 0) return;
  var branches = ['Kalimatha', 'HO', 'Chandni Chowk', 'Zaveri Bazaar'];
  var groups = ['3D PREMIUM IDOLS', '3D IDOLS', '2D IDOLS', 'JEWELLERY', 'GOD FRAMES'];
  var demoOrders = [], demoStages = {}, now = new Date();
  for (var i = 0; i < 15; i++) {
    var b = branches[i % branches.length];
    var g = groups[i % groups.length];
    var qty = Math.floor(Math.random() * 10) + 1;
    var wt = Math.floor(Math.random() * 50) + 10;
    var d = new Date(now); d.setDate(now.getDate() - Math.floor(Math.random() * 10));
    var orderId = 'ord_' + i + '_' + Date.now();
    var order = {
      id: orderId, orderNo: 'ORD-' + (1000 + i), estimateNo: 'EST-' + (2000 + i),
      productGroup: g, workshop: b, totalQty: qty, totalWeight: wt,
      orderDate: d.toISOString().split('T')[0],
      items: [{ artNo: 'ART-' + i + '-1', name: 'Design ' + (i+1), quantity: qty, weight: wt / qty, totalWeight: wt }]
    };
    demoOrders.push(order);
    var stageIdx = i % 5;
    var stageArr = [{ stage: 'NEW', date: d.toISOString(), by: b }];
    for (var s = 1; s <= stageIdx; s++) {
       stageArr.push({ stage: STAGES[s], date: new Date(d.getTime() + s*86400000).toISOString(), by: b });
    }
    demoStages[orderId] = stageArr;
  }
  saveJSON(ORDERS_KEY, demoOrders);
  saveJSON(STAGES_KEY, demoStages);
  console.log('[gpwork-shop] Demo data generated because database was empty.');
}
generateDemoDataIfEmpty();

/* ============================================================
   SCOPE
   ============================================================ */
function getAllOrdersRaw(){ var all = readJSON(ORDERS_KEY, []); return Array.isArray(all) ? all : []; }
function getScopedOrders(){
  var all = getAllOrdersRaw();
  if (SHOW_ALL_WORKSHOPS) return all;
  if (!CURRENT_BRANCH) return [];
  return all.filter(function(o){ return o && _sameBranch(o.workshop, CURRENT_BRANCH); });
}
function findScopedOrder(id){ return getScopedOrders().find(function(o){ return o.id === id; }) || null; }
function getCompletedMap(){ var m = readJSON(COMPLETED_KEY, {}); return (m && typeof m === 'object') ? m : {}; }
function isCompleted(orderId){ return !!getCompletedMap()[orderId]; }

/* === per-art sent accumulator for one order === */
function getSentByArtForOrder(order){
  var m = getCompletedMap();
  var info = m && m[order.id] ? m[order.id] : null;
  var out = {};
  if (info && Array.isArray(info.rows)){
    info.rows.forEach(function(r){
      var k = normArt(r.artNo);
      if (!k) return;
      var q = Number(r.stockQty || 0);
      var w = Number(r.rowTotal != null ? r.rowTotal : (q * Number(r.weight || 0)));
      if (!out[k]) out[k] = { qty: 0, wt: 0 };
      out[k].qty += q;
      out[k].wt  += w;
    });
  }
  return out;
}

function getSentTotalsForOrder(order){
  var m = getCompletedMap();
  var info = m && m[order.id] ? m[order.id] : null;
  var sentQty = 0, sentWt = 0;
  if (info && Array.isArray(info.rows)){
    info.rows.forEach(function(r){
      sentQty += Number(r.stockQty || 0);
      sentWt  += Number(r.rowTotal || (Number(r.stockQty || 0) * Number(r.weight || 0)));
    });
  }
  return {
    orderQty: Number(order.totalQty || 0),
    orderWt:  Number(order.totalWeight || 0),
    sentQty: sentQty, sentWt: sentWt,
    pendingQty: Number(order.totalQty || 0) - sentQty,
    pendingWt:  Number(order.totalWeight || 0) - sentWt,
    lots: (info && Array.isArray(info.lots)) ? info.lots : [],
    cleared: !!(info && info.cleared),
    lastSentAt: info && info.lastSentAt ? info.lastSentAt : null,
    rows: (info && Array.isArray(info.rows)) ? info.rows : [],
    clearedQty: info && info.clearedQty ? Number(info.clearedQty) : 0
  };
}

/* === Pending-by-art for a single order (handles over-sending) === */
function getPendingByArtForOrder(order){
  var sentByArt = getSentByArtForOrder(order);
  var out = [];
  (order.items || []).forEach(function(it){
    var art = normArt(it.artNo);
    if (!art) return;
    var ordered = Number(it.quantity || 0);
    var sent = (sentByArt[art] ? sentByArt[art].qty : 0);
    var pending = ordered - sent;
    out.push({
      artNo: it.artNo,
      name: it.name || it.artNo,
      heightInch: it.heightInch || '',
      orderQty: ordered,
      sentQty: sent,
      pendingQty: pending,
      weight: Number(it.weight || 0),
      pendingWt: pending * Number(it.weight || 0),
      sentWt: sentByArt[art] ? sentByArt[art].wt : 0
    });
  });
  // coalesce duplicates
  var byKey = {}, merged = [];
  out.forEach(function(x){
    var k = normArt(x.artNo);
    if (!byKey[k]){
      byKey[k] = x; merged.push(x);
    } else {
      byKey[k].orderQty += x.orderQty;
      byKey[k].sentQty += x.sentQty;
      byKey[k].pendingQty += x.pendingQty;
      byKey[k].sentWt += x.sentWt;
      byKey[k].pendingWt += x.pendingWt;
    }
  });
  return merged;
}

function getProcessingOrders(){
  var m = getCompletedMap();
  return getScopedOrders().filter(function(o){
    var info = m[o.id];
    if (!info) return true;                             // never dispatched
    if (info.cleared) return false;                     // cleared by branch
    var sent = 0;
    (info.rows || []).forEach(function(r){ sent += Number(r.stockQty || 0); });
    var total = Number(o.totalQty || 0);
    
    // If total > 0 and we sent less than total -> pending remains
    if (total > 0 && sent < total) return true;         
    
    // If we over-sent, it won't show here, unless there are still positive pending items
    var hasPositivePending = false;
    var pendingByArt = getPendingByArtForOrder(o);
    pendingByArt.forEach(function(pa){ if (pa.pendingQty > 0) hasPositivePending = true; });
    
    return hasPositivePending; 
  });
}
function getCompletedOrders(){
  var m = getCompletedMap();
  return getScopedOrders().filter(function(o){ return !!m[o.id]; })
    .map(function(o){ return { order:o, info:m[o.id] }; })
    .sort(function(a,b){
      var ta = new Date(a.info.lastSentAt || a.info.completedAt || 0);
      var tb = new Date(b.info.lastSentAt || b.info.completedAt || 0);
      return tb - ta;
    });
}

/* ---------- STAGES ---------- */
function getAllStages(){ var s = readJSON(STAGES_KEY, {}); return (s && typeof s === 'object') ? s : {}; }
function getOrderTimeline(orderId){
  var all = getAllStages();
  var log = Array.isArray(all[orderId]) ? all[orderId] : [];
  var tl = { NEW:{date:null,by:null}, WAX:{date:null,by:null}, CASTING:{date:null,by:null}, FILING:{date:null,by:null}, HO:{date:null,by:null} };
  log.forEach(function(entry){
    if (!entry || !entry.stage) return;
    if (!tl[entry.stage]) tl[entry.stage] = { date:null, by:null };
    if (!tl[entry.stage].date || new Date(entry.date) > new Date(tl[entry.stage].date)) {
      tl[entry.stage] = { date: entry.date, by: entry.by };
    }
  });
  return tl;
}
function getOrderStages(orderId){
  var all = getAllStages();
  if (!all[orderId] || !Array.isArray(all[orderId]) || !all[orderId].length) return [{ stage:'NEW', date:null, by:'auto' }];
  return all[orderId];
}
function getCurrentStage(orderId){
  var st = getOrderStages(orderId);
  return st[st.length-1].stage;
}
function setOrderStage(orderId, newStage){
  var all = getAllStages();
  var stages = all[orderId] && Array.isArray(all[orderId]) ? all[orderId].slice() : [{ stage:'NEW', date:null, by:'auto' }];
  stages.push({ stage:newStage, date:new Date().toISOString(), by:(CURRENT_BRANCH || CURRENT_USER_LABEL) });
  all[orderId] = stages;
  saveJSON(STAGES_KEY, all);
}
function nextStage(cur){
  var i = STAGES.indexOf(cur);
  return (i >= 0 && i < STAGES.length-1) ? STAGES[i+1] : null;
}

(function seedReceivedDates(){
  var orders = getProcessingOrders();
  var all = getAllStages();
  var changed = false;
  orders.forEach(function(o){
    if (!all[o.id] || !Array.isArray(all[o.id]) || !all[o.id].length){
      all[o.id] = [{ stage:'NEW', date: o.forwardedAt || o.confirmedAt || o.createdAt || new Date().toISOString(), by: o.workshop }];
      changed = true;
    }
  });
  if (changed) saveJSON(STAGES_KEY, all);
})();

/* ============================================================
   STAGE FILTERS
   ============================================================ */
var stageFilters = { workshop:'', group:'', from:'', to:'' };
var activeStageFilter = 'all';

function getWorkshopOptions(){
  var seen = {}, out = [];
  getScopedOrders().forEach(function(o){
    var b = String((o && o.workshop) || '').trim();
    if (!b) return;
    var k = _norm(b); if (seen[k]) return;
    seen[k] = true; out.push(b);
  });
  out.sort(function(a,b){ return a.localeCompare(b); });
  return out;
}
function populateWorkshopFilter(){
  var sel = document.getElementById('fWorkshop'); if (!sel) return;
  var opts = '<option value="">All Workshops</option>';
  getWorkshopOptions().forEach(function(b){
    opts += '<option value="'+escapeHtml(b)+'"'+(stageFilters.workshop===b?' selected':'')+'>'+escapeHtml(formatBranchDisplayName(b))+'</option>';
  });
  sel.innerHTML = opts;
}
function applyStageFiltersToOrders(list){
  var f = stageFilters;
  return list.filter(function(o){
    if (f.workshop && !_sameBranch(o.workshop, f.workshop)) return false;
    if (f.group && String(o.productGroup||'') !== f.group) return false;
    if (f.from || f.to){
      var tl = getOrderTimeline(o.id);
      var dStr = (tl.NEW && tl.NEW.date) || o.orderDate || o.createdAt || null;
      if (dStr){
        var d = new Date(dStr); if (!isNaN(d)){
          if (f.from){ var fromD = new Date(f.from + 'T00:00:00'); if (d < fromD) return false; }
          if (f.to){ var toD = new Date(f.to + 'T23:59:59'); if (d > toD) return false; }
        }
      }
    }
    return true;
  });
}

/* ---------- STATS ---------- */
function computeStats(orders){
  var stats = {
    '3D PREMIUM IDOLS':{orders:0,qty:0,weight:0},
    '3D IDOLS':{orders:0,qty:0,weight:0}, 
    '2D IDOLS':{orders:0,qty:0,weight:0},
    'JEWELLERY':{orders:0,qty:0,weight:0}, 
    'GOD FRAMES':{orders:0,qty:0,weight:0},
    TOTAL:{orders:0,qty:0,weight:0}
  };
  orders.forEach(function(o){
    var g = o.productGroup || '3D IDOLS';
    if (!stats[g]) stats[g] = { orders:0, qty:0, weight:0 };
    stats[g].orders += 1; stats[g].qty += Number(o.totalQty||0); stats[g].weight += Number(o.totalWeight||0);
    stats.TOTAL.orders += 1; stats.TOTAL.qty += Number(o.totalQty||0); stats.TOTAL.weight += Number(o.totalWeight||0);
  });
  return stats;
}
function renderStats(){
  var processing = getProcessingOrders();
  var s = computeStats(processing);
  var icons = { 
    '3D PREMIUM IDOLS':'fa-crown', 
    '3D IDOLS':'fa-cube', 
    '2D IDOLS':'fa-layer-group', 
    'JEWELLERY':'fa-gem', 
    'GOD FRAMES':'fa-image' 
  };
  var html = '';
  ['3D PREMIUM IDOLS','3D IDOLS','2D IDOLS','JEWELLERY','GOD FRAMES'].forEach(function(g){
    html += '<div class="stat-card">'
         +   '<div class="label"><i class="fas '+icons[g]+'"></i> '+g+'</div>'
         +   '<div class="value">'+formatNumber(s[g].orders)+'</div>'
         +   '<div class="sub">'+(s[g].orders === 1 ? 'order' : 'orders')+' · '+formatNumber(s[g].qty)+' pcs · '+formatNumber(s[g].weight)+' g</div>'
         + '</div>';
  });
  html += '<div class="stat-card total">'
       +   '<div class="label"><i class="fas fa-chart-line"></i> Total Orders</div>'
       +   '<div class="value">'+formatNumber(s.TOTAL.orders)+'</div>'
       +   '<div class="sub">'+formatNumber(s.TOTAL.qty)+' pcs · '+formatNumber(s.TOTAL.weight)+' g</div>'
       + '</div>';

  var priorityCount = processing.filter(function(o){ return o.priority; }).length;
  if (priorityCount > 0){
    html += '<div class="stat-card priority-stat">'
         +   '<div class="label"><i class="fas fa-star"></i> Priority Orders</div>'
         +   '<div class="value">'+formatNumber(priorityCount)+'</div>'
         +   '<div class="sub">marked from Head Office</div>'
         + '</div>';
  }

  var grid = document.getElementById('statsGrid'); if (grid) grid.innerHTML = html;
}

/* ---------- STAGE SUMMARY ---------- */
function renderStageSummary(){
  var el = document.getElementById('stageSummaryGrid'); if (!el) return;
  var orders = applyStageFiltersToOrders(getProcessingOrders());
  var buckets = {};
  STAGES.forEach(function(s){ buckets[s] = { orders:0, qty:0, weight:0 }; });
  orders.forEach(function(o){
    var st = getCurrentStage(o.id);
    if (!buckets[st]) buckets[st] = { orders:0, qty:0, weight:0 };
    buckets[st].orders += 1; buckets[st].qty += Number(o.totalQty || 0); buckets[st].weight += Number(o.totalWeight || 0);
  });
  var grand = { orders: 0, qty: 0, weight: 0 };
  Object.keys(buckets).forEach(function(k){ grand.orders += buckets[k].orders; grand.qty += buckets[k].qty; grand.weight += buckets[k].weight; });
  var filterLabel = (activeStageFilter === 'all') ? 'Showing: All Processing' : ('Showing: ' + STAGE_LABELS[activeStageFilter]);
  var html = '';
  STAGES.forEach(function(st){
    var b = buckets[st]; var active = (activeStageFilter === st) ? ' active' : '';
    html += '<div class="stage-sum-card'+active+'" data-stage="'+st+'">'
         +   '<div class="ss-label"><i class="fas fa-circle"></i> '+STAGE_LABELS[st]+'</div>'
         +   '<div class="ss-row"><span>Orders</span><b>'+formatNumber(b.orders)+'</b></div>'
         +   '<div class="ss-row"><span>Pcs</span><b>'+formatNumber(b.qty)+'</b></div>'
         +   '<div class="ss-row"><span>Weight (g)</span><b>'+formatNumber(b.weight)+'</b></div>'
         + '</div>';
  });
  html += '<div class="stage-sum-card grand">'
       +    '<div class="ss-label"><i class="fas fa-chart-line"></i> Grand Total</div>'
       +    '<div class="ss-row"><span>Orders</span><b>'+formatNumber(grand.orders)+'</b></div>'
       +    '<div class="ss-row"><span>Pcs</span><b>'+formatNumber(grand.qty)+'</b></div>'
       +    '<div class="ss-row"><span>Weight (g)</span><b>'+formatNumber(grand.weight)+'</b></div>'
       +  '</div>';
  html += '<div class="stage-sum-filter-label">'+filterLabel+'</div>';
  el.innerHTML = html;
  el.querySelectorAll('.stage-sum-card[data-stage]').forEach(function(card){
    card.addEventListener('click', function(){
      var st = card.dataset.stage; activeStageFilter = st;
      document.querySelectorAll('.tab[data-stage]').forEach(function(t){ t.classList.toggle('active', t.dataset.stage === st); });
      renderOrders();
    });
  });
}

/* ---------- ORDERS TABLE ---------- */
function renderOrders(){
  var allOrders = applyStageFiltersToOrders(getProcessingOrders());
  var tbody = document.getElementById('ordersBody');
  var tfoot = document.getElementById('ordersTfoot');
  var rows = allOrders.map(function(o){
    return { o:o, stage:getCurrentStage(o.id), tl:getOrderTimeline(o.id), sent:getSentTotalsForOrder(o) };
  });
  if (activeStageFilter !== 'all') rows = rows.filter(function(r){ return r.stage === activeStageFilter; });

  var totOrders = rows.length, totQty = 0, totWt = 0;
  rows.forEach(function(r){ totQty += Number(r.o.totalQty || 0); totWt += Number(r.o.totalWeight || 0); });

  if (!rows.length){
    var msg;
    if (!SHOW_ALL_WORKSHOPS && !CURRENT_BRANCH) msg = 'No branch in session. Please log out and log in again.';
    else if (allOrders.length) msg = 'No orders in this stage (after filters).';
    else msg = SHOW_ALL_WORKSHOPS ? 'No processing orders for any workshop (after filters).' : 'No processing orders for <b>'+escapeHtml(formatBranchDisplayName(CURRENT_BRANCH))+'</b>.';
    tbody.innerHTML = '<tr><td colspan="13" class="empty-list">'+msg+'</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    renderStageSummary(); return;
  }

  tbody.innerHTML = rows.map(function(r){
    var stageHtml = '<span class="badge '+STAGE_CLASS[r.stage]+'">'+STAGE_LABELS[r.stage]+'</span>';
    var pendBadge = '';
    if (r.sent.sentQty > 0){
      var pend = r.sent.pendingQty;
      pendBadge = pend > 0
        ? ' <span class="badge partial" style="font-size:9px;margin-left:4px">'+formatNumber(pend)+' pending</span>'
        : ' <span class="badge full" style="font-size:9px;margin-left:4px">Sent</span>';
    }
    var wsHtml = '<b style="color:#8c004c">'+escapeHtml(formatBranchDisplayName(r.o.workshop||'—'))+'</b>';
    var priorityCls   = r.o.priority ? ' priority-order' : '';
    var priorityBadge = r.o.priority ? ' <span class="priority-badge">PRIORITY</span>' : '';
    return '<tr class="clickable'+priorityCls+'" data-id="'+escapeHtml(r.o.id)+'">'
         +   '<td>'+wsHtml+'</td>'
         +   '<td class="order-no-cell"><b>'+escapeHtml(r.o.orderNo||'—')+'</b>'+pendBadge+priorityBadge+'</td>'
         +   '<td>'+escapeHtml(r.o.estimateNo||'—')+'</td>'
         +   '<td>'+escapeHtml(r.o.productGroup||'—')+'</td>'
         +   '<td>'+cellDate(r.tl.NEW.date)+'</td>'
         +   '<td>'+cellDate(r.tl.WAX.date)+'</td>'
         +   '<td>'+cellDate(r.tl.CASTING.date)+'</td>'
         +   '<td>'+cellDate(r.tl.FILING.date)+'</td>'
         +   '<td>'+cellDate(r.tl.HO.date)+'</td>'
         +   '<td>'+formatNumber(r.o.totalQty)+'</td>'
         +   '<td>'+formatNumber(r.o.totalWeight)+'</td>'
         +   '<td>'+stageHtml+'</td>'
         +   '<td><button class="btn primary" data-open="'+escapeHtml(r.o.id)+'">Update</button></td></tr>';
  }).join('');

  if (tfoot){
    tfoot.innerHTML = '<tr>'
      + '<td colspan="9" style="text-align:right">GRAND TOTAL ('+formatNumber(totOrders)+' order'+(totOrders===1?'':'s')+'):</td>'
      + '<td>'+formatNumber(totQty)+'</td><td>'+formatNumber(totWt)+'</td><td colspan="2"></td></tr>';
  }
  tbody.querySelectorAll('tr.clickable').forEach(function(tr){
    tr.addEventListener('click', function(e){ if (e.target.tagName === 'BUTTON') return; openOrder(tr.dataset.id); });
  });
  tbody.querySelectorAll('[data-open]').forEach(function(b){
    b.addEventListener('click', function(e){ e.stopPropagation(); openOrder(b.dataset.open); });
  });
  renderStageSummary();
}
function cellDate(iso){ if (!iso) return '<span style="color:#bbb">—</span>'; return '<span style="color:#8c004c;font-weight:600">'+formatShortDate(iso)+'</span>'; }

/* ============================================================
   ORDER DETAIL MODAL
   ============================================================ */
var currentOrder = null;
function getDispatchedInfo(orderId){ var m = getCompletedMap(); return m && m[orderId] ? m[orderId] : null; }

function mergeDispatchedItems(order, dispatchedInfo){
  var items = Array.isArray(order.items) ? order.items : [];
  var sentByArt = {};
  if (dispatchedInfo && Array.isArray(dispatchedInfo.rows)){
    dispatchedInfo.rows.forEach(function(r){
      var k = normArt(r.artNo);
      if (!k) return;
      var q = Number(r.stockQty || 0);
      var w = Number(r.rowTotal != null ? r.rowTotal : (q * Number(r.weight || 0)));
      if (!sentByArt[k]) sentByArt[k] = { qty: 0, wt: 0 };
      sentByArt[k].qty += q;
      sentByArt[k].wt  += w;
    });
  }
  var out = items.map(function(x){
    var key = normArt(x.artNo);
    var s = sentByArt[key] || { qty: 0, wt: 0 };
    return {
      artNo: x.artNo, name: x.name, heightInch: x.heightInch, image: x.image,
      orderQty: Number(x.quantity || 0), orderWeight: Number(x.weight || 0),
      orderTotal: Number(x.totalWeight || 0),
      sentQty: s.qty, sentWeight: x.weight, sentTotal: s.wt,
      pendingQty: Number(x.quantity || 0) - s.qty,
      hasDispatch: s.qty > 0
    };
  });
  // coalesce duplicates
  var byKey = {}, merged = [];
  out.forEach(function(x){
    var k = normArt(x.artNo);
    if (!byKey[k]) { byKey[k] = x; merged.push(x); }
    else {
      byKey[k].orderQty += x.orderQty;
      byKey[k].orderTotal += x.orderTotal;
      byKey[k].sentQty += x.sentQty;
      byKey[k].sentTotal += x.sentTotal;
      byKey[k].pendingQty += x.pendingQty;
    }
  });
  return merged;
}

function openOrder(id){
  var found = findScopedOrder(id); currentOrder = found;
  if (!currentOrder){ alert('Order not found (or out of scope).'); return; }
  var o = currentOrder;
  var dispatchedInfo = getDispatchedInfo(o.id);
  var merged = mergeDispatchedItems(o, dispatchedInfo);
  var sent = getSentTotalsForOrder(o);
  var sentQtyTotal = merged.reduce(function(s,m){ return s + Number(m.sentQty||0); }, 0);
  var sentWtTotal  = merged.reduce(function(s,m){ return s + Number(m.sentTotal||0); }, 0);
  var orderQtyTotal= merged.reduce(function(s,m){ return s + Number(m.orderQty||0); }, 0);
  var orderWtTotal = merged.reduce(function(s,m){ return s + Number(m.orderTotal||0); }, 0);
  var pendingByArt = getPendingByArtForOrder(o);
  var pendingQtyTotal = pendingByArt.reduce(function(s,x){ return s + x.pendingQty; }, 0);
  var pendingWtTotal  = pendingByArt.reduce(function(s,x){ return s + x.pendingWt; }, 0);

  var statusBadge = '';
  if (sent.sentQty > 0) {
    statusBadge = pendingQtyTotal > 0
      ? ' <span class="badge partial" style="font-size:12px;padding:3px 10px;margin-left:8px">PARTIALLY DISPATCHED</span>'
      : ' <span class="badge full" style="font-size:12px;padding:3px 10px;margin-left:8px">DISPATCHED</span>';
  }
  var priorityBadge = o.priority
    ? ' <span class="priority-badge" style="font-size:12px;padding:3px 10px;margin-left:8px">★ PRIORITY</span>'
    : '';

  var html = '<h2 style="color:#8c004c;margin-bottom:10px">ORDER '+escapeHtml(o.orderNo||'—') + statusBadge + priorityBadge + '</h2>';
  if (sent.sentQty > 0){
    html += '<div style="background:linear-gradient(135deg,#8c004c,#920553);color:#fff;padding:14px 16px;border-radius:10px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:18px;align-items:center">'
         +    '<div style="font-size:14px;font-weight:800"><i class="fas fa-truck"></i> SENT TO HO</div>'
         +    '<div style="font-size:12px">Order Qty: <b>'+formatNumber(orderQtyTotal)+'</b> → <b>Sent: '+formatNumber(sentQtyTotal)+'</b> · Pending: <b>'+formatNumber(pendingQtyTotal)+'</b></div>'
         +    '<div style="font-size:12px">Order Wt: <b>'+formatNumber2(orderWtTotal)+' g</b> → <b>Sent: '+formatNumber2(sentWtTotal)+' g</b></div></div>';
  }
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:13px">'
       +    '<div><b>Workshop:</b> '+escapeHtml(formatBranchDisplayName(o.workshop||'—'))+'</div>'
       +    '<div><b>Group:</b> '+escapeHtml(o.productGroup||'—')+'</div>'
       +    '<div><b>Order Date:</b> '+formatDate(o.orderDate)+'</div>'
       +    '<div><b>Approx Delivery:</b> '+formatDate(o.deliveryDate)+'</div>'
       +    '<div><b>Touch:</b> '+escapeHtml(o.touch||'—')+'</div>'
       +    '<div><b>Estimation No.:</b> '+escapeHtml(o.estimateNo||'—')+'</div>'
       +    '<div style="grid-column:1/-1"><b>Note:</b> '+escapeHtml(o.note||'—')+'</div></div>';
  document.getElementById('orderModalContent').innerHTML = html;

  var curStage = getCurrentStage(o.id);
  var curIdx = STAGES.indexOf(curStage);
  var flowHtml = STAGES.map(function(s,i){
    var cls = i < curIdx ? 'done' : (i === curIdx ? 'active' : '');
    var icon = i < curIdx ? 'fa-check-circle' : (i === curIdx ? 'fa-dot-circle' : 'fa-circle');
    return '<div class="stage '+cls+'"><i class="fas '+icon+'"></i> '+STAGE_LABELS[s]+'</div>';
  }).join('<i class="fas fa-chevron-right" style="color:#c6cbd3"></i>');
  if (sent.sentQty > 0) flowHtml += '<i class="fas fa-chevron-right" style="color:#c6cbd3"></i><div class="stage done"><i class="fas fa-truck"></i> Dispatched</div>';
  document.getElementById('stageFlow').innerHTML = flowHtml;

  var tl = getOrderTimeline(o.id);
  var trackHtml = '<h3 style="color:#8c004c;font-size:14px;margin:18px 0 8px"><i class="fas fa-route"></i> Order Tracking</h3>'
                + '<table class="track-table"><thead><tr><th>STAGE</th><th>DATE &amp; TIME</th><th>FORWARDED BY</th></tr></thead><tbody>'
                + trackRow('Order Received', tl.NEW)
                + trackRow('Forward to Wax Section', tl.WAX)
                + trackRow('Forward to Casting Section', tl.CASTING)
                + trackRow('Forward to Filing Section', tl.FILING)
                + trackRow('Send to Head Office', tl.HO)
                + '</tbody></table>';
  document.getElementById('trackBox').innerHTML = trackHtml;

  /* ---- CONDITIONAL: Hide Sent/Pending columns until dispatch occurs ---- */
  var hasDispatch = sent.sentQty > 0;
  var itemsHtml = '<h3 style="color:#8c004c;font-size:14px;margin:18px 0 8px"><i class="fas fa-list"></i> Order Items</h3>';
  itemsHtml += '<div style="overflow:auto"><table><thead><tr>';
  itemsHtml += '<th>SL</th><th>ART NO.</th><th>NAME</th><th>SIZE</th><th>ORDER QTY</th><th>ORDER WT (g)</th>';
  
  if (hasDispatch){
    itemsHtml += '<th style="background:#e0c7c7;color:#8c004c">SENT QTY</th>'
              +  '<th style="background:#ffebee;color:#b3261e">PENDING QTY</th>'
              +  '<th style="background:#e0c7c7;color:#8c004c">SENT WT (g)</th>'
              +  '<th style="background:#ffebee;color:#b3261e">PENDING WT (g)</th>';
  }
  itemsHtml += '<th>IMAGE</th></tr></thead><tbody>';

  merged.forEach(function(x, i){
    var imgHtml = x.image ? '<img src="'+escapeAttr(x.image)+'" class="item-img" alt="" onerror="this.style.display=\'none\'">' : '<span style="color:#999;font-size:11px">No image</span>';
    var pend = x.pendingQty;
    
    itemsHtml += '<tr class="'+(x.sentQty > 0 ? 'dispatched-item' : '')+'">'
              +   '<td>'+(i+1)+'</td><td>'+escapeHtml(x.artNo)+'</td>'
              +   '<td style="text-align:left">'+escapeHtml(x.name)+'</td>'
              +   '<td>'+escapeHtml(x.heightInch||'—')+'</td>'
              +   '<td>'+formatNumber(x.orderQty)+'</td>'
              +   '<td>'+formatNumber2(x.orderTotal)+'</td>';
              
    if (hasDispatch){
      itemsHtml += '<td class="disp-highlight">'+formatNumber(x.sentQty)+'</td>'
                +  '<td class="pending-qty'+(pend<=0?' none':'')+'">'+formatNumber(pend)+'</td>'
                +  '<td class="disp-highlight">'+formatNumber2(x.sentTotal)+'</td>'
                +  '<td class="pending-wt">'+formatNumber2(pend * (x.orderWeight||0))+'</td>';
    }
    
    itemsHtml += '<td>'+imgHtml+'</td></tr>';
  });
  
  itemsHtml += '</tbody><tfoot><tr class="disp-total-row">'
            +    '<td colspan="4" style="text-align:right">TOTALS:</td>'
            +    '<td>'+formatNumber(orderQtyTotal)+'</td><td>'+formatNumber2(orderWtTotal)+'</td>';
            
  if (hasDispatch){
    itemsHtml += '<td>'+formatNumber(sentQtyTotal)+'</td><td>'+formatNumber(pendingQtyTotal)+'</td>'
              +  '<td>'+formatNumber2(sentWtTotal)+'</td><td>'+formatNumber2(pendingWtTotal)+'</td>';
  }
  
  itemsHtml += '<td></td></tr></tfoot></table></div>';
  document.getElementById('orderItemsBox').innerHTML = itemsHtml;

  var btn = document.getElementById('forwardStageBtn');
  var nxt = nextStage(curStage);
  if (nxt) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-arrow-right"></i> Forward to '+STAGE_LABELS[nxt];
    btn.dataset.next = nxt;
  } else {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-check"></i> Ready to Dispatch — use "Orders to Dispatch"';
    btn.dataset.next = '';
  }
  document.getElementById('stageMessage').classList.remove('show');
  document.getElementById('orderModal').classList.remove('hidden');
}
function trackRow(label, entry){
  var dateCell = entry && entry.date ? '<td class="date">'+formatDateTime(entry.date)+'</td>' : '<td class="pending">Pending</td>';
  var byCell = entry && entry.date && entry.by && entry.by !== 'auto' ? '<td>'+escapeHtml(entry.by)+'</td>' : '<td style="color:#999">—</td>';
  return '<tr><td><b>'+label+'</b></td>'+dateCell+byCell+'</tr>';
}
function closeOrderModal(){ document.getElementById('orderModal').classList.add('hidden'); currentOrder = null; }

function forwardCurrentOrder(){
  if (!currentOrder) return;
  var nxt = document.getElementById('forwardStageBtn').dataset.next;
  if (!nxt) return;
  if (!confirm('Forward order '+currentOrder.orderNo+' to '+STAGE_LABELS[nxt]+'?\n\nDate: '+new Date().toLocaleString())) return;
  setOrderStage(currentOrder.id, nxt);
  var sm = document.getElementById('stageMessage');
  sm.textContent = 'Forwarded to '+STAGE_LABELS[nxt]+' on '+new Date().toLocaleString()+'.';
  sm.classList.add('show');
  setTimeout(function(){ closeOrderModal(); renderStats(); renderOrders(); }, 1000);
}

/* ============================================================
   IMAGE LOADER
   ============================================================ */
var _IMG_CACHE = {};
function loadImageData(src){
  if (!src) return Promise.resolve(null);
  if (_IMG_CACHE[src] !== undefined) return Promise.resolve(_IMG_CACHE[src]);
  if (src.indexOf('data:image/') === 0) {
    var m = src.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!m) { _IMG_CACHE[src]=null; return Promise.resolve(null); }
    var ext = (m[1]==='jpeg'||m[1]==='jpg')?'jpeg':'png';
    var r = { dataUrl:src, rawBase64:m[2], extension:ext, format: ext==='png'?'PNG':'JPEG' };
    _IMG_CACHE[src]=r; return Promise.resolve(r);
  }
  return new Promise(function(resolve){
    var img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin='anonymous';
    var done = false;
    function finish(v){ if(done) return; done=true; _IMG_CACHE[src]=v; resolve(v); }
    var timer = setTimeout(function(){ finish(null); }, 5000);
    img.onload = function(){
      clearTimeout(timer);
      try {
        var w = img.naturalWidth || 100, h = img.naturalHeight || 100;
        var c = document.createElement('canvas'); c.width=w; c.height=h;
        var ctx = c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
        var dataUrl = c.toDataURL('image/jpeg', 0.85);
        finish({ dataUrl:dataUrl, rawBase64:dataUrl.split(',')[1], extension:'jpeg', format:'JPEG' });
      } catch(e){ finish(null); }
    };
    img.onerror = function(){ clearTimeout(timer); finish(null); };
    img.src = src;
  });
}

/* ============================================================
   ORDER PDF / EXCEL
   ============================================================ */
async function downloadOrderPDF(order){
  if (!order) return;
  if (!window.jspdf){ alert('PDF library not loaded.'); return; }
  try {
    var tl = getOrderTimeline(order.id);
    var dispatchedInfo = getDispatchedInfo(order.id);
    var merged = mergeDispatchedItems(order, dispatchedInfo);
    var sent = getSentTotalsForOrder(order);
    var pendingByArt = getPendingByArtForOrder(order);
    var pendingQtyTotal = pendingByArt.reduce(function(s,x){ return s + x.pendingQty; }, 0);
    var pendingWtTotal  = pendingByArt.reduce(function(s,x){ return s + x.pendingWt; }, 0);
    var isPartial = sent.sentQty > 0 && pendingQtyTotal > 0;
    var isFull    = sent.sentQty > 0 && pendingQtyTotal <= 0;

    var doc = new window.jspdf.jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    doc.setFontSize(16); doc.setTextColor(140,0,76);
    doc.text('GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD', 14, 15);
    doc.setTextColor(0,0,0); doc.setFontSize(12);
    var title = isPartial ? 'ORDER FORM — PARTIALLY DISPATCHED' : (isFull ? 'ORDER FORM — DISPATCHED' : 'ORDER FORM');
    doc.text(title, 14, 23);
    doc.setFontSize(9);
    var left = [['Order No.',order.orderNo||'-'],['Workshop',formatBranchDisplayName(order.workshop)||'-'],['Product Group',order.productGroup||'-'],['Order Date',formatDate(order.orderDate)]];
    var right = [['Approx Delivery',formatDate(order.deliveryDate)],['Touch',order.touch||'-'],['Estimation No.',order.estimateNo||'-'],['Note',order.note||'-']];
    var y = 31;
    left.forEach(function(r){ doc.setFont(undefined,'bold'); doc.text(r[0]+':',14,y); doc.setFont(undefined,'normal'); doc.text(String(r[1]),48,y); y+=6; });
    y = 31;
    right.forEach(function(r){ doc.setFont(undefined,'bold'); doc.text(r[0]+':',115,y); doc.setFont(undefined,'normal'); doc.text(String(r[1]),150,y); y+=6; });

    var items = Array.isArray(order.items) ? order.items : [];
    var images = await Promise.all(items.map(function(x){ return loadImageData(x.image); }));
    var headRow = ['SL','ART NO.','PRODUCT NAME','SIZE','ORD QTY','SENT QTY','PENDING','SENT WT(g)','PENDING WT(g)','IMAGE'];
    var bodyRows = merged.map(function(x, i){
      return [i+1, x.artNo, x.name, x.heightInch||'-',
              formatNumber(x.orderQty), formatNumber(x.sentQty), formatNumber(x.pendingQty),
              formatNumber2(x.sentTotal), formatNumber2(x.pendingQty * (x.orderWeight||0)), ''];
    });
    var sQ = merged.reduce(function(s,m){ return s + Number(m.sentQty||0); }, 0);
    var sW = merged.reduce(function(s,m){ return s + Number(m.sentTotal||0); }, 0);
    var footRow = ['','','','','TOTAL', formatNumber(sQ), formatNumber(pendingQtyTotal), formatNumber2(sW), formatNumber2(pendingWtTotal), ''];
    var colStyles = { 0:{cellWidth:7,halign:'center'}, 1:{cellWidth:14,halign:'center'}, 2:{cellWidth:34}, 3:{cellWidth:12,halign:'center'}, 4:{cellWidth:12,halign:'right'}, 5:{cellWidth:12,halign:'right'}, 6:{cellWidth:12,halign:'right'}, 7:{cellWidth:16,halign:'right'}, 8:{cellWidth:18,halign:'right'}, 9:{cellWidth:16,halign:'center'} };

    doc.autoTable({
      startY: 68, head:[headRow], body:bodyRows, foot:[footRow],
      styles:{ fontSize:7, cellPadding:1.5, minCellHeight:20, valign:'middle' },
      headStyles:{ fillColor:[140,0,76], textColor:[255,255,255], fontStyle:'bold' },
      footStyles:{ fillColor:[224,199,199], textColor:[140,0,76], fontStyle:'bold' },
      columnStyles: colStyles, theme:'grid', margin:{left:14,right:14}
    });
    var table = doc.lastAutoTable;
    for (var i=0;i<images.length;i++){
      var im = images[i]; if (!im || !im.dataUrl) continue;
      var cell = table.body[i] && table.body[i].cells && table.body[i].cells[headRow.length-1];
      if (!cell) continue;
      try { doc.addImage(im.dataUrl, im.format, cell.x+1.5, cell.y+1.5, cell.width-3, cell.height-3, undefined, 'FAST'); } catch(e){}
    }
    var afterY = (doc.lastAutoTable.finalY || 72) + 8;
    doc.setFontSize(11); doc.setTextColor(140,0,76); doc.text('ORDER TRACKING', 14, afterY);
    doc.setTextColor(0,0,0); doc.setFontSize(9);
    var trackRows = [
      ['Order Received', tl.NEW.date ? formatDateTime(tl.NEW.date) : 'Pending'],
      ['Forward to Wax Section', tl.WAX.date ? formatDateTime(tl.WAX.date) : 'Pending'],
      ['Forward to Casting Section', tl.CASTING.date ? formatDateTime(tl.CASTING.date) : 'Pending'],
      ['Forward to Filing Section', tl.FILING.date ? formatDateTime(tl.FILING.date) : 'Pending'],
      ['Send to Head Office', tl.HO.date ? formatDateTime(tl.HO.date) : 'Pending']
    ];
    doc.autoTable({ startY: afterY + 4, head:[['Stage','Date & Time']], body:trackRows,
      styles:{ fontSize:9, cellPadding:2 },
      headStyles:{ fillColor:[224,199,199], textColor:[140,0,76], fontStyle:'bold' },
      columnStyles:{ 0:{cellWidth:80}, 1:{cellWidth:100} }, theme:'grid', margin:{left:14,right:14} });
    var suffix = isPartial ? '_Partial' : (isFull ? '_Dispatched' : '');
    doc.save('Order_'+safeFilePart(order.orderNo)+suffix+'.pdf');
  } catch(err){ console.error(err); alert('Could not generate PDF: '+err.message); }
}

async function downloadOrderExcel(order){
  if (!order) return;
  if (!window.ExcelJS){ alert('Excel library not loaded.'); return; }
  try {
    var tl = getOrderTimeline(order.id);
    var dispatchedInfo = getDispatchedInfo(order.id);
    var merged = mergeDispatchedItems(order, dispatchedInfo);
    var sent = getSentTotalsForOrder(order);
    var pendingByArt = getPendingByArtForOrder(order);
    var pendingQtyTotal = pendingByArt.reduce(function(s,x){ return s + x.pendingQty; }, 0);
    var pendingWtTotal  = pendingByArt.reduce(function(s,x){ return s + x.pendingWt; }, 0);
    var isPartial = sent.sentQty > 0 && pendingQtyTotal > 0;
    var isFull    = sent.sentQty > 0 && pendingQtyTotal <= 0;

    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('Order');
    var items = Array.isArray(order.items) ? order.items : [];
    var images = await Promise.all(items.map(function(x){ return loadImageData(x.image); }));
    var imageTasks = [];

    ws.columns = [
      {header:'SL',width:6},{header:'ART NO.',width:14},{header:'PRODUCT NAME',width:28},
      {header:'SIZE',width:12},{header:'ORDER QTY',width:10},{header:'ORDER WT(g)',width:12},
      {header:'ORDER TOTAL',width:14},{header:'SENT QTY',width:10},{header:'SENT WT(g)',width:12},
      {header:'SENT TOTAL',width:14},{header:'PENDING QTY',width:12},{header:'PENDING WT(g)',width:14},{header:'IMAGE',width:14}
    ];
    ws.mergeCells('A1:M1'); ws.getCell('A1').value = 'GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD';
    ws.getCell('A1').font = { bold:true, size:15, color:{argb:'FF8C004C'} }; ws.getCell('A1').alignment = { horizontal:'center' };
    ws.getRow(1).height = 26;
    ws.mergeCells('A2:M2'); ws.getCell('A2').value = 'ORDER '+order.orderNo+' — '+(isPartial?'PARTIALLY DISPATCHED':(isFull?'DISPATCHED':'PENDING DISPATCH'))+'   |   Branch: '+formatBranchDisplayName(order.workshop);
    ws.getCell('A2').font = { bold:true, size:11 }; ws.getCell('A2').alignment = { horizontal:'center' };
    ws.getRow(2).height = 20; ws.addRow([]);
    var hr = ws.addRow(['SL','ART NO.','PRODUCT NAME','SIZE','ORDER QTY','ORDER WT(g)','ORDER TOTAL','SENT QTY','SENT WT(g)','SENT TOTAL','PENDING QTY','PENDING WT(g)','IMAGE']);
    hr.font = { bold:true, color:{argb:'FFFFFFFF'} }; hr.height = 22;
    hr.eachCell(function(c){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8C004C'}}; c.alignment={horizontal:'center',vertical:'middle',wrapText:true}; c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; });
    var sQ=0, sW=0;
    for (var i=0;i<merged.length;i++){
      var x = merged[i]; sQ += Number(x.sentQty||0); sW += Number(x.sentTotal||0);
      var pend = x.pendingQty;
      var pendWt = pend * (x.orderWeight||0);
      var row = ws.addRow([i+1,x.artNo,x.name,x.heightInch||'-',Number(x.orderQty||0),Number(x.orderWeight||0),Number(x.orderTotal||0),Number(x.sentQty||0),Number(x.sentWeight||0),Number(x.sentTotal||0),pend,pendWt,'']);
      row.height = 55;
      row.eachCell(function(c){ c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; });
      [1,2,4,5,6,7,8,9,10,11,12].forEach(function(col){ row.getCell(col).alignment={horizontal:'center',vertical:'middle'}; });
      [8,9,10].forEach(function(col){ var cell=row.getCell(col); cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7E6EE'}}; cell.font={bold:true,color:{argb:'FF8C004C'}}; });
      if (pend>0){ var pCell=row.getCell(11); pCell.font={bold:true,color:{argb:'FFB3261E'}}; pCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFEBEE'}};
                   var pwCell=row.getCell(12); pwCell.font={bold:true,color:{argb:'FFB3261E'}}; pwCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFEBEE'}}; }
      if (images[i] && images[i].rawBase64) imageTasks.push({rowNumber:row.number, image:images[i]});
    }
    var tr = ws.addRow(['','','','','','','',Number(sQ),'',Number(sW),pendingQtyTotal,pendingWtTotal,'']);
    tr.font={bold:true}; tr.height=22;
    tr.eachCell(function(c){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE0C7C7'}}; c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; c.alignment={horizontal:'center',vertical:'middle'}; });

    for (var k=0;k<imageTasks.length;k++){
      try {
        var task = imageTasks[k];
        var imgId = wb.addImage({ base64: task.image.rawBase64, extension: task.image.extension });
        ws.addImage(imgId, { tl: { col: 12, row: task.rowNumber - 1 }, ext: { width: 50, height: 50 }, editAs: 'oneCell' });
      } catch(e){}
    }
    var buf = await wb.xlsx.writeBuffer();
    var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url;
    var suffix2 = isPartial ? '_Partial' : (isFull ? '_Dispatched' : '');
    a.download = 'Order_'+safeFilePart(order.orderNo)+suffix2+'.xlsx';
    a.click(); setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
  } catch(err){ console.error(err); alert('Could not generate Excel: '+err.message); }
}

/* ============================================================
   ORDERS-TO-DISPATCH — ORDER-WISE + PARTIAL SENDING
   ============================================================ */

var stockState = {
  orders: [],
  byOrderId: {},
  expandedPending: {}   // orderId -> true if pending details are shown
};

function openStockModal(){
  var modal = document.getElementById('stockModal');
  if (!modal){ console.warn('[gpwork-shop] stockModal not found in DOM.'); return; }

  var processing = getProcessingOrders();
  /* Only HO-stage orders are ready for dispatch */
  var eligible = processing.filter(function(o){ return getCurrentStage(o.id) === 'HO'; });

  var ordersState = [];
  eligible.forEach(function(o){
    var pendingByArt = getPendingByArtForOrder(o);
    var items = [];
    var totOrderQty = 0, totAlreadySent = 0, totPending = 0, totPendingWt = 0;
    pendingByArt.forEach(function(pa){
      if (pa.pendingQty <= 0) return; // fully sent already
      var weight = pa.weight;
      totOrderQty += pa.orderQty;
      totAlreadySent += pa.sentQty;
      totPending += pa.pendingQty;
      totPendingWt += pa.pendingWt;
      items.push({
        artNo: pa.artNo,
        name: pa.name,
        heightInch: pa.heightInch,
        orderQty: pa.orderQty,
        alreadySent: pa.sentQty,
        pending: pa.pendingQty,
        weight: weight,
        sendQty: pa.pendingQty,           // default: send full pending
        sendWt: weight,
        rowTotal: weight * pa.pendingQty
      });
    });
    if (!items.length) return; // nothing left to send

    ordersState.push({
      order: o,
      items: items,
      pendingAll: pendingByArt,
      totals: {
        orderQty: totOrderQty,
        alreadySent: totAlreadySent,
        pending: totPending,
        pendingWt: totPendingWt,
        sendQty: items.reduce(function(s,x){ return s + x.sendQty; }, 0),
        sendWt: items.reduce(function(s,x){ return s + x.rowTotal; }, 0)
      }
    });
  });

  stockState.orders = ordersState;
  stockState.byOrderId = {};
  ordersState.forEach(function(rec){ stockState.byOrderId[rec.order.id] = rec; });

  renderStockModal();
  modal.classList.remove('hidden');
}

function closeStockModal(){
  var m = document.getElementById('stockModal'); if (m) m.classList.add('hidden');
  var msg = document.getElementById('stockMessage'); if (msg) msg.classList.remove('show');
}

function renderStockModal(){
  var body = document.getElementById('stockBody'); if (!body) return;
  var orders = stockState.orders || [];

  if (!orders.length){
    body.innerHTML =
      '<tr><td colspan="10" class="empty-list" style="padding:26px;text-align:center">'
      + 'No stock is pending dispatch.<br>'
      + '<small style="color:#6c7480;font-style:normal;display:inline-block;margin-top:8px">'
      + 'Forward an order through Wax → Casting → Filing → <b>HO</b> to make it available here.'
      + '</small></td></tr>';
    updateStockGrandTotals();
    return;
  }

  var html = '';
  orders.forEach(function(rec, oi){
    var o = rec.order;
    var t = rec.totals;
    var expanded = !!stockState.expandedPending[o.id];

    /* ----- Order header ----- */
    html += '<tr class="order-group-header" data-order-header="' + escapeAttr(o.id) + '">'
         +    '<td colspan="10" style="padding:0">'
         +      '<div class="stock-order-head">'
         +        '<div class="soh-left">'
         +          '<span class="soh-no"><i class="fas fa-file-invoice"></i> ORDER ' + escapeHtml(o.orderNo || '—') + '</span>'
         +          '<span class="soh-meta">' + escapeHtml(o.partyName || '—') + ' · Est ' + escapeHtml(o.estimateNo || '—') + ' · ' + escapeHtml(o.productGroup || '') + ' · ' + escapeHtml(o.touch || '') + '</span>'
         +        '</div>'
         +        '<div class="soh-right">'
         +          '<span class="soh-chip">Pending Qty <b>' + formatNumber(t.pending) + '</b></span>'
         +          '<span class="soh-chip">Pending Wt <b>' + formatNumber2(t.pendingWt) + ' g</b></span>'
         +          '<button type="button" class="btn secondary soh-pending-btn" data-toggle-pending="' + escapeAttr(o.id) + '">'
         +            '<i class="fas fa-' + (expanded ? 'chevron-up' : 'list') + '"></i> ' + (expanded ? 'HIDE PENDING' : 'PENDING DETAILS')
         +          '</button>'
         +          '<button type="button" class="btn soh-clear-btn" data-clear-order="' + escapeAttr(o.id) + '" title="Stop showing this order in pending list">'
         +            '<i class="fas fa-times-circle"></i> CLEAR ORDER'
         +          '</button>'
         +          '<button type="button" class="btn primary soh-send-btn" data-send-order="' + escapeAttr(o.id) + '">'
         +            '<i class="fas fa-paper-plane"></i> SEND THIS ORDER'
         +          '</button>'
         +        '</div>'
         +      '</div>'
         +    '</td>'
         + '</tr>';

    /* ----- Pending details panel (expandable) ----- */
    if (expanded && rec.pendingAll && rec.pendingAll.length){
      html += '<tr class="stock-pending-row" data-order-pending="' + escapeAttr(o.id) + '">'
           +    '<td colspan="10" style="padding:0">'
           +      '<div class="stock-pending-panel">'
           +        '<div class="spp-title"><i class="fas fa-hourglass-half"></i> PENDING DETAILS — ORDER ' + escapeHtml(o.orderNo || '—') + '</div>'
           +        '<table class="spp-table"><thead><tr>'
           +          '<th>ART NO.</th><th>NAME</th><th>SIZE</th>'
           +          '<th>ORDER QTY</th><th>SENT QTY</th><th>PENDING QTY</th>'
           +          '<th>WT (g)</th><th>PENDING WT (g)</th>'
           +        '</tr></thead><tbody>';
      rec.pendingAll.forEach(function(pa){
        var cls = pa.pendingQty > 0 ? 'pending-qty' : 'pending-qty none';
        html += '<tr>'
             +    '<td><b>' + escapeHtml(pa.artNo) + '</b></td>'
             +    '<td style="text-align:left">' + escapeHtml(pa.name) + '</td>'
             +    '<td>' + escapeHtml(pa.heightInch || '—') + '</td>'
             +    '<td>' + formatNumber(pa.orderQty) + '</td>'
             +    '<td style="color:#8c004c;font-weight:700">' + formatNumber(pa.sentQty) + '</td>'
             +    '<td class="' + cls + '">' + formatNumber(pa.pendingQty) + '</td>'
             +    '<td>' + formatNumber2(pa.weight) + '</td>'
             +    '<td class="pending-wt">' + formatNumber2(pa.pendingWt) + '</td>'
             +  '</tr>';
      });
      html += '</tbody></table></div></td></tr>';
    }

    /* ----- Item rows ----- */
    rec.items.forEach(function(it){
      html += '<tr class="stock-item-row" data-order="' + escapeAttr(o.id) + '" data-art="' + escapeAttr(it.artNo) + '">'
           +    '<td style="text-align:left"><b>' + escapeHtml(it.artNo) + '</b></td>'
           +    '<td style="text-align:left">' + escapeHtml(it.name) + '</td>'
           +    '<td>' + escapeHtml(o.productGroup || '') + '</td>'
           +    '<td>' + escapeHtml(o.touch || '') + '</td>'
           +    '<td>' + formatNumber(it.orderQty) + '</td>'
           +    '<td style="color:#8c004c;font-weight:700">' + formatNumber(it.alreadySent) + '</td>'
           +    '<td class="pending-qty">' + formatNumber(it.pending) + '</td>'
           // REMOVED max="' + it.pending + '" to allow over-sending
           +    '<td><input type="number" class="stock-input stock-qty" min="0" step="1" value="' + it.sendQty + '" data-order="' + escapeAttr(o.id) + '" data-art="' + escapeAttr(it.artNo) + '"></td>'
           +    '<td><input type="number" class="stock-input weight-input" min="0" step="0.01" value="' + it.weight + '" data-order="' + escapeAttr(o.id) + '" data-art="' + escapeAttr(it.artNo) + '"></td>'
           +    '<td><input type="number" class="stock-input totalWt-input" min="0" step="0.01" value="' + (it.rowTotal).toFixed(2) + '" data-order="' + escapeAttr(o.id) + '" data-art="' + escapeAttr(it.artNo) + '"></td>'
           +  '</tr>';
    });

    /* ----- Per-order subtotal row ----- */
    html += '<tr class="stock-subtotal-row" data-order-subtotal="' + escapeAttr(o.id) + '">'
         +    '<td colspan="4" style="text-align:right"><b>ORDER TOTAL (this lot)</b></td>'
         +    '<td>' + formatNumber(t.orderQty) + '</td>'
         +    '<td style="color:#8c004c">' + formatNumber(t.alreadySent) + '</td>'
         +    '<td class="pending-qty">' + formatNumber(t.pending) + '</td>'
         +    '<td class="so-send-qty">' + formatNumber(t.sendQty) + '</td>'
         +    '<td></td>'
         +    '<td class="so-send-wt">' + formatNumber2(t.sendWt) + '</td>'
         +  '</tr>';
  });

  body.innerHTML = html;
  wireStockInputs();
  updateStockGrandTotals();
}

function wireStockInputs(){
  var body = document.getElementById('stockBody'); if (!body) return;

  /* Send-qty inputs */
  body.querySelectorAll('.stock-qty').forEach(function(inp){
    inp.addEventListener('input', function(){
      var orderId = inp.dataset.order;
      var art = inp.dataset.art;
      var rec = stockState.byOrderId[orderId]; if (!rec) return;
      var it = rec.items.find(function(x){ return normArt(x.artNo) === normArt(art); });
      if (!it) return;
      
      var v = Math.max(0, Math.floor(Number(inp.value) || 0));
      // Allow any positive number, do not clamp to it.pending
      inp.value = v;
      
      // Visual cue for over-sending
      if (v > it.pending) inp.classList.add('over-send');
      else inp.classList.remove('over-send');

      it.sendQty = v;
      it.rowTotal = v * it.weight;
      var wtInp = body.querySelector('.totalWt-input[data-order="' + cssEsc(orderId) + '"][data-art="' + cssEsc(art) + '"]');
      if (wtInp) wtInp.value = it.rowTotal.toFixed(2);
      recalcOrderTotals(rec);
      updateOrderSubtotalRow(rec);
      updateStockGrandTotals();
    });
  });

  /* Weight override inputs */
  body.querySelectorAll('.weight-input').forEach(function(inp){
    inp.addEventListener('input', function(){
      var orderId = inp.dataset.order;
      var art = inp.dataset.art;
      var rec = stockState.byOrderId[orderId]; if (!rec) return;
      var it = rec.items.find(function(x){ return normArt(x.artNo) === normArt(art); });
      if (!it) return;
      var v = Math.max(0, Number(inp.value) || 0);
      it.weight = v;
      it.rowTotal = v * it.sendQty;
      var twInp = body.querySelector('.totalWt-input[data-order="' + cssEsc(orderId) + '"][data-art="' + cssEsc(art) + '"]');
      if (twInp) twInp.value = it.rowTotal.toFixed(2);
      recalcOrderTotals(rec);
      updateOrderSubtotalRow(rec);
      updateStockGrandTotals();
    });
  });

  /* Total-wt override inputs */
  body.querySelectorAll('.totalWt-input').forEach(function(inp){
    inp.addEventListener('input', function(){
      var orderId = inp.dataset.order;
      var art = inp.dataset.art;
      var rec = stockState.byOrderId[orderId]; if (!rec) return;
      var it = rec.items.find(function(x){ return normArt(x.artNo) === normArt(art); });
      if (!it) return;
      it.rowTotal = Math.max(0, Number(inp.value) || 0);
      recalcOrderTotals(rec);
      updateOrderSubtotalRow(rec);
      updateStockGrandTotals();
    });
  });

  /* Toggle pending details */
  body.querySelectorAll('[data-toggle-pending]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var orderId = btn.dataset.togglePending;
      stockState.expandedPending[orderId] = !stockState.expandedPending[orderId];
      renderStockModal();
    });
  });

  /* Per-order "SEND THIS ORDER" */
  body.querySelectorAll('[data-send-order]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var orderId = btn.dataset.sendOrder;
      sendOrderLot(orderId);
    });
  });

  /* Per-order "CLEAR ORDER" */
  body.querySelectorAll('[data-clear-order]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var orderId = btn.dataset.clearOrder;
      clearOrder(orderId);
    });
  });
}

function recalcOrderTotals(rec){
  rec.totals.sendQty = rec.items.reduce(function(s,x){ return s + Number(x.sendQty || 0); }, 0);
  rec.totals.sendWt  = rec.items.reduce(function(s,x){ return s + Number(x.rowTotal || 0); }, 0);
  rec.totals.pending = rec.items.reduce(function(s,x){ return s + Number(x.pending || 0); }, 0);
  rec.totals.pendingWt = rec.items.reduce(function(s,x){ return s + Number(x.pending || 0) * Number(x.weight || 0); }, 0);
}

function updateOrderSubtotalRow(rec){
  var tr = document.querySelector('[data-order-subtotal="' + cssEsc(rec.order.id) + '"]');
  if (!tr) return;
  var qEl = tr.querySelector('.so-send-qty'); if (qEl) qEl.textContent = formatNumber(rec.totals.sendQty);
  var wEl = tr.querySelector('.so-send-wt');  if (wEl) wEl.textContent = formatNumber2(rec.totals.sendWt);
}

function updateStockGrandTotals(){
  var tQ = 0, tW = 0;
  (stockState.orders || []).forEach(function(rec){
    tQ += Number(rec.totals.sendQty || 0);
    tW += Number(rec.totals.sendWt || 0);
  });
  var q = document.getElementById('stockTotalQty'); if (q) q.textContent = formatNumber(tQ);
  var w = document.getElementById('stockTotalWeight'); if (w) w.textContent = formatNumber2(tW);
}

function cssEsc(s){ return String(s).replace(/["\\]/g, '\\$&'); }

/* ---------- send helpers ---------- */

function showStockMsg(text){
  var m = document.getElementById('stockMessage');
  if (!m) return;
  m.textContent = text;
  m.classList.add('show');
  clearTimeout(showStockMsg._t);
  showStockMsg._t = setTimeout(function(){ m.classList.remove('show'); }, 5000);
}

/* === accumulate rowTotal instead of recomputing === */
function applyLotToCompleted(order, lotRows){
  if (!lotRows.length) return;
  var completed = getCompletedMap();
  var orderId = order.id;
  var entry = completed[orderId] || {
    orderId: orderId,
    completedAt: new Date().toISOString(),
    rows: [],
    lots: []
  };
  entry.rows = Array.isArray(entry.rows) ? entry.rows : [];
  entry.lots = Array.isArray(entry.lots) ? entry.lots : [];

  lotRows.forEach(function(lr){
    var key = normArt(lr.artNo);
    var existing = entry.rows.find(function(r){ return normArt(r.artNo) === key; });
    if (existing){
      existing.stockQty = Number(existing.stockQty || 0) + Number(lr.sentQty || 0);
      existing.weight   = Number(lr.weight || 0);
      existing.rowTotal = Number(existing.rowTotal || 0) + Number(lr.rowTotal || 0);
      existing.name     = lr.name;
      existing.orderQty = lr.orderQty;
    } else {
      entry.rows.push({
        artNo: lr.artNo,
        name: lr.name,
        orderQty: lr.orderQty,
        stockQty: lr.sentQty,
        weight: lr.weight,
        rowTotal: lr.rowTotal
      });
    }
  });

  var lotQty = lotRows.reduce(function(s,r){ return s + Number(r.sentQty || 0); }, 0);
  var lotWt  = lotRows.reduce(function(s,r){ return s + Number(r.rowTotal || 0); }, 0);
  var lot = {
    at: new Date().toISOString(),
    by: CURRENT_BRANCH || CURRENT_USER_LABEL,
    qty: lotQty,
    wt: lotWt,
    rows: lotRows.map(function(r){
      return {
        artNo: r.artNo,
        name: r.name,
        orderQty: r.orderQty,
        sentQty: r.sentQty,
        weight: r.weight,
        rowTotal: r.rowTotal,
        manualOverride: !!r.manualOverride
      };
    })
  };
  entry.lots.push(lot);
  entry.lastSentAt = lot.at;
  entry.completedAt = entry.completedAt || lot.at;

  completed[orderId] = entry;
  saveJSON(COMPLETED_KEY, completed);
}

function sendOrderLot(orderId){
  var rec = stockState.byOrderId[orderId];
  if (!rec) return;
  var rows = rec.items.filter(function(x){ return Number(x.sendQty) > 0; });
  if (!rows.length){ showStockMsg('⚠ Set Send Qty > 0 for at least one item in this order.'); return; }

  var over = rows.filter(function(x){ return Number(x.sendQty) > Number(x.pending); });
  if (over.length){
    if (!confirm(
      'The following items exceed their pending qty:\n\n' +
      over.map(function(x){ return '  ' + x.artNo + ': send ' + x.sendQty + ' / pending ' + x.pending; }).join('\n') +
      '\n\nContinue anyway?'
    )) return;
  }

  var lotRows = rows.map(function(x){
    return {
      artNo: x.artNo,
      name: x.name,
      orderQty: x.orderQty,
      sentQty: Number(x.sendQty),
      weight: Number(x.sendWt != null ? x.sendWt : x.weight),
      rowTotal: Number(x.rowTotal),
      manualOverride: (Number(x.sendWt) !== Number(x.weight))
    };
  });

  if (!confirm(
    'Send stock for ORDER ' + (rec.order.orderNo || '—') + '?\n\n' +
    lotRows.map(function(r){ return '  ' + r.artNo + '  ' + r.sentQty + ' pcs  ' + formatNumber2(r.rowTotal) + ' g'; }).join('\n') +
    '\n\nTotal: ' + formatNumber(lotRows.reduce(function(s,r){ return s + r.sentQty; }, 0)) + ' pcs · ' +
    formatNumber2(lotRows.reduce(function(s,r){ return s + r.rowTotal; }, 0)) + ' g'
  )) return;

  applyLotToCompleted(rec.order, lotRows);
  showStockMsg('✅ Sent ' + rec.order.orderNo + ' lot: ' + lotRows.length + ' item(s).');

  setTimeout(function(){
    var modal = document.getElementById('stockModal');
    if (modal && !modal.classList.contains('hidden')) openStockModal();
    renderOrders(); renderStats();
  }, 250);
}

function clearOrder(orderId){
  var rec = stockState.byOrderId[orderId];
  if (!rec) return;
  var o = rec.order;
  var t = rec.totals;
  var msg = 'Clear ORDER ' + (o.orderNo||'—') + '?\n\n'
          + 'It will be hidden from "Orders to Dispatch".\n'
          + 'It will remain visible in "Orders Dispatched".\n\n'
          + (t.pending > 0
              ? '⚠ WARNING: ' + formatNumber(t.pending) + ' pcs / ' + formatNumber2(t.pendingWt) + ' g are STILL PENDING.\n'
              : '✓ All quantities have been sent.\n')
          + 'Continue?';
  if (!confirm(msg)) return;

  var completed = getCompletedMap();
  var entry = completed[orderId];
  if (!entry){
    entry = {
      orderId: orderId,
      completedAt: new Date().toISOString(),
      rows: [],
      lots: []
    };
  }
  entry.cleared = true;
  entry.clearedAt = new Date().toISOString();
  entry.clearedBy = CURRENT_BRANCH || CURRENT_USER_LABEL;
  entry.clearedQty = Number(entry.clearedQty || 0) + Number(t.pending || 0);
  completed[orderId] = entry;
  saveJSON(COMPLETED_KEY, completed);

  showStockMsg('✅ Order ' + (o.orderNo||'—') + ' cleared — removed from pending list.');
  setTimeout(function(){
    var modal = document.getElementById('stockModal');
    if (modal && !modal.classList.contains('hidden')) openStockModal();
    renderOrders(); renderStats();
  }, 250);
}

/* ============================================================
   NOTIFICATION / REMAINDER SYSTEM
   ============================================================ */
function getNotifLog(){ var a = _readJSON(NOTIF_LOG_KEY, []); return Array.isArray(a) ? a : []; }
function saveNotifLog(a){ saveJSON(NOTIF_LOG_KEY, a); }
function getSeenOrderIds(){ var a = _readJSON(SEEN_KEY, []); return Array.isArray(a) ? a : []; }
function saveSeenOrderIds(a){ saveJSON(SEEN_KEY, a); }

function getNewOrders(){
  var seen = getSeenOrderIds();
  var seenMap = {}; seen.forEach(function(id){ seenMap[id] = true; });
  return getProcessingOrders().filter(function(o){ return !seenMap[o.id]; });
}
function markAllSeen(){
  var seen = getSeenOrderIds();
  var seenMap = {}; seen.forEach(function(id){ seenMap[id] = true; });
  getProcessingOrders().forEach(function(o){ if (!seenMap[o.id]) { seen.push(o.id); seenMap[o.id] = true; } });
  saveSeenOrderIds(seen);
  refreshNotifBadge();
}
function refreshNotifBadge(){
  var badge = document.getElementById('notifBadge');
  var btn = document.getElementById('notifBtn');
  if (!badge) return;
  var fresh = getNewOrders();
  if (fresh.length > 0){
    badge.textContent = fresh.length > 99 ? '99+' : String(fresh.length);
    badge.classList.remove('hidden');
    if (btn) btn.classList.add('pulse');
  } else {
    badge.classList.add('hidden');
    if (btn) btn.classList.remove('pulse');
  }
}
function buildWhatsAppMessage(order){
  var lines = [];
  lines.push('*GOLDPRINCE — New Order*');
  lines.push('Order No: ' + (order.orderNo || '—'));
  lines.push('Estimation: ' + (order.estimateNo || '—'));
  lines.push('Group: ' + (order.productGroup || '—'));
  lines.push('Qty: ' + formatNumber(order.totalQty) + ' pcs');
  lines.push('Weight: ' + formatNumber2(order.totalWeight) + ' g');
  lines.push('Order Date: ' + formatDate(order.orderDate));
  if (order.deliveryDate) lines.push('Approx Delivery: ' + formatDate(order.deliveryDate));
  if (order.note) lines.push('Note: ' + order.note);
  if (order.priority) lines.push('★ PRIORITY ORDER');
  return lines.join('\n');
}
function renderNotifPanel(){
  var body = document.getElementById('notifBody'); if (!body) return;
  var fresh = getNewOrders();
  if (!fresh.length){
    body.innerHTML = '<div class="notif-empty">No new order notifications.</div>';
    return;
  }
  body.innerHTML = fresh.map(function(o){
    return '<div class="notif-item" data-nid="'+escapeAttr(o.id)+'">'
      + '<div class="ni-icon"><i class="fas fa-bell"></i></div>'
      + '<div class="ni-body">'
      +   '<div class="ni-title">Order ' + escapeHtml(o.orderNo || '—') + (o.priority ? ' <span class="priority-badge">PRIORITY</span>' : '') + '</div>'
      +   '<div class="ni-msg">' + escapeHtml(o.partyName || o.productGroup || '') + ' · '
      +     formatNumber(o.totalQty) + ' pcs · ' + formatNumber2(o.totalWeight) + ' g</div>'
      +   '<div class="ni-time">' + escapeHtml(o.workshop || '') + ' · ' + formatDate(o.orderDate) + '</div>'
      +   '<div class="ni-actions">'
      +     '<button class="wa-btn" data-wa="'+escapeAttr(o.id)+'"><i class="fab fa-whatsapp"></i> Send WhatsApp</button>'
      +     '<button class="view-btn" data-view-n="'+escapeAttr(o.id)+'"><i class="fas fa-eye"></i> View</button>'
      +   '</div>'
      + '</div></div>';
  }).join('');
  body.querySelectorAll('[data-wa]').forEach(function(b){
    b.addEventListener('click', function(){ openWhatsAppForOrder(b.dataset.wa); });
  });
  body.querySelectorAll('[data-view-n]').forEach(function(b){
    b.addEventListener('click', function(){
      toggleNotifPanel(false);
      openOrder(b.dataset.viewN);
    });
  });
}
function toggleNotifPanel(open){
  var panel = document.getElementById('notifPanel'); if (!panel) return;
  if (open === undefined) panel.classList.toggle('open');
  else if (open) panel.classList.add('open');
  else panel.classList.remove('open');
  if (panel.classList.contains('open')) renderNotifPanel();
}
function openWhatsAppForOrder(orderId){
  var o = findScopedOrder(orderId);
  if (!o) return;
  var msg = buildWhatsAppMessage(o);
  var phone = '';
  try {
    var parties = _readJSON('goldprince_parties', {}) || {};
    var p = parties[o.partyName] || {};
    phone = String(p.cell || p.cellNo || p.mobile || p.phone || '').replace(/[^0-9]/g, '');
  } catch(e){}
  var url = phone
    ? ('https://wa.me/' + (phone.length === 10 ? '91' + phone : phone) + '?text=' + encodeURIComponent(msg))
    : ('https://wa.me/?text=' + encodeURIComponent(msg));
  window.open(url, '_blank');
  var log = getNotifLog();
  log.push({ orderId: o.id, at: new Date().toISOString(), by: CURRENT_USER_LABEL });
  saveNotifLog(log);
  renderNotifPanel();
}

/* ============================================================
   COMPLETED MODAL — now with PENDING DETAILS column
   ============================================================ */
var completedFilters = { orderNo:'', group:'', from:'', to:'' };
var completedExpanded = {};
var completedPendingExpanded = {};

function openCompletedModal(){
  var el = document.getElementById('completedBranchName');
  if (el) el.textContent = SHOW_ALL_WORKSHOPS ? 'All Workshops' : (formatBranchDisplayName(CURRENT_BRANCH) || '(no branch)');
  injectCompletedFilters();
  renderCompleted();
  var m = document.getElementById('completedModal'); if (m) m.classList.remove('hidden');
}
function closeCompletedModal(){ var m = document.getElementById('completedModal'); if (m) m.classList.add('hidden'); }

function injectCompletedFilters(){
  var modal = document.getElementById('completedModal'); if (!modal) return;
  if (!document.getElementById('completedFilterBar')){
    var p = modal.querySelector('.modal-window > p');
    var filterBar = document.createElement('div');
    filterBar.id = 'completedFilterBar';
    filterBar.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;background:#faf4f7;border:1px solid #e0c7c7;border-radius:10px;padding:12px;margin-bottom:14px;font-size:12px';
    filterBar.innerHTML =
        '<label style="display:flex;flex-direction:column;gap:4px;font-weight:700;color:#8c004c">Order No.<input id="cfOrderNo" type="text" placeholder="Search order no..." style="padding:6px 8px;border:1.5px solid #c6cbd3;border-radius:6px;font-size:12px"></label>'
      + '<label style="display:flex;flex-direction:column;gap:4px;font-weight:700;color:#8c004c">Group<select id="cfGroup" style="padding:6px 8px;border:1.5px solid #c6cbd3;border-radius:6px;font-size:12px"><option value="">All Groups</option></select></label>'
      + '<label style="display:flex;flex-direction:column;gap:4px;font-weight:700;color:#8c004c">From Date<input id="cfFrom" type="date" style="padding:6px 8px;border:1.5px solid #c6cbd3;border-radius:6px;font-size:12px"></label>'
      + '<label style="display:flex;flex-direction:column;gap:4px;font-weight:700;color:#8c004c">To Date<input id="cfTo" type="date" style="padding:6px 8px;border:1.5px solid #c6cbd3;border-radius:6px;font-size:12px"></label>'
      + '<div style="display:flex;align-items:flex-end;gap:6px"><button class="btn" id="cfReset" style="padding:8px 14px"><i class="fas fa-undo"></i> Reset</button></div>'
      + '<div id="cfSummary" style="grid-column:1/-1;font-size:12px;color:#6c7480;background:#fff;border:1px dashed #e0c7c7;border-radius:6px;padding:8px 12px;text-align:center"></div>';
    if (p && p.parentNode) p.parentNode.insertBefore(filterBar, p.nextSibling);
    else modal.querySelector('.modal-window').insertBefore(filterBar, modal.querySelector('.table-wrap'));
    var fOrderNo = filterBar.querySelector('#cfOrderNo');
    var fGroup   = filterBar.querySelector('#cfGroup');
    var fFrom    = filterBar.querySelector('#cfFrom');
    var fTo      = filterBar.querySelector('#cfTo');
    var fReset   = filterBar.querySelector('#cfReset');
    function applyFilters(){
      completedFilters.orderNo = fOrderNo.value.trim();
      completedFilters.group   = fGroup.value;
      completedFilters.from    = fFrom.value;
      completedFilters.to      = fTo.value;
      renderCompleted();
    }
    fOrderNo.addEventListener('input', applyFilters);
    fGroup.addEventListener('change', applyFilters);
    fFrom.addEventListener('change', applyFilters);
    fTo.addEventListener('change', applyFilters);
    fReset.addEventListener('click', function(){
      fOrderNo.value=''; fGroup.value=''; fFrom.value=''; fTo.value='';
      completedFilters = { orderNo:'', group:'', from:'', to:'' };
      renderCompleted();
    });
  }
  var table = modal.querySelector('#completedBody') && modal.querySelector('#completedBody').closest('table');
  if (table && !table.querySelector('tfoot')){
    var tfoot = document.createElement('tfoot'); tfoot.id = 'completedTfoot';
    tfoot.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:10px;color:#999">No data</td></tr>';
    table.appendChild(tfoot);
  }
}

function filterCompletedList(list){
  var f = completedFilters;
  return list.filter(function(rec){
    var o = rec.order;
    if (f.orderNo){ if (String(o.orderNo||'').toLowerCase().indexOf(f.orderNo.toLowerCase()) === -1) return false; }
    if (f.group){ if (String(o.productGroup||'') !== f.group) return false; }
    if (f.from || f.to){
      var info = rec.info || {}; var dtStr = info.lastSentAt || info.completedAt || null;
      if (!dtStr) return false;
      var d = new Date(dtStr); if (isNaN(d)) return false;
      if (f.from){ var fromD = new Date(f.from+'T00:00:00'); if (d < fromD) return false; }
      if (f.to){ var toD = new Date(f.to+'T23:59:59'); if (d > toD) return false; }
    }
    return true;
  });
}

function renderCompleted(){
  var allList = getCompletedOrders();
  var groupSel = document.getElementById('cfGroup');
  if (groupSel){
    var groups = {};
    allList.forEach(function(rec){ var g = rec.order.productGroup || ''; if (g) groups[g] = true; });
    var current = groupSel.value;
    var opts = '<option value="">All Groups</option>';
    Object.keys(groups).sort().forEach(function(g){ opts += '<option value="'+escapeHtml(g)+'">'+escapeHtml(g)+'</option>'; });
    groupSel.innerHTML = opts;
    if (current && groups[current]) groupSel.value = current;
  }
  var list = filterCompletedList(allList);
  var tbody = document.getElementById('completedBody');
  var tfoot = document.getElementById('completedTfoot');
  if (!tbody) return;

  if (!allList.length){
    tbody.innerHTML = '<tr><td colspan="11" class="empty-list">No dispatched orders yet. Use "Orders to Dispatch" to send stock.</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    updateCompletedSummary(allList, list); return;
  }
  if (!list.length){
    tbody.innerHTML = '<tr><td colspan="11" class="empty-list">No dispatched orders match the current filters.</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    updateCompletedSummary(allList, list); return;
  }

  tbody.innerHTML = list.map(function(rec){
    var o = rec.order, info = rec.info;
    var lots = Array.isArray(info.lots) ? info.lots : [];
    var sent = getSentTotalsForOrder(o);
    var pendingByArt = getPendingByArtForOrder(o);
    var pendingTotal = pendingByArt.reduce(function(s,x){ return s + x.pendingQty; }, 0);
    var pendingWt = pendingByArt.reduce(function(s,x){ return s + x.pendingWt; }, 0);

    var lotChips = lots.length ? lots.map(function(l, i){
      return '<span style="display:inline-block;background:#fbf2f7;color:#8c004c;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin:1px">L'+(i+1)+': '+formatNumber(l.qty)+'pcs / '+formatNumber2(l.wt)+'g</span>';
    }).join(' ') : '<span style="color:#bbb">—</span>';
    var statusBadge = pendingTotal > 0 ? '<span class="badge partial" style="font-size:10px">PARTIAL</span>' : '<span class="badge full" style="font-size:10px">FULL</span>';
    var clearedBadge = info.cleared ? ' <span class="badge cleared" style="font-size:10px">CLEARED</span>' : '';
    var priorityBadge = o.priority ? ' <span class="priority-badge">PRIORITY</span>' : '';
    var lastSent = info.lastSentAt || info.completedAt || null;
    var expanded = !!completedPendingExpanded[o.id];
    var pendingBtn = '<button class="btn" data-toggle-pending-completed="'+escapeHtml(o.id)+'" style="padding:3px 8px;font-size:10px;margin-left:4px">'
                   + (expanded ? '▾ Hide Pending' : '▸ View Pending') + '</button>';

    var mainRow = '<tr>'
         +   '<td><b>'+escapeHtml(o.orderNo||'—')+'</b> '+statusBadge+clearedBadge+priorityBadge+'</td>'
         +   '<td>'+escapeHtml(o.productGroup||'—')+'</td>'
         +   '<td>'+formatNumber(sent.orderQty)+'</td>'
         +   '<td>'+formatNumber2(sent.orderWt)+'</td>'
         +   '<td><b style="color:#8c004c">'+formatNumber(sent.sentQty)+'</b></td>'
         +   '<td><b style="color:#8c004c">'+formatNumber2(sent.sentWt)+'</b></td>'
         +   '<td class="pending-qty'+(pendingTotal<=0?' none':'')+'">'+formatNumber(pendingTotal)+'</td>'
         +   '<td class="pending-wt" style="color:'+(pendingTotal<=0?'#137333':'#b3261e')+';font-weight:800">'+formatNumber2(pendingWt)+'</td>'
         +   '<td style="text-align:left">'+lotChips+'</td>'
         +   '<td>'+cellDate(lastSent)+'</td>'
         +   '<td>'+pendingBtn+'</td></tr>';

    var detailRow = '';
    if (expanded){
      var lines = pendingByArt.filter(function(x){ return x.pendingQty > 0; });
      if (!lines.length){
        detailRow = '<tr><td colspan="11" style="background:#f5fdf7;padding:14px;text-align:center;color:#137333;font-weight:800">'
                  + '<i class="fas fa-check-circle"></i> No pending qty — full order dispatched.'
                  + '</td></tr>';
      } else {
        detailRow = '<tr><td colspan="11" style="background:#fff7f7;padding:12px;text-align:left">'
                  + '<div style="font-size:11px;font-weight:800;color:#b3261e;margin-bottom:8px">'
                  +   '<i class="fas fa-hourglass-half"></i> PENDING DETAILS — ORDER '+escapeHtml(o.orderNo||'—')
                  + '</div>'
                  + '<table class="spp-table" style="width:100%"><thead><tr>'
                  +   '<th>ART NO.</th><th>NAME</th><th>SIZE</th>'
                  +   '<th>ORDER QTY</th><th>SENT QTY</th><th>PENDING QTY</th>'
                  +   '<th>WT (g)</th><th>PENDING WT (g)</th>'
                  + '</tr></thead><tbody>'
                  + lines.map(function(x){
                      return '<tr>'
                        + '<td><b>'+escapeHtml(x.artNo)+'</b></td>'
                        + '<td style="text-align:left">'+escapeHtml(x.name)+'</td>'
                        + '<td>'+escapeHtml(x.heightInch||'—')+'</td>'
                        + '<td>'+formatNumber(x.orderQty)+'</td>'
                        + '<td style="color:#8c004c;font-weight:700">'+formatNumber(x.sentQty)+'</td>'
                        + '<td class="pending-qty">'+formatNumber(x.pendingQty)+'</td>'
                        + '<td>'+formatNumber2(x.weight)+'</td>'
                        + '<td class="pending-wt">'+formatNumber2(x.pendingWt)+'</td>'
                        + '</tr>';
                    }).join('')
                  + '</tbody></table></td></tr>';
      }
    }
    return mainRow + detailRow;
  }).join('');

  var tot = { oQty:0, oWt:0, sQty:0, sWt:0, pQty:0, pWt:0, count:list.length };
  list.forEach(function(rec){
    var sent = getSentTotalsForOrder(rec.order);
    var pendingByArt = getPendingByArtForOrder(rec.order);
    var pendingQty = pendingByArt.reduce(function(s,x){ return s + x.pendingQty; }, 0);
    var pendingWt  = pendingByArt.reduce(function(s,x){ return s + x.pendingWt; }, 0);
    tot.oQty += sent.orderQty; tot.oWt += sent.orderWt;
    tot.sQty += sent.sentQty; tot.sWt += sent.sentWt;
    tot.pQty += pendingQty; tot.pWt += pendingWt;
  });
  if (tfoot){
    tfoot.innerHTML = '<tr style="background:#e0c7c7;color:#8c004c;font-weight:800">'
                    +   '<td colspan="2" style="text-align:right">GRAND TOTAL ('+tot.count+' order'+(tot.count===1?'':'s')+'):</td>'
                    +   '<td>'+formatNumber(tot.oQty)+'</td><td>'+formatNumber2(tot.oWt)+'</td>'
                    +   '<td>'+formatNumber(tot.sQty)+'</td><td>'+formatNumber2(tot.sWt)+'</td>'
                    +   '<td>'+formatNumber(tot.pQty)+'</td><td>'+formatNumber2(tot.pWt)+'</td>'
                    +   '<td colspan="3"></td></tr>';
  }
  tbody.querySelectorAll('[data-toggle-pending-completed]').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var oid = b.dataset.togglePendingCompleted;
      completedPendingExpanded[oid] = !completedPendingExpanded[oid];
      renderCompleted();
    });
  });
  updateCompletedSummary(allList, list);
}

function updateCompletedSummary(allList, list){
  var el = document.getElementById('cfSummary'); if (!el) return;
  var tQ = 0, tW = 0, tP = 0, tPW = 0;
  list.forEach(function(rec){
    var s = getSentTotalsForOrder(rec.order);
    var pendingByArt = getPendingByArtForOrder(rec.order);
    tQ += s.sentQty; tW += s.sentWt;
    tP += pendingByArt.reduce(function(a,x){ return a + x.pendingQty; }, 0);
    tPW += pendingByArt.reduce(function(a,x){ return a + x.pendingWt; }, 0);
  });
  el.innerHTML = 'Showing <b>'+list.length+'</b> of <b>'+allList.length+'</b> dispatched order(s)'
               + ' &nbsp;·&nbsp; Sent Qty: <b style="color:#8c004c">'+formatNumber(tQ)+'</b> pcs'
               + ' &nbsp;·&nbsp; Sent Wt: <b style="color:#8c004c">'+formatNumber2(tW)+'</b> g'
               + ' &nbsp;·&nbsp; Pending Qty: <b style="color:#b3261e">'+formatNumber(tP)+'</b> pcs'
               + ' &nbsp;·&nbsp; Pending Wt: <b style="color:#b3261e">'+formatNumber2(tPW)+'</b> g';
}

async function exportAllCompletedExcel(){
  if (!window.ExcelJS){ alert('Excel library not loaded.'); return; }
  var allList = getCompletedOrders();
  if (!allList.length){ alert('No dispatched orders to export.'); return; }
  var list = filterCompletedList(allList);
  if (!list.length){ alert('No orders match current filters.'); return; }
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet('Dispatched Ready Stock', { pageSetup:{ paperSize:9, orientation:'landscape' } });
  var COLS = [
    { label:'ORDER NO.', width:14 },{ label:'ART NO.', width:14 },{ label:'PRODUCT NAME', width:28 },
    { label:'GROUP', width:16 },{ label:'TOUCH', width:10 },{ label:'ORDER QTY', width:12 },
    { label:'SENT QTY', width:12 },{ label:'PENDING QTY', width:12 },
    { label:'SENT WT (g)', width:14 },{ label:'PENDING WT (g)', width:14 },
    { label:'LOT #', width:10 },{ label:'SENT AT', width:20 }
  ];
  ws.columns = COLS.map(function(c){ return { header:c.label, width:c.width }; });
  ws.mergeCells('A1:L1'); ws.getCell('A1').value = 'GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD';
  ws.getCell('A1').font = { bold:true, size:16, color:{argb:'FF8C004C'} }; ws.getCell('A1').alignment = { horizontal:'center' };
  ws.getRow(1).height = 28;
  ws.mergeCells('A2:L2'); ws.getCell('A2').value = 'READY STOCK DISPATCHED TO HEAD OFFICE — '+(SHOW_ALL_WORKSHOPS?'ALL WORKSHOPS':formatBranchDisplayName(CURRENT_BRANCH));
  ws.getCell('A2').font = { bold:true, size:13 }; ws.getCell('A2').alignment = { horizontal:'center' };
  ws.getRow(2).height = 22; ws.addRow([]);
  var hr = ws.addRow(COLS.map(function(c){ return c.label; }));
  hr.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hr.eachCell(function(c){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8C004C'}}; c.alignment={horizontal:'center',vertical:'middle'}; c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; });
  var gq = 0, gw = 0, gp = 0, gpw = 0;
  list.forEach(function(rec){
    var o = rec.order, info = rec.info;
    var lots = Array.isArray(info.lots) ? info.lots : [];
    var pendingByArt = getPendingByArtForOrder(o);
    pendingByArt.forEach(function(pa){
      if (pa.sentQty <= 0 && pa.pendingQty <= 0) return;
      var pend = pa.pendingQty;
      var pendWt = pa.pendingWt;
      gq += pa.sentQty; gw += pa.sentWt; gp += pend; gpw += pendWt;
      var lastLot = lots[lots.length-1] || {};
      var row = ws.addRow([o.orderNo, pa.artNo, pa.name, o.productGroup, o.touch,
        Number(pa.orderQty||0), Number(pa.sentQty||0), pend,
        Number(pa.sentWt||0), pendWt, (lots.length||1),
        lastLot.at ? new Date(lastLot.at).toLocaleString('en-IN') : '']);
      row.eachCell(function(c){ c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; c.alignment={horizontal:'center',vertical:'middle'}; });
      row.getCell(3).alignment = { horizontal:'left', vertical:'middle' };
      if (pend > 0){
        var pCell = row.getCell(8); pCell.font={bold:true,color:{argb:'FFB3261E'}}; pCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFEBEE'}};
        var pwCell = row.getCell(10); pwCell.font={bold:true,color:{argb:'FFB3261E'}}; pwCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFEBEE'}};
      }
    });
  });
  var tr = ws.addRow(['','','','','',' TOTAL:', gq, gp, gw, gpw, '', '']);
  tr.font = { bold:true };
  tr.eachCell(function(c){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE0C7C7'}}; c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; c.alignment={horizontal:'center',vertical:'middle'}; });
  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url;
  a.download = 'Dispatched_'+safeFilePart(CURRENT_BRANCH || 'ALL')+'_'+new Date().toISOString().slice(0,10)+'.xlsx';
  a.click(); setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

/* ============================================================
   REPORTS
   ============================================================ */
var activeReportTab = 'workshop';
function buildReportsData(){
  var orders = getScopedOrders().filter(function(o){
    var info = getCompletedMap()[o.id]; return !(info && info.cleared);
  });
  var byWs = {}, byGrp = {};
  orders.forEach(function(o){
    var ws = formatBranchDisplayName(o.workshop || '—');
    var grp = o.productGroup || '—';
    var qty = Number(o.totalQty || 0), wt = Number(o.totalWeight || 0);
    if (!byWs[ws]) byWs[ws] = { orders:0, qty:0, weight:0, groups:{} };
    byWs[ws].orders++; byWs[ws].qty += qty; byWs[ws].weight += wt;
    if (!byWs[ws].groups[grp]) byWs[ws].groups[grp] = { orders:0, qty:0, weight:0 };
    byWs[ws].groups[grp].orders++; byWs[ws].groups[grp].qty += qty; byWs[ws].groups[grp].weight += wt;
    if (!byGrp[grp]) byGrp[grp] = { orders:0, qty:0, weight:0, workshops:{} };
    byGrp[grp].orders++; byGrp[grp].qty += qty; byGrp[grp].weight += wt;
    if (!byGrp[grp].workshops[ws]) byGrp[grp].workshops[ws] = { orders:0, qty:0, weight:0 };
    byGrp[grp].workshops[ws].orders++; byGrp[grp].workshops[ws].qty += qty; byGrp[grp].workshops[ws].weight += wt;
  });
  return { byWs: byWs, byGrp: byGrp };
}
function openReportsModal(){
  activeReportTab = 'workshop';
  document.querySelectorAll('#reportTabs .tab').forEach(function(t){ t.classList.toggle('active', t.dataset.report === 'workshop'); });
  renderReports();
  var m = document.getElementById('reportsModal'); if (m) m.classList.remove('hidden');
}
function closeReportsModal(){ var m = document.getElementById('reportsModal'); if (m) m.classList.add('hidden'); }
function renderReports(){
  var data = buildReportsData();
  var thead = document.getElementById('reportThead');
  var tbody = document.getElementById('reportBody');
  var tfoot = document.getElementById('reportTfoot');
  if (!thead || !tbody) return;
  if (activeReportTab === 'workshop'){
    thead.innerHTML = '<tr><th>WORKSHOP</th><th>ORDERS</th><th>QTY</th><th>WEIGHT (g)</th><th>3D PREMIUM IDOLS</th><th>3D IDOLS</th><th>2D IDOLS</th><th>JEWELLERY</th><th>GOD FRAMES</th></tr>';
    var wss = Object.keys(data.byWs).sort();
    if (!wss.length){ tbody.innerHTML = '<tr><td colspan="9" class="empty-list">No data.</td></tr>'; if (tfoot) tfoot.innerHTML=''; return; }
    var grand = { orders:0, qty:0, weight:0, g:{ '3D PREMIUM IDOLS':0,'3D IDOLS':0,'2D IDOLS':0,'JEWELLERY':0,'GOD FRAMES':0 } };
    tbody.innerHTML = wss.map(function(ws){
      var r = data.byWs[ws], g = r.groups || {};
      ['3D PREMIUM IDOLS','3D IDOLS','2D IDOLS','JEWELLERY','GOD FRAMES'].forEach(function(gg){ grand.g[gg] += (g[gg] ? g[gg].orders : 0); });
      grand.orders += r.orders; grand.qty += r.qty; grand.weight += r.weight;
      function cell(gg){ var x = g[gg]; if (!x) return '<span style="color:#bbb">—</span>';
        return '<b style="color:#8c004c">'+formatNumber(x.orders)+'</b><div style="font-size:10px;color:#6c7480;font-weight:600">'+formatNumber(x.qty)+' pcs · '+formatNumber(x.weight)+' g</div>'; }
      return '<tr><td style="text-align:left"><b>'+escapeHtml(ws)+'</b></td>'
           +   '<td><b>'+formatNumber(r.orders)+'</b></td><td>'+formatNumber(r.qty)+'</td><td>'+formatNumber(r.weight)+'</td>'
           +   '<td>'+cell('3D PREMIUM IDOLS')+'</td>'
           +   '<td>'+cell('3D IDOLS')+'</td><td>'+cell('2D IDOLS')+'</td><td>'+cell('JEWELLERY')+'</td><td>'+cell('GOD FRAMES')+'</td></tr>';
    }).join('');
    if (tfoot) tfoot.innerHTML = '<tr style="background:#e0c7c7;color:#8c004c;font-weight:800">'
      + '<td style="text-align:right">GRAND TOTAL:</td>'
      + '<td>'+formatNumber(grand.orders)+'</td><td>'+formatNumber(grand.qty)+'</td><td>'+formatNumber(grand.weight)+'</td>'
      + '<td>'+formatNumber(grand.g['3D PREMIUM IDOLS'])+'</td>'
      + '<td>'+formatNumber(grand.g['3D IDOLS'])+'</td><td>'+formatNumber(grand.g['2D IDOLS'])+'</td>'
      + '<td>'+formatNumber(grand.g['JEWELLERY'])+'</td><td>'+formatNumber(grand.g['GOD FRAMES'])+'</td></tr>';
  } else {
    thead.innerHTML = '<tr><th>PRODUCT GROUP</th><th>ORDERS</th><th>QTY</th><th>WEIGHT (g)</th><th>WORKSHOPS</th></tr>';
    var grps = Object.keys(data.byGrp).sort();
    if (!grps.length){ tbody.innerHTML = '<tr><td colspan="5" class="empty-list">No data.</td></tr>'; if (tfoot) tfoot.innerHTML=''; return; }
    var grand2 = { orders:0, qty:0, weight:0 };
    tbody.innerHTML = grps.map(function(gr){
      var r = data.byGrp[gr], wsList = Object.keys(r.workshops || {}).sort();
      grand2.orders += r.orders; grand2.qty += r.qty; grand2.weight += r.weight;
      var wsChips = wsList.map(function(ws){
        var x = r.workshops[ws];
        return '<span style="display:inline-block;background:#fbf2f7;color:#8c004c;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin:2px">'
             + escapeHtml(ws)+': '+formatNumber(x.orders)+' ord · '+formatNumber(x.weight)+' g</span>';
      }).join(' ') || '<span style="color:#bbb">—</span>';
      return '<tr><td style="text-align:left"><b>'+escapeHtml(gr)+'</b></td>'
           +   '<td><b>'+formatNumber(r.orders)+'</b></td><td>'+formatNumber(r.qty)+'</td><td>'+formatNumber(r.weight)+'</td>'
           +   '<td style="text-align:left">'+wsChips+'</td></tr>';
    }).join('');
    if (tfoot) tfoot.innerHTML = '<tr style="background:#e0c7c7;color:#8c004c;font-weight:800">'
      + '<td style="text-align:right">GRAND TOTAL:</td>'
      + '<td>'+formatNumber(grand2.orders)+'</td><td>'+formatNumber(grand2.qty)+'</td><td>'+formatNumber(grand2.weight)+'</td><td></td></tr>';
  }
}
async function exportReportsExcel(){
  if (!window.ExcelJS){ alert('Excel library not loaded.'); return; }
  var data = buildReportsData();
  var wb = new ExcelJS.Workbook();
  var ws1 = wb.addWorksheet('Workshop-wise');
  ws1.columns = [
    { header:'WORKSHOP', width:24 },{ header:'ORDERS', width:10 },{ header:'QTY', width:10 },{ header:'WEIGHT (g)', width:14 },
    { header:'3D PREMIUM IDOLS', width:16 },{ header:'3D IDOLS', width:14 },{ header:'2D IDOLS', width:14 },{ header:'JEWELLERY', width:14 },{ header:'GOD FRAMES', width:14 }
  ];
  ws1.mergeCells('A1:I1'); ws1.getCell('A1').value = 'REPORT — WORKSHOP-WISE';
  ws1.getCell('A1').font = { bold:true, size:15, color:{argb:'FF8C004C'} }; ws1.getCell('A1').alignment = { horizontal:'center' };
  ws1.getRow(1).height = 26; ws1.addRow([]);
  var hr1 = ws1.addRow(['WORKSHOP','ORDERS','QTY','WEIGHT (g)','3D PREMIUM IDOLS','3D IDOLS','2D IDOLS','JEWELLERY','GOD FRAMES']);
  hr1.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hr1.eachCell(function(c){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8C004C'}}; c.alignment={horizontal:'center'}; });
  var wsKeys = Object.keys(data.byWs).sort();
  var gt = { o:0, q:0, w:0, g:{ '3D PREMIUM IDOLS':0,'3D IDOLS':0,'2D IDOLS':0,'JEWELLERY':0,'GOD FRAMES':0 } };
  wsKeys.forEach(function(ws){
    var r = data.byWs[ws], g = r.groups || {};
    function gOrds(gg){ return (g[gg] ? g[gg].orders : 0); }
    gt.o += r.orders; gt.q += r.qty; gt.w += r.weight;
    ['3D PREMIUM IDOLS','3D IDOLS','2D IDOLS','JEWELLERY','GOD FRAMES'].forEach(function(gg){ gt.g[gg] += gOrds(gg); });
    var row = ws1.addRow([ws, r.orders, r.qty, r.weight, gOrds('3D PREMIUM IDOLS'), gOrds('3D IDOLS'), gOrds('2D IDOLS'), gOrds('JEWELLERY'), gOrds('GOD FRAMES')]);
    row.eachCell(function(c){ c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; c.alignment={horizontal:'center'}; });
  });
  var tot1 = ws1.addRow(['GRAND TOTAL', gt.o, gt.q, gt.w, gt.g['3D PREMIUM IDOLS'], gt.g['3D IDOLS'], gt.g['2D IDOLS'], gt.g['JEWELLERY'], gt.g['GOD FRAMES']]);
  tot1.font = { bold:true };
  tot1.eachCell(function(c){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE0C7C7'}}; c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; c.alignment={horizontal:'center'}; });

  var ws2 = wb.addWorksheet('Group-wise');
  ws2.columns = [
    { header:'PRODUCT GROUP', width:20 },{ header:'ORDERS', width:10 },{ header:'QTY', width:10 },{ header:'WEIGHT (g)', width:14 },{ header:'WORKSHOPS BREAKDOWN', width:60 }
  ];
  ws2.mergeCells('A1:E1'); ws2.getCell('A1').value = 'REPORT — GROUP-WISE';
  ws2.getCell('A1').font = { bold:true, size:15, color:{argb:'FF8C004C'} }; ws2.getCell('A1').alignment = { horizontal:'center' };
  ws2.getRow(1).height = 26; ws2.addRow([]);
  var hr2 = ws2.addRow(['PRODUCT GROUP','ORDERS','QTY','WEIGHT (g)','WORKSHOPS BREAKDOWN']);
  hr2.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hr2.eachCell(function(c){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8C004C'}}; c.alignment={horizontal:'center'}; });
  var grpKeys = Object.keys(data.byGrp).sort();
  var gt2 = { o:0, q:0, w:0 };
  grpKeys.forEach(function(gr){
    var r = data.byGrp[gr];
    var wsList = Object.keys(r.workshops || {}).sort();
    var breakdown = wsList.map(function(ws){ var x = r.workshops[ws]; return ws+': '+x.orders+' ord / '+x.weight+' g'; }).join(' | ');
    gt2.o += r.orders; gt2.q += r.qty; gt2.w += r.weight;
    var row = ws2.addRow([gr, r.orders, r.qty, r.weight, breakdown]);
    row.eachCell(function(c){ c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; });
    row.getCell(1).alignment = { horizontal:'left' };
    row.getCell(5).alignment = { horizontal:'left', wrapText:true };
  });
  var tot2 = ws2.addRow(['GRAND TOTAL', gt2.o, gt2.q, gt2.w, '']);
  tot2.font = { bold:true };
  tot2.eachCell(function(c){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE0C7C7'}}; c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; c.alignment={horizontal:'center'}; });

  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url;
  a.download = 'Reports_'+safeFilePart(CURRENT_BRANCH || 'ALL')+'_'+new Date().toISOString().slice(0,10)+'.xlsx';
  a.click(); setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

/* ============================================================
   INIT + BIND
   ============================================================ */
function initUI(){
  var branchNameEl = document.getElementById('branchName');
  var branchTitleEl = document.getElementById('branchTitle');
  if (branchNameEl) branchNameEl.textContent = SHOW_ALL_WORKSHOPS ? 'All Workshops' : (formatBranchDisplayName(CURRENT_BRANCH) || '—');
  if (branchTitleEl) branchTitleEl.textContent = SHOW_ALL_WORKSHOPS ? (getBranchTitleLabel() + ' — all workshops') : getBranchTitleLabel();

  var stageFiltersEl = document.getElementById('stageFilters');
  if (stageFiltersEl){
    if (isAdminLikeRole()){
      stageFiltersEl.style.display = '';
      populateWorkshopFilter();
      var fWs = document.getElementById('fWorkshop'); var fGr = document.getElementById('fGroup');
      var fFr = document.getElementById('fFrom'); var fTo = document.getElementById('fTo');
      var fRe = document.getElementById('fReset');
      if (fWs) fWs.addEventListener('change', function(){ stageFilters.workshop = fWs.value; renderOrders(); });
      if (fGr) fGr.addEventListener('change', function(){ stageFilters.group = fGr.value; renderOrders(); });
      if (fFr) fFr.addEventListener('change', function(){ stageFilters.from = fFr.value; renderOrders(); });
      if (fTo) fTo.addEventListener('change', function(){ stageFilters.to = fTo.value; renderOrders(); });
      if (fRe) fRe.addEventListener('click', function(){
        stageFilters = { workshop:'', group:'', from:'', to:'' };
        if (fWs) fWs.value=''; if (fGr) fGr.value=''; if (fFr) fFr.value=''; if (fTo) fTo.value='';
        renderOrders();
      });
    } else stageFiltersEl.style.display = 'none';
  }

  var completedBtn = document.getElementById('completedBtn');
  if (completedBtn) completedBtn.addEventListener('click', openCompletedModal);
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
  var reportsBtn = document.getElementById('reportsBtn');
  if (reportsBtn){
    if (isAdminLikeRole()) reportsBtn.addEventListener('click', openReportsModal);
    else reportsBtn.style.display = 'none';
  }

  var stockBtn = document.getElementById('stockBtn');
  if (stockBtn) stockBtn.addEventListener('click', openStockModal);
  var closeStockModalBtn = document.getElementById('closeStockModal');
  if (closeStockModalBtn) closeStockModalBtn.addEventListener('click', closeStockModal);
  var cancelStockBtn = document.getElementById('cancelStockBtn');
  if (cancelStockBtn) cancelStockBtn.addEventListener('click', closeStockModal);

  var notifBtn = document.getElementById('notifBtn');
  if (notifBtn) notifBtn.addEventListener('click', function(e){ e.stopPropagation(); toggleNotifPanel(); });
  var notifClose = document.getElementById('notifClose');
  if (notifClose) notifClose.addEventListener('click', function(e){ e.stopPropagation(); toggleNotifPanel(false); });
  document.addEventListener('click', function(e){
    var panel = document.getElementById('notifPanel');
    var wrap  = notifBtn ? notifBtn.parentNode : null;
    if (!panel || !panel.classList.contains('open')) return;
    if (wrap && wrap.contains(e.target)) return;
    toggleNotifPanel(false);
  });
  refreshNotifBadge();

  var closeOrderModalBtn = document.getElementById('closeOrderModal'); if (closeOrderModalBtn) closeOrderModalBtn.addEventListener('click', closeOrderModal);
  var forwardBtn = document.getElementById('forwardStageBtn'); if (forwardBtn) forwardBtn.addEventListener('click', forwardCurrentOrder);
  var dlPdf = document.getElementById('dlOrderPdfBtn'); if (dlPdf) dlPdf.addEventListener('click', function(){ if (currentOrder) downloadOrderPDF(currentOrder); });
  var dlXls = document.getElementById('dlOrderExcelBtn'); if (dlXls) dlXls.addEventListener('click', function(){ if (currentOrder) downloadOrderExcel(currentOrder); });

  var closeComp = document.getElementById('closeCompletedModal'); if (closeComp) closeComp.addEventListener('click', closeCompletedModal);
  var exportComp = document.getElementById('exportCompletedExcelBtn'); if (exportComp) exportComp.addEventListener('click', exportAllCompletedExcel);

  var closeRep = document.getElementById('closeReportsModal'); if (closeRep) closeRep.addEventListener('click', closeReportsModal);
  var exportRep = document.getElementById('exportReportsExcelBtn'); if (exportRep) exportRep.addEventListener('click', exportReportsExcel);
  document.querySelectorAll('#reportTabs .tab').forEach(function(t){
    t.addEventListener('click', function(){
      document.querySelectorAll('#reportTabs .tab').forEach(function(x){ x.classList.remove('active'); });
      t.classList.add('active'); activeReportTab = t.dataset.report; renderReports();
    });
  });

  document.querySelectorAll('.tab[data-stage]').forEach(function(t){
    t.addEventListener('click', function(){
      document.querySelectorAll('.tab[data-stage]').forEach(function(x){ x.classList.remove('active'); });
      t.classList.add('active'); activeStageFilter = t.dataset.stage; renderOrders();
    });
  });

  renderStats();
  renderOrders();

  setInterval(function(){
    refreshNotifBadge();
    var anyOpen = !document.getElementById('orderModal').classList.contains('hidden')
               || !document.getElementById('completedModal').classList.contains('hidden')
               || !document.getElementById('reportsModal').classList.contains('hidden')
               || !document.getElementById('stockModal').classList.contains('hidden');
    if (!anyOpen){ renderStats(); renderOrders(); }
    else {
      if (!document.getElementById('completedModal').classList.contains('hidden')) renderCompleted();
      if (!document.getElementById('reportsModal').classList.contains('hidden')) renderReports();
    }
  }, 8000);

  document.addEventListener('visibilitychange', function(){
    if (!document.hidden){ renderStats(); renderOrders(); refreshNotifBadge(); }
  });
  window.addEventListener('storage', function(e){
    if (!e.key) return;
    if (e.key === ORDERS_KEY || e.key === STAGES_KEY || e.key === COMPLETED_KEY || e.key === SEEN_KEY || e.key === NOTIF_LOG_KEY){
      renderStats(); renderOrders(); refreshNotifBadge();
      if (currentOrder) openOrder(currentOrder.id);
      if (!document.getElementById('completedModal').classList.contains('hidden')) renderCompleted();
      if (!document.getElementById('reportsModal').classList.contains('hidden')) renderReports();
      if (!document.getElementById('stockModal').classList.contains('hidden')) openStockModal();
    }
  });
  window.addEventListener('focus', function(){ renderStats(); renderOrders(); refreshNotifBadge(); });
  window.addEventListener('pageshow', function(){ renderStats(); renderOrders(); refreshNotifBadge(); });
}

function doLogout(){
  if (!confirm('Log out' + (CURRENT_BRANCH ? (' of ' + formatBranchDisplayName(CURRENT_BRANCH) + ' branch') : '') + '?')) return;
  try { sessionStorage.removeItem('gp_logged_user'); sessionStorage.clear(); } catch(e){}
  window.location.replace('index.html');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
else initUI();