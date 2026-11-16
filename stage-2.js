/* ============================================================
   STAGE-2 PROCESS — v17.6 (dedupe + per-batch advance + role gating)
   ============================================================ */

var ORDERS_KEY          = 'goldprince_orders_v3';
var SENDS_KEY           = 'goldprince_stock_sends_v1';
var STAGE2_ORDERS_KEY   = 'goldprince_stage2_orders_v1';
var STAGE2_HISTORY_KEY  = 'goldprince_stage2_history_v1';
var STAGE2_RC_KEY       = 'goldprince_root_cards_v1';
var STAGE2_RC_NEXT_KEY  = 'goldprince_root_cards_next';
var STAGE2_JAMA_REPORT_KEY = 'goldprince_stage2_jama_reports_v1';
var STOCK_JAMA_IDS_KEY  = 'goldprince_stock_jama_ids_v1';
var COMPLETED_KEY       = 'goldprince_completed_v1';

var STAGE_SEQUENCE = ['STOCK_JAMA','PLATING','RECEIVED_PLATING','PACKING','QC','DISPATCH'];
var STAGE_LABELS = {
  STOCK_JAMA:'1. Stock Jama', PLATING:'2. Plating/Polish',
  RECEIVED_PLATING:'3. Received from Plating', PACKING:'4. Packing',
  QC:'5. QC Section', DISPATCH:'6. Dispatch', SCRAPPED:'Scrapped'
};
var STAGE_SHORT = {
  STOCK_JAMA:'Jama Completed', PLATING:'Plating/Polish',
  RECEIVED_PLATING:'Received from Plating', PACKING:'Packing',
  QC:'QC Section', DISPATCH:'Dispatch', SCRAPPED:'Scrapped'
};
var STAGE_CLASS = {
  STOCK_JAMA:'stock', PLATING:'plating', RECEIVED_PLATING:'received',
  PACKING:'packing', QC:'qc', DISPATCH:'dispatch', SCRAPPED:'scrapped'
};
var STAGE_ICON = {
  STOCK_JAMA:'fa-inbox', PLATING:'fa-bolt', RECEIVED_PLATING:'fa-clipboard-check',
  PACKING:'fa-box', QC:'fa-search', DISPATCH:'fa-truck', SCRAPPED:'fa-trash'
};

var session = null;
try { session = JSON.parse(sessionStorage.getItem('gp_logged_user') || 'null'); } catch(e){}
if (!session || !session.username) {
  session = { username: 'Admin', role: 'admin' };
  try { sessionStorage.setItem('gp_logged_user', JSON.stringify(session)); } catch(e){}
}
var CURRENT_USER = (session && session.username) || 'Admin';
var CURRENT_ROLE = (session && session.role) || 'admin';

/* ============================================================
   POST-PRODUCTION ROLE FILTER
   ------------------------------------------------------------
   Roles and the sections they are allowed to see / act on:
     stock_jama_incharge → STOCK_JAMA + RECEIVED_PLATING + PACKING
     plating_polish      → PLATING
     packing             → PACKING
     qc_section          → QC
     dispatch_section    → DISPATCH
   admin / user / any other role → ALL sections (no restriction)
   ============================================================ */
var ROLE_SECTION_MAP = {
  stock_jama_incharge: ['STOCK_JAMA', 'RECEIVED_PLATING', 'PACKING'],
  plating_polish:      ['PLATING'],
  packing:             ['PACKING'],
  qc_section:          ['QC'],
  dispatch_section:    ['DISPATCH']
};

/* Returns array of allowed stage keys, or null when unrestricted */
function getAllowedSections(){
  var r = String(CURRENT_ROLE || '').toLowerCase();
  if (ROLE_SECTION_MAP[r]) return ROLE_SECTION_MAP[r].slice();
  return null; // unrestricted
}
var ALLOWED_SECTIONS = getAllowedSections();
var IS_RESTRICTED = !!ALLOWED_SECTIONS;

function isSectionAllowed(stage){
  if (!IS_RESTRICTED) return true;
  return ALLOWED_SECTIONS.indexOf(stage) !== -1;
}
function canViewStage(stage){
  return isSectionAllowed(stage);
}
function canForwardFromStage(stage){
  if (!IS_RESTRICTED) return true;
  return ALLOWED_SECTIONS.indexOf(stage) !== -1;
}

/* ============================================================
   ADMIN-ONLY HEADER BUTTONS
   ------------------------------------------------------------
   These buttons are only visible to admin (and unrestricted
   administrative roles). Post-production section users must not
   see them.
   ============================================================ */
var ADMIN_ROLES = ['admin'];
var IS_ADMIN = ADMIN_ROLES.indexOf(String(CURRENT_ROLE||'').toLowerCase()) !== -1;
var ADMIN_ONLY_BUTTON_IDS = ['koraBtn','trackerBtn','reportsBtn','diffBtn','excelBtn'];

function applyHeaderButtonVisibility(){
  ADMIN_ONLY_BUTTON_IDS.forEach(function(id){
    var el = document.getElementById(id);
    if (!el) return;
    el.style.display = IS_ADMIN ? '' : 'none';
  });
}

var $ = function(id){ return document.getElementById(id); };
function readJSON(k, fb){ try { var v = JSON.parse(localStorage.getItem(k)||'null'); return v==null?fb:v; } catch(e){ return fb; } }
function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function formatNumber(v){ var n=Number(v||0); return n.toLocaleString('en-IN',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2}); }
function formatSigned(v){ var n=Number(v||0); return n>0?('+'+formatNumber(n)):n<0?('-'+formatNumber(Math.abs(n))):formatNumber(0); }
function formatDate(v){ if(!v) return '—'; var p=String(v).split('-'); return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:v; }
function formatDateTime(iso){ if(!iso) return '—'; var d=new Date(iso); if(isNaN(d)) return '—'; return d.toLocaleDateString('en-IN')+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
function nowISO(){ return new Date().toISOString(); }
function todayISO(){ var d=new Date(), x=new Date(d.getTime()-d.getTimezoneOffset()*60000); return x.toISOString().slice(0,10); }
function n0(v){ var n=Number(v||0); return Number.isFinite(n) ? n : 0; }
function intQty(v){ var n=Math.floor(n0(v)); return n<0 ? 0 : n; }
function wt2(v){ var n=n0(v); if (n<0) n=0; return Math.round(n * 100) / 100; }
function uid(){ return 'b-' + Date.now() + '-' + Math.floor(Math.random()*1000); }
function _norm(v){ return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase(); }

/* --- COMPLETED MAP --- */
function markJamaInCompletedMap(orderId, summary){
  if (!orderId) return;
  var m = readJSON(COMPLETED_KEY, {});
  if (!m || typeof m !== 'object') m = {};
  var entry = m[orderId];
  if (!entry || typeof entry !== 'object') return;
  var now = (summary && summary.at) || nowISO();
  entry.jamaCompleted     = true;
  entry.jamaConfirmedAt   = now;
  entry.jamaCompletedAt   = now;
  entry.jamaBy            = (summary && summary.by) || CURRENT_USER;
  entry.jamaQty           = (summary && summary.qty != null) ? Number(summary.qty) : 0;
  entry.jamaWt            = (summary && summary.wt  != null) ? Number(summary.wt)  : 0;
  entry.jamaRootCards     = (summary && summary.rootCards) || [];
  m[orderId] = entry;
  saveJSON(COMPLETED_KEY, m);
  notifyCompletedMapChanged();
}
function clearJamaInCompletedMap(orderId){
  if (!orderId) return;
  var m = readJSON(COMPLETED_KEY, {});
  if (!m || typeof m !== 'object') return;
  var entry = m[orderId];
  if (!entry) return;
  delete entry.jamaCompleted; delete entry.jamaConfirmedAt;
  delete entry.jamaCompletedAt; delete entry.jamaDoneAt;
  delete entry.jamaBy; delete entry.jamaQty; delete entry.jamaWt; delete entry.jamaRootCards;
  m[orderId] = entry;
  saveJSON(COMPLETED_KEY, m);
  notifyCompletedMapChanged();
}
function notifyCompletedMapChanged(){
  try { localStorage.setItem('gp_completed_bump', String(Date.now())); } catch(e){}
  try { window.dispatchEvent(new CustomEvent('gp:completedmap-changed', { detail: { key: COMPLETED_KEY, at: nowISO() } })); } catch(e){}
}

/* --- STAGE-2 STORAGE --- */
function getStage2Orders(){ var v = readJSON(STAGE2_ORDERS_KEY, {}); return (v && typeof v==='object') ? v : {}; }
function saveStage2Orders(v){ saveJSON(STAGE2_ORDERS_KEY, v); }
function getStage2History(){ var v = readJSON(STAGE2_HISTORY_KEY, {}); return (v && typeof v==='object') ? v : {}; }
function saveStage2History(v){ saveJSON(STAGE2_HISTORY_KEY, v); }
function getRootCards(){ var v = readJSON(STAGE2_RC_KEY, {}); return (v && typeof v==='object') ? v : {}; }
function saveRootCards(v){ saveJSON(STAGE2_RC_KEY, v); }
function getNextRcNumber(){ var n = Number(localStorage.getItem(STAGE2_RC_NEXT_KEY) || 1001); if (!Number.isFinite(n) || n < 1001) n = 1001; return n; }
function suggestRootCard(){ return 'RC-' + getNextRcNumber(); }
function consumeRootCard(){ localStorage.setItem(STAGE2_RC_NEXT_KEY, String(getNextRcNumber() + 1)); }
function getJamaReports(){ var v = readJSON(STAGE2_JAMA_REPORT_KEY, []); return Array.isArray(v) ? v : []; }
function saveJamaReports(v){ saveJSON(STAGE2_JAMA_REPORT_KEY, v); }
function getStockJamaIds(){ var v = readJSON(STOCK_JAMA_IDS_KEY, []); return Array.isArray(v) ? v : []; }
function markOrderInStockJama(orderId){
  if (!orderId) return;
  var ids = getStockJamaIds();
  if (ids.indexOf(orderId) === -1){ ids.push(orderId); saveJSON(STOCK_JAMA_IDS_KEY, ids); }
}

/* --- JAMA BALANCE helpers --- */
function toJamaItem(it){
  return {
    artNo: it.artNo, name: it.name, touch: it.touch || '',
    orderQty: n0(it.orderQty), weight: wt2(it.weight),
    jamaQty: intQty(it.jamaQty != null ? it.jamaQty : it.stockQty),
    jamaWt:  wt2(it.jamaWt != null ? it.jamaWt : it.totalWt)
  };
}
function getJamaBalanceItems(order, s){
  var hasExplicitJamaItems =
    s && Object.prototype.hasOwnProperty.call(s, 'jamaItems') && Array.isArray(s.jamaItems);
  var hasAnyBatch = s && Array.isArray(s.forwardBatches) && s.forwardBatches.length > 0;
  var orderItems = order.items || [];

  if (hasExplicitJamaItems && s.jamaItems.length > 0){
    return s.jamaItems.map(toJamaItem);
  }
  if ((!hasExplicitJamaItems || s.jamaItems.length === 0) && !hasAnyBatch && orderItems.length){
    return orderItems.map(function(it){
      return toJamaItem({
        artNo: it.artNo, name: it.name, touch: it.touch,
        orderQty: it.orderQty, weight: it.weight,
        stockQty: it.stockQty, totalWt: it.totalWt
      });
    });
  }
  return hasExplicitJamaItems ? s.jamaItems.map(toJamaItem) : [];
}
function jamaBalanceTotals(items){
  var q = 0, w = 0;
  (items||[]).forEach(function(it){ q += n0(it.jamaQty); w += n0(it.jamaWt); });
  return { qty: q, wt: wt2(w) };
}

/* ============================================================
   PIPELINE BUILDER
   ============================================================ */
function buildPipeline(){
  var orders    = readJSON(ORDERS_KEY, []);
  var sends     = readJSON(SENDS_KEY, []);
  var completed = readJSON(COMPLETED_KEY, {});
  var state     = getStage2Orders();
  var byOrder   = {};

  if (Array.isArray(orders)) {
    orders.forEach(function(o) {
      if (!o || !o.id) return;
      byOrder[o.id] = {
        orderId: o.id, orderNo: o.orderNo || '—',
        branch: o.workshop || '—', group: o.productGroup || '—',
        orderDate: o.orderDate || null, receivedDates: [],
        totalOrderQty: 0, totalStockQty: 0, totalWeight: 0, items: []
      };
    });
  }

  if (completed && typeof completed === 'object') {
    Object.keys(completed).forEach(function(oid){
      if (!oid) return;
      var info = completed[oid] || {};
      if (!byOrder[oid]) {
        var matched = Array.isArray(orders) ? orders.find(function(x){
          return x && (x.id === oid || x.orderNo === oid);
        }) : null;
        byOrder[oid] = {
          orderId: oid,
          orderNo: (matched && matched.orderNo) || info.orderNo || oid,
          branch:  (matched && matched.workshop) || info.branch || '—',
          group:   (matched && matched.productGroup) || info.group || '—',
          orderDate: (matched && matched.orderDate) || info.orderDate || null,
          receivedDates: [],
          totalOrderQty: 0, totalStockQty: 0, totalWeight: 0, items: []
        };
      }
      var e = byOrder[oid];
      if (info.completedAt){
        var d = String(info.completedAt).slice(0, 10);
        if (d && e.receivedDates.indexOf(d) === -1) e.receivedDates.push(d);
      }
      if (Array.isArray(info.rows) && info.rows.length && (!e.items || !e.items.length)) {
        info.rows.forEach(function(r){
          var lineQty = n0(r.stockQty);
          var lineWt  = n0(r.rowTotal != null ? r.rowTotal : (lineQty * n0(r.weight)));
          e.items.push({
            artNo: r.artNo, name: r.name, touch: r.touch,
            orderQty: n0(r.orderQty), stockQty: lineQty,
            weight: wt2(r.weight), totalWt: wt2(lineWt)
          });
          e.totalOrderQty += n0(r.orderQty);
          e.totalStockQty += lineQty;
          e.totalWeight   += lineWt;
        });
      }
    });
  }

  if (Array.isArray(sends)) {
    sends.forEach(function(send){
      (send.rows || []).forEach(function(r){
        var oid = r.orderId;
        if (!oid) return;
        if (!byOrder[oid]) {
          byOrder[oid] = {
            orderId: oid, orderNo: r.orderNo || '—',
            branch: send.branch || '—', group: r.group || '—',
            orderDate: null, receivedDates: [],
            totalOrderQty: 0, totalStockQty: 0, totalWeight: 0, items: []
          };
        }
        var e = byOrder[oid];
        if (send.date){
          var sd = String(send.date).slice(0, 10);
          if (sd && e.receivedDates.indexOf(sd) === -1) e.receivedDates.push(sd);
        }
        var lineQty = n0(r.stockQty);
        var lineWt  = n0(r.rowTotal != null ? r.rowTotal : (lineQty * n0(r.weight)));
        e.items.push({
          artNo: r.artNo, name: r.name, touch: r.touch,
          orderQty: n0(r.orderQty), stockQty: lineQty,
          weight: wt2(r.weight), totalWt: wt2(lineWt)
        });
        e.totalOrderQty += n0(r.orderQty);
        e.totalStockQty += lineQty;
        e.totalWeight   += lineWt;
      });
    });
  }

  Object.keys(byOrder).forEach(function(oid) {
    var base = byOrder[oid];
    var origOrder = (Array.isArray(orders) ? orders.find(function(x){ return x.id === oid; }) : null) || {};
    if (!base.items.length && origOrder.items && origOrder.items.length) {
      base.items = origOrder.items.map(function(it) {
        return {
          artNo: it.artNo, name: it.name, touch: it.touch,
          orderQty: n0(it.quantity || it.orderQty),
          stockQty: n0(it.quantity || it.orderQty),
          weight: wt2(it.weight),
          totalWt: wt2(it.totalWeight || (n0(it.quantity || it.orderQty) * n0(it.weight)))
        };
      });
      base.totalOrderQty = base.items.reduce(function(acc, it){ return acc + it.orderQty; }, 0);
      base.totalStockQty = base.items.reduce(function(acc, it){ return acc + it.stockQty; }, 0);
      base.totalWeight = base.items.reduce(function(acc, it){ return acc + it.totalWt; }, 0);
    }
    if (!base.orderDate) base.orderDate = origOrder.orderDate || null;
    if (!base.branch || base.branch === '—') base.branch = origOrder.workshop || '—';
    if (!base.group || base.group === '—') base.group = origOrder.productGroup || '—';
    if (!base.orderNo || base.orderNo === '—') base.orderNo = origOrder.orderNo || oid;
  });

  (function dedupeByOrderNo(){
    var byOrderNo = {};
    Object.keys(byOrder).forEach(function(oid){
      var entry = byOrder[oid];
      var key = _norm(entry.orderNo || oid);
      if (!key) return;
      if (!byOrderNo[key]) byOrderNo[key] = [];
      byOrderNo[key].push(oid);
    });
    Object.keys(byOrderNo).forEach(function(key){
      var ids = byOrderNo[key];
      if (ids.length < 2) return;
      var keeperId = null;
      for (var i = 0; i < ids.length; i++){
        if (state[ids[i]]) { keeperId = ids[i]; break; }
      }
      if (!keeperId){
        var best = ids[0];
        var bestItems = (byOrder[best].items || []).length;
        for (var j = 1; j < ids.length; j++){
          var cItems = (byOrder[ids[j]].items || []).length;
          if (cItems > bestItems) { best = ids[j]; bestItems = cItems; }
        }
        keeperId = best;
      }
      var keeper = byOrder[keeperId];
      ids.forEach(function(otherId){
        if (otherId === keeperId) return;
        var other = byOrder[otherId];
        (other.items || []).forEach(function(it){ keeper.items.push(it); });
        keeper.totalOrderQty += other.totalOrderQty || 0;
        keeper.totalStockQty += other.totalStockQty || 0;
        keeper.totalWeight   += other.totalWeight   || 0;
        (other.receivedDates || []).forEach(function(d){
          if (keeper.receivedDates.indexOf(d) === -1) keeper.receivedDates.push(d);
        });
        if (!keeper.branch || keeper.branch === '—') keeper.branch = other.branch;
        if (!keeper.group  || keeper.group  === '—') keeper.group  = other.group;
        if (!keeper.orderDate && other.orderDate) keeper.orderDate = other.orderDate;
        if (state[otherId] && !state[keeperId]){
          state[keeperId] = state[otherId];
          delete state[otherId];
          try { saveStage2Orders(state); } catch(e){}
        }
        delete byOrder[otherId];
      });
    });
  })();

  var rows = [];
  Object.keys(byOrder).forEach(function(oid){
    var base = byOrder[oid];
    var s = state[oid] || {};

    base.rootCard      = s.rootCard || '';
    base.rootCardDate  = s.rootCardDate || null;
    base.stage         = s.stage || 'STOCK_JAMA';
    base.editedItems   = s.editedItems || null;
    base.lastUpdate    = s.lastUpdate || base.orderDate || null;

    base.currentQty    = n0(s.currentQty    != null ? s.currentQty    : base.totalStockQty);
    base.currentWeight = n0(s.currentWeight != null ? s.currentWeight : base.totalWeight);
    base.platingQty    = n0(s.platingQty    != null ? s.platingQty    : base.totalStockQty);
    base.platingWeight = n0(s.platingWeight != null ? s.platingWeight : base.totalWeight);
    base.receivedQty    = n0(s.receivedQty    != null ? s.receivedQty    : base.totalStockQty);
    base.receivedWeight = n0(s.receivedWeight != null ? s.receivedWeight : base.totalWeight);
    base.packingQty    = n0(s.packingQty    != null ? s.packingQty    : base.totalStockQty);
    base.packingWeight = n0(s.packingWeight != null ? s.packingWeight : base.totalWeight);
    base.qcQty    = n0(s.qcQty    != null ? s.qcQty    : base.totalStockQty);
    base.qcWeight = n0(s.qcWeight != null ? s.qcWeight : base.totalWeight);
    base.dispatchQty    = n0(s.dispatchQty    != null ? s.dispatchQty    : base.totalStockQty);
    base.dispatchWeight = n0(s.dispatchWeight != null ? s.dispatchWeight : base.totalWeight);

    base.forwardBatches   = Array.isArray(s.forwardBatches)   ? s.forwardBatches.slice()   : [];
    base.cancelEvents     = Array.isArray(s.cancelEvents)     ? s.cancelEvents.slice()     : [];
    base.cancelledRootCards = Array.isArray(s.cancelledRootCards) ? s.cancelledRootCards.slice() : [];

    base.allRootCards = [];
    base.forwardBatches.forEach(function(b){
      if (b.rootCard && base.allRootCards.indexOf(b.rootCard) === -1) base.allRootCards.push(b.rootCard);
    });
    if (s.rootCard && base.allRootCards.indexOf(s.rootCard) === -1) base.allRootCards.push(s.rootCard);

    base.activeRootCard = '';
    for (var i = base.forwardBatches.length - 1; i >= 0; i--){
      var b = base.forwardBatches[i];
      if (b && b.rootCard && base.cancelledRootCards.indexOf(b.rootCard) === -1){
        base.activeRootCard = b.rootCard; break;
      }
    }

    var jbItems  = getJamaBalanceItems(base, s);
    var jbTotals = jamaBalanceTotals(jbItems);
    base.jamaItems  = jbItems;
    base.jamaQty    = jbTotals.qty;
    base.jamaWeight = jbTotals.wt;
    base.forwardedEvents = Array.isArray(s.forwardedEvents) ? s.forwardedEvents.slice() : [];
    base.scrapEvents     = Array.isArray(s.scrapEvents)     ? s.scrapEvents.slice()     : [];

    if ((!s.jamaItems || !Array.isArray(s.jamaItems) || s.jamaItems.length === 0)
        && (!base.forwardBatches || base.forwardBatches.length === 0)
        && (!base.forwardedEvents || base.forwardedEvents.length === 0)
        && (!base.scrapEvents     || base.scrapEvents.length === 0)
        && (base.totalStockQty > 0 || base.totalWeight > 0)
        && (base.jamaQty === 0 && base.jamaWeight === 0)) {
      base.jamaItems = (base.items || []).map(function(it){
        return toJamaItem({
          artNo: it.artNo, name: it.name, touch: it.touch,
          orderQty: it.orderQty, weight: it.weight,
          stockQty: it.stockQty, totalWt: it.totalWt
        });
      });
      var seedTotals = jamaBalanceTotals(base.jamaItems);
      base.jamaQty    = seedTotals.qty;
      base.jamaWeight = seedTotals.wt;
    }

    if (base.stage === 'STOCK_JAMA' && (base.jamaQty > 0 || base.jamaWeight > 0)){
      base.currentQty    = base.jamaQty;
      base.currentWeight = base.jamaWeight;
    }

    if (base.stage === 'SCRAPPED') return;

    base.forwardBatches.forEach(function(batch, idx){
      if (!batch || !batch.rootCard) return;
      if (base.cancelledRootCards.indexOf(batch.rootCard) !== -1) return;

      var batchStage = batch.stage || 'PLATING';
      if (STAGE_SEQUENCE.indexOf(batchStage) < STAGE_SEQUENCE.indexOf('PLATING')) batchStage = 'PLATING';

      rows.push({
        rowType: 'BATCH',
        rowKey: base.orderId + '::batch::' + batch.id,
        batchId: batch.id,
        batch: batch,
        batchIndex: idx + 1,
        batchCount: base.forwardBatches.length,
        orderId: base.orderId, orderNo: base.orderNo,
        branch: base.branch, group: base.group,
        rootCard: batch.rootCard, activeRootCard: batch.rootCard,
        stage: batchStage,
        currentQty: intQty(batch.qty),
        currentWeight: wt2(batch.wt),
        lastUpdate: batch.lastUpdate || batch.at || base.lastUpdate,
        orderDate: base.orderDate, receivedDates: base.receivedDates,
        _order: base
      });
    });

    var hasExplicitEmptyJama =
      (s && Object.prototype.hasOwnProperty.call(s, 'jamaItems') &&
       Array.isArray(s.jamaItems) && s.jamaItems.length === 0);

    if (!hasExplicitEmptyJama && (base.jamaQty > 0 || base.jamaWeight > 0)){
      rows.push({
        rowType: 'JAMA_BALANCE',
        rowKey: base.orderId + '::jama',
        orderId: base.orderId, orderNo: base.orderNo,
        branch: base.branch, group: base.group,
        rootCard: '', activeRootCard: '',
        stage: 'STOCK_JAMA',
        currentQty: intQty(base.jamaQty),
        currentWeight: wt2(base.jamaWeight),
        lastUpdate: base.lastUpdate,
        orderDate: base.orderDate, receivedDates: base.receivedDates,
        _order: base
      });
    }
  });

  rows.sort(function(a,b){
    var da = a.lastUpdate || ''; var db = b.lastUpdate || '';
    return new Date(db) - new Date(da);
  });
  return rows;
}

function findOrderById(orderId){
  var rows = buildPipeline();
  for (var i = 0; i < rows.length; i++){
    if (rows[i].orderId === orderId && rows[i]._order) return rows[i]._order;
  }
  return null;
}
function findRowByOrderId(orderId){
  var rows = buildPipeline();
  for (var i = 0; i < rows.length; i++){
    if (rows[i].orderId === orderId) return rows[i];
  }
  return null;
}

function buildStageStatement(o, batch){
  if (!o) return [];
  var curIdx = STAGE_SEQUENCE.indexOf(o.stage);
  var batchJamaQty = batch ? (batch.jamaCompletedQty != null ? batch.jamaCompletedQty : batch.qty) : o.totalStockQty;
  var batchJamaWt  = batch ? (batch.jamaCompletedWt != null ? batch.jamaCompletedWt : batch.wt) : o.totalWeight;
  var batchFwdQty  = batch ? batch.qty : o.platingQty;
  var batchFwdWt   = batch ? batch.wt : o.platingWeight;

  var rows = [
    { key:'RECEIVED_BRANCH', label:'Stock Received from Branch', qty:o.totalStockQty, weight:o.totalWeight, reached:true },
    { key:'STOCK_JAMA', label:'Jama Completed', qty:batchJamaQty, weight:batchJamaWt, reached:true }
  ];
  STAGE_SEQUENCE.forEach(function(st, i){
    if (st === 'STOCK_JAMA') return;
    var reached = false, qty = 0, wt = 0;
    if (st === 'PLATING'){ reached = true; qty = batchFwdQty; wt = batchFwdWt; }
    else {
      reached = i <= curIdx;
      if (reached) {
        if (st === 'RECEIVED_PLATING'){ qty = o.receivedQty; wt = o.receivedWeight; }
        else if (st === 'PACKING'){ qty = o.packingQty; wt = o.packingWeight; }
        else if (st === 'QC'){ qty = o.qcQty; wt = o.qcWeight; }
        else if (st === 'DISPATCH'){ qty = o.dispatchQty; wt = o.dispatchWeight; }
      }
    }
    rows.push({ key: st, label: STAGE_SHORT[st], qty: qty, weight: wt, reached: reached });
  });
  return rows;
}

function renderTotals(){ var el = $("totalsGrid"); if (el) el.innerHTML = ''; }

var activeStageFilter = 'all';

/* ============================================================
   ROLE-AWARE STATS RENDER
   ============================================================ */
function renderStats(){
  var list = buildPipeline();
  var bucket = {};
  STAGE_SEQUENCE.forEach(function(st){ bucket[st] = { orders:0, qty:0, weight:0 }; });
  list.forEach(function(o){
    if (!isSectionAllowed(o.stage)) return;
    if (!bucket[o.stage]) bucket[o.stage] = { orders:0, qty:0, weight:0 };
    bucket[o.stage].orders += 1;
    bucket[o.stage].qty    += o.currentQty;
    bucket[o.stage].weight += o.currentWeight;
  });
  var html = '';
  STAGE_SEQUENCE.forEach(function(st){
    if (!isSectionAllowed(st)) return;
    var b = bucket[st];
    var active = activeStageFilter === st ? ' active' : '';
    html += '<div class="stat-card'+active+'" data-stage="'+st+'">'
         +   '<div class="label"><i class="fas '+STAGE_ICON[st]+'"></i> '+STAGE_LABELS[st]+'</div>'
         +   '<div class="value">'+formatNumber(b.orders)+' <small style="font-size:12px;font-weight:600;color:#6c7480">'+(b.orders===1?'row':'rows')+'</small></div>'
         +   '<div class="sub">'
         +     '<div class="mini"><span>Qty</span><b>'+formatNumber(b.qty)+'</b></div>'
         +     '<div class="mini"><span>Weight</span><b>'+formatNumber(b.weight)+' g</b></div>'
         +   '</div>'
         + '</div>';
  });
  $("statsGrid").innerHTML = html;
  $("statsGrid").querySelectorAll('.stat-card').forEach(function(c){
    c.addEventListener('click', function(){
      activeStageFilter = c.dataset.stage;
      document.querySelectorAll('.tab').forEach(function(t){
        t.classList.toggle('active', t.dataset.stage === activeStageFilter);
      });
      renderStats(); renderPipeline();
    });
  });

  document.querySelectorAll('.tab').forEach(function(t){
    var st = t.dataset.stage;
    if (st === 'all'){
      t.style.display = IS_RESTRICTED ? 'none' : '';
    } else {
      t.style.display = isSectionAllowed(st) ? '' : 'none';
    }
  });
}

/* ============================================================
   ROLE-AWARE PIPELINE RENDER
   ============================================================ */
function renderPipeline(){
  var list = buildPipeline();

  if (IS_RESTRICTED){
    list = list.filter(function(o){ return isSectionAllowed(o.stage); });
  }
  if (activeStageFilter !== 'all') list = list.filter(function(o){ return o.stage === activeStageFilter; });

    var tbody = $("pipelineBody");
  if (!list.length){
    var msg;
    if (IS_RESTRICTED && activeStageFilter === 'all'){
      msg = 'No orders pending in your section(s).';
    } else if (activeStageFilter === 'all'){
      msg = 'No stock received yet from any branch.';
    } else {
      msg = 'No orders in this stage.';
    }
    tbody.innerHTML = '<tr><td colspan="9" class="empty-list">'+msg+'</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function(o){
    var lastDate = o.lastUpdate || (o.receivedDates && o.receivedDates[o.receivedDates.length-1] || '');
    var rcCell;
    if (o.rowType === 'BATCH'){
      rcCell = '<b class="rc-cell">'+escapeHtml(o.rootCard)+'</b>';
      if (o.batchCount > 1) rcCell += ' <small style="color:#6c7480;font-size:10px">Lot '+o.batchIndex+'/'+o.batchCount+'</small>';
    } else rcCell = '<span style="color:#bbb">—</span>';

    var jamaNote = '';
    if (o.rowType === 'JAMA_BALANCE'){
      jamaNote = '<div class="jama-note"><i class="fas fa-hourglass-half"></i> Remaining Jama Balance</div>';
    } else if (o.rowType === 'BATCH'){
      jamaNote = '<div class="jama-note" style="background:#d1e7dd;color:#0f5132;border-color:#badbcc"><i class="fas fa-check-circle"></i> Forwarded Lot '+o.batchIndex+'</div>';
    }

    var canAct = canForwardFromStage(o.stage);
    var actionCell = canAct
      ? '<button class="btn primary small" data-open="'+escapeHtml(o.orderId)+'" data-rowkey="'+escapeHtml(o.rowKey || '')+'" data-rowtype="'+o.rowType+'">Update</button>'
      : '<span style="color:#bbb;font-size:11px">View only</span>';

    return '<tr class="clickable" data-id="'+escapeHtml(o.orderId)+'" data-rowtype="'+o.rowType+'" data-rowkey="'+escapeHtml(o.rowKey || '')+'">'
         +   '<td>'+rcCell+'</td>'
         +   '<td><b>'+escapeHtml(o.orderNo)+'</b>'+jamaNote+'</td>'
         +   '<td>'+escapeHtml(o.branch)+'</td>'
         +   '<td>'+escapeHtml(o.group)+'</td>'
         +   '<td>'+formatNumber(o.currentQty)+'</td>'
         +   '<td>'+formatNumber(o.currentWeight)+'</td>'
         +   '<td><span class="badge '+STAGE_CLASS[o.stage]+'">'+STAGE_LABELS[o.stage]+'</span></td>'
         +   '<td>'+formatDateTime(lastDate)+'</td>'
         +   '<td>'+actionCell+'</td>'
         + '</tr>';
  }).join('');

  tbody.querySelectorAll('tr.clickable').forEach(function(tr){
    tr.addEventListener('click', function(e){
      if (e.target.tagName === 'BUTTON') return;
      openOrder(tr.dataset.id, tr.dataset.rowkey, tr.dataset.rowtype);
    });
  });
  tbody.querySelectorAll('[data-open]').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      openOrder(b.dataset.open, b.dataset.rowkey, b.dataset.rowtype);
    });
  });
}

/* ============================================================
   ORDER MODAL
   ============================================================ */
var currentOrder = null;

function openOrder(orderId, rowKey, rowType){
  var o = findOrderById(orderId);
  if (!o){ alert('Order not found.'); return; }
  currentOrder = o;

  currentOrder._openedRowKey  = rowKey  || null;
  currentOrder._openedRowType = rowType || null;

  currentOrder._openedBatch = null;
  if (currentOrder._openedRowType === 'BATCH' && rowKey){
    var parts = String(rowKey).split('::');
    var bid = (parts.length >= 4 && parts[2] === 'batch') ? parts[3] : null;
    var pool = (o.forwardBatches || []);
    if (bid) currentOrder._openedBatch = pool.find(function(b){ return b.id === bid; }) || null;
    if (!currentOrder._openedBatch && pool.length) currentOrder._openedBatch = pool[pool.length - 1];
  }

  var receivedDates = o.receivedDates.map(function(d){ return formatDateTime(d); }).join('<br>') || '—';
  var html = '<h2>ORDER '+escapeHtml(o.orderNo)+'</h2>';
  html += '<div class="detail-grid">'
       +    '<div><span class="k">Order No.</span><b>'+escapeHtml(o.orderNo)+'</b></div>'
       +    '<div><span class="k">Current Stage</span><b>'+STAGE_LABELS[o.stage]+'</b></div>'
       +    '<div><span class="k">Branch / Workshop</span><b>'+escapeHtml(o.branch)+'</b></div>'
       +    '<div><span class="k">Product Group</span><b>'+escapeHtml(o.group)+'</b></div>'
       +    '<div><span class="k">Order Date</span><b>'+formatDate(o.orderDate)+'</b></div>'
       +    '<div><span class="k">Stock Received</span><b>'+receivedDates+'</b></div>'
       +    '<div><span class="k">Total Received Qty</span><b>'+formatNumber(o.totalStockQty)+'</b></div>'
       +    '<div><span class="k">Total Received Wt (g)</span><b>'+formatNumber(o.totalWeight)+'</b></div>'
       +    '<div><span class="k">Jama Remaining Qty</span><b>'+formatNumber(o.jamaQty)+'</b></div>'
       +    '<div><span class="k">Jama Remaining Wt (g)</span><b>'+formatNumber(o.jamaWeight)+'</b></div>'
       +  '</div>';

  if (o.forwardBatches && o.forwardBatches.length){
    html += '<h3 style="color:#8c004c;font-size:14px;margin:16px 0 8px"><i class="fas fa-layer-group"></i> Forwarded Lots ('+o.forwardBatches.length+')</h3>';
    html += '<div style="overflow:auto"><table style="min-width:700px">'
         +   '<thead><tr><th>LOT #</th><th>ROOT CARD</th><th>QTY</th><th>WT (g)</th><th>CURRENT STAGE</th><th>LAST UPDATE</th><th>STATUS</th></tr></thead><tbody>';
    o.forwardBatches.forEach(function(b, i){
      var cancelled = o.cancelledRootCards.indexOf(b.rootCard) !== -1;
      var bStage = b.stage || 'PLATING';
      var hl = (currentOrder._openedBatch && currentOrder._openedBatch.id === b.id);
      html += '<tr'+(hl?' style="background:#fbf2f7"':'')+'>'
           +    '<td>'+ (i+1) +'</td>'
           +    '<td><b class="rc-cell">'+escapeHtml(b.rootCard)+'</b></td>'
           +    '<td>'+formatNumber(b.qty)+'</td>'
           +    '<td>'+formatNumber(b.wt)+'</td>'
           +    '<td><span class="badge '+STAGE_CLASS[bStage]+'">'+STAGE_LABELS[bStage]+'</span></td>'
           +    '<td>'+formatDateTime(b.lastUpdate || b.at)+'</td>'
           +    '<td>'+(cancelled?'<span style="color:#b3261e;font-weight:700">Cancelled</span>':'<span style="color:#137333;font-weight:700">Active</span>')+'</td>'
           +  '</tr>';
    });
    html += '</tbody></table></div>';
  }

  if (o.jamaQty > 0 || o.jamaWeight > 0){
    var fwdQty = 0, fwdWt = 0;
    o.forwardedEvents.forEach(function(ev){ fwdQty += n0(ev.qty); fwdWt += n0(ev.wt); });
    var scrQty = 0, scrWt = 0;
    o.scrapEvents.forEach(function(ev){ scrQty += n0(ev.qty); scrWt += n0(ev.wt); });

    html += '<div class="jama-summary">'
         +    '<div class="jama-card"><div class="k">JAMA BALANCE</div><div class="v">'+formatNumber(o.jamaQty)+' <small>pcs</small></div><div class="s">'+formatNumber(o.jamaWeight)+' g</div></div>'
         +    '<div class="jama-card ok"><div class="k">FORWARDED SO FAR</div><div class="v">'+formatNumber(fwdQty)+' <small>pcs</small></div><div class="s">'+formatNumber(fwdWt)+' g</div></div>'
         +    '<div class="jama-card scrap"><div class="k">SCRAPPED SO FAR</div><div class="v">'+formatNumber(scrQty)+' <small>pcs</small></div><div class="s">'+formatNumber(scrWt)+' g</div></div>'
         +  '</div>';
  }

  var itemsForDisplay = (o.jamaQty > 0)
                      ? o.jamaItems
                      : (o.editedItems && o.editedItems.length ? o.editedItems : o.items);
  var itemsTotalQty = 0, itemsTotalWt = 0;
  itemsForDisplay.forEach(function(it){
    itemsTotalQty += Number(it.jamaQty != null ? it.jamaQty : (it.stockQty || 0));
    itemsTotalWt  += Number(it.jamaWt  != null ? it.jamaWt  : (it.totalWt  || 0));
  });

  html += '<h3 style="color:#8c004c;font-size:14px;margin:18px 0 8px"><i class="fas fa-list"></i> Items'
       +  (o.jamaQty > 0 ? ' — REMAINING IN JAMA' : '') + '</h3>';
  html += '<div style="overflow:auto"><table style="min-width:800px">'
       +    '<thead><tr><th>SL</th><th>ART NO.</th><th>NAME</th><th>TOUCH</th><th>ORDER QTY</th><th>QTY</th><th>WT (g)</th><th>TOTAL WT (g)</th></tr></thead>'
       +    '<tbody>'
       +    itemsForDisplay.map(function(it, i){
              var q = it.jamaQty != null ? it.jamaQty : (it.stockQty || 0);
              var w = it.jamaWt  != null ? it.jamaWt  : (it.totalWt  || 0);
              return '<tr><td>'+(i+1)+'</td><td>'+escapeHtml(it.artNo)+'</td>'
                   + '<td style="text-align:left">'+escapeHtml(it.name)+'</td>'
                   + '<td>'+escapeHtml(it.touch || '—')+'</td>'
                   + '<td>'+formatNumber(it.orderQty)+'</td>'
                   + '<td>'+formatNumber(q)+'</td>'
                   + '<td>'+formatNumber(it.weight)+'</td>'
                   + '<td>'+formatNumber(w)+'</td></tr>';
            }).join('')
       +    '</tbody>'
       +    '<tfoot><tr style="font-weight:800;background:#f7f4fb">'
       +      '<td colspan="5" style="text-align:right">GRAND TOTAL:</td>'
       +      '<td>'+formatNumber(itemsTotalQty)+'</td><td></td>'
       +      '<td>'+formatNumber(itemsTotalWt)+'</td>'
       +    '</tr></tfoot></table></div>';

  $("stepModalContent").innerHTML = html;

  var effStage = (currentOrder._openedRowType === 'BATCH' && currentOrder._openedBatch)
    ? (currentOrder._openedBatch.stage || 'PLATING')
    : (currentOrder._openedRowType === 'JAMA_BALANCE' ? 'STOCK_JAMA' : o.stage);

  var curIdx = STAGE_SEQUENCE.indexOf(effStage);
  if (curIdx < 0) curIdx = 0;
  var progressHtml = STAGE_SEQUENCE.map(function(st, i){
    var cls = i < curIdx ? 'done' : (i === curIdx ? 'active' : '');
    var icon = i < curIdx ? 'fa-check-circle' : (i === curIdx ? 'fa-dot-circle' : 'fa-circle');
    return '<div class="stage-step '+cls+'"><i class="fas '+icon+'"></i> '+STAGE_LABELS[st]+'</div>';
  }).join('<i class="fas fa-chevron-right" style="color:#c6cbd3"></i>');
  $("stageProgress").innerHTML = progressHtml;

  var history = getStage2History();
  var log = Array.isArray(history[o.orderId]) ? history[o.orderId] : [];
  var histHtml = '<h4><i class="fas fa-history"></i> Full Tracking History</h4><ul>';
  if (log.length){
    log.slice().reverse().forEach(function(entry){
      var tag = entry.kind === 'scrap' ? '🗑 '
              : entry.kind === 'partial' ? '↪ '
              : entry.kind === 'cancel' ? '↺ ' : '';
      histHtml += '<li>'
               +   '<div class="hleft">'
               +     '<b>'+tag+escapeHtml(entry.label || STAGE_LABELS[entry.stage] || entry.stage)+'</b>'
               +     (entry.by ? ' <small style="color:#6c7480">by '+escapeHtml(entry.by)+'</small>' : '')
               +     (entry.rootCard ? '<div class="hmeta"><i class="fas fa-tag"></i> Root Card: '+escapeHtml(entry.rootCard)+'</div>' : '')
               +     '<div class="hmeta">Qty: <b>'+formatNumber(entry.qty||0)+'</b> &nbsp;·&nbsp; Weight: <b>'+formatNumber(entry.weight||0)+' g</b></div>'
               +     (entry.note ? '<div class="hmeta"><i class="fas fa-comment"></i> '+escapeHtml(entry.note)+'</div>' : '')
               +   '</div>'
               +   '<div class="hright">'+formatDateTime(entry.at)+'</div></li>';
    });
  } else histHtml += '<li style="color:#999">No history yet.</li>';
  histHtml += '</ul>';
  $("stepHistoryBox").innerHTML = histHtml;

  var btn = $("advanceStepBtn");
  var isJamaRow  = (currentOrder._openedRowType === 'JAMA_BALANCE');
  var isBatchRow = (currentOrder._openedRowType === 'BATCH');
  var effStageIdx = STAGE_SEQUENCE.indexOf(effStage);
  if (effStageIdx < 0) effStageIdx = 0;

  var canActHere = canForwardFromStage(effStage);

  if (!canActHere){
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-lock"></i> Not your section';
    btn.dataset.next = '';
  } else if (isJamaRow || effStage === 'STOCK_JAMA'){
    if (IS_RESTRICTED && CURRENT_ROLE !== 'stock_jama_incharge'){
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-lock"></i> Stock Jama only';
      btn.dataset.next = '';
    } else {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-arrow-right"></i> Forward';
      btn.dataset.next = 'PLATING';
    }
  } else if (effStage === 'DISPATCH'){
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-check"></i> Fully Dispatched';
    btn.dataset.next = '';
  } else {
    var nextIdx = effStageIdx + 1;
    if (nextIdx < STAGE_SEQUENCE.length){
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-arrow-right"></i> Forward to '+STAGE_LABELS[STAGE_SEQUENCE[nextIdx]];
      btn.dataset.next = STAGE_SEQUENCE[nextIdx];
    } else {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-check"></i> Fully Dispatched';
      btn.dataset.next = '';
    }
  }

  var cancelBtn = $("cancelStageBtn");
  if (cancelBtn){
    var canCancel = (!IS_RESTRICTED) || CURRENT_ROLE === 'stock_jama_incharge';
    if (!canCancel){
      cancelBtn.style.display = 'none';
    } else {
      cancelBtn.style.display = '';
      if (o.stage === 'STOCK_JAMA' && !o.forwardBatches.length){
        cancelBtn.disabled = true;
        cancelBtn.innerHTML = '<i class="fas fa-ban"></i> Already in Stock Jama';
      } else {
        cancelBtn.disabled = false;
        cancelBtn.innerHTML = '<i class="fas fa-ban"></i> Cancel &amp; Return to Stock Jama';
      }
    }
  }

  $("stepMessage").classList.remove('show');
  $("stepModal").classList.remove('hidden');
}

function closeStepModal(){ $("stepModal").classList.add('hidden'); currentOrder = null; }

var pendingNextStage = null;

function advanceStep(){
  if (!currentOrder) return;
  var nextStage = $("advanceStepBtn").dataset.next;
  if (!nextStage) return;

  var effStage = (currentOrder._openedRowType === 'BATCH' && currentOrder._openedBatch)
    ? (currentOrder._openedBatch.stage || 'PLATING')
    : (currentOrder._openedRowType === 'JAMA_BALANCE' ? 'STOCK_JAMA' : currentOrder.stage);
  if (!canForwardFromStage(effStage)){
    alert('You are not allowed to forward from this section.');
    return;
  }

  pendingNextStage = nextStage;

  var isJamaRow  = (currentOrder._openedRowType === 'JAMA_BALANCE');
  var isBatchRow = (currentOrder._openedRowType === 'BATCH');
  var inStockJama = (currentOrder.stage === 'STOCK_JAMA');

  if (isJamaRow || inStockJama){
    openEditItemsModal(nextStage, true);
  } else if (isBatchRow && currentOrder._openedBatch){
    openBatchAdvanceModal(nextStage);
  } else {
    openEditItemsModal(nextStage, false);
  }
}

/* ============================================================
   BATCH ADVANCE
   ============================================================ */
function openBatchAdvanceModal(nextStage){
  if (!currentOrder || !currentOrder._openedBatch){
    alert('No batch selected. Please click a BATCH row first.');
    return;
  }
  var batch = currentOrder._openedBatch;

  var srcItems = Array.isArray(batch.items) && batch.items.length
    ? batch.items
    : (currentOrder.items || []);

  editItemsMode = 'normal';
  editItemsState = srcItems.map(function(it){
    return {
      artNo: it.artNo, name: it.name, touch: it.touch || '',
      orderQty: n0(it.orderQty),
      stockQty: intQty(it.qty != null ? it.qty : it.stockQty),
      weight: wt2(it.weight),
      totalWt: wt2(it.wt != null ? it.wt : it.totalWt),
      forwardQty: 0, forwardWt: 0, scrapQty: 0, scrapWt: 0
    };
  });

  $("editItemsOrderNo").textContent   = currentOrder.orderNo;
  $("editItemsRootCard").textContent  = batch.rootCard || '—';
  $("editItemsNote").value = '';
  $("editItemsStageHeader").textContent = 'FORWARD TO ' + STAGE_LABELS[nextStage];

  var helpEl = $("editItemsModeHelp");
  if (helpEl){
    helpEl.innerHTML = 'Confirm the qty and weight for <b>Lot '+escapeHtml(batch.rootCard)+'</b> '
      + 'before moving it to <b>'+STAGE_LABELS[nextStage]+'</b>. '
      + 'You can adjust the <b>Stock Qty</b> and <b>Total WT</b> if the physical count differs.';
  }

  var rcRow = $("editItemsRootCardRow");
  if (rcRow) rcRow.style.display = 'none';

  var printBtn = $("editItemsPrintBtn");
  var pdfBtn   = $("editItemsPdfBtn");
  if (printBtn) printBtn.onclick = function(){ printStageStatement(nextStage); };
  if (pdfBtn)   pdfBtn.onclick   = function(){ downloadStageStatementPDF(nextStage); };

  var table = $("editItemsTable");
  if (table) table.classList.remove('jama-mode');

  var quick = document.querySelector('.edit-items-quick');
  if (quick) quick.style.display = 'none';

  renderEditItemsRows();
  $("editItemsModal").classList.remove('hidden');
}

function confirmBatchAdvance(nextStage, totQty, totWt, note){
  if (!currentOrder || !currentOrder._openedBatch) return;

  var state = getStage2Orders();
  if (!state[currentOrder.orderId]) state[currentOrder.orderId] = {};
  var st = state[currentOrder.orderId];
  if (!Array.isArray(st.forwardBatches)) st.forwardBatches = [];

  var batchId = currentOrder._openedBatch.id;
  var idx = st.forwardBatches.findIndex(function(b){ return b.id === batchId; });
  if (idx === -1){
    idx = st.forwardBatches.findIndex(function(b){ return b.rootCard === currentOrder._openedBatch.rootCard; });
  }
  if (idx === -1){ alert('Batch not found in state — nothing was saved.'); return; }

  var b = st.forwardBatches[idx];
  b.stage = nextStage;
  b.lastUpdate = nowISO();
  b.qty = intQty(totQty);
  b.wt  = wt2(totWt);
  b.advanceHistory = Array.isArray(b.advanceHistory) ? b.advanceHistory : [];
  b.advanceHistory.push({ stage: nextStage, at: b.lastUpdate, by: CURRENT_USER, qty: b.qty, wt: b.wt, note: note || '' });

  st.forwardBatches[idx] = b;

  var stages = st.forwardBatches.map(function(x){ return x.stage || 'PLATING'; });
  var uniq = {};
  stages.forEach(function(s){ uniq[s] = true; });
  var order_seq = ['PLATING','RECEIVED_PLATING','PACKING','QC','DISPATCH'];
  var minStage = null;
  for (var i = 0; i < order_seq.length; i++){
    if (uniq[order_seq[i]]) { minStage = order_seq[i]; break; }
  }
  if (minStage) st.stage = minStage;

  st.currentQty = intQty(totQty);
  st.currentWeight = wt2(totWt);
  st.lastUpdate = nowISO();

  state[currentOrder.orderId] = st;
  saveStage2Orders(state);

  var hist = getStage2History();
  if (!Array.isArray(hist[currentOrder.orderId])) hist[currentOrder.orderId] = [];
  hist[currentOrder.orderId].push({
    stage: nextStage, label: 'Lot '+b.rootCard+' → '+STAGE_LABELS[nextStage],
    at: nowISO(), by: CURRENT_USER, qty: totQty, weight: totWt,
    note: note || '', rootCard: b.rootCard
  });
  saveStage2History(hist);

  closeEditItemsModal();

  var msg = $("stepMessage");
  if (msg){
    msg.textContent = 'Lot '+b.rootCard+' forwarded to '+STAGE_LABELS[nextStage]+'.';
    msg.classList.remove('error');
    msg.classList.add('show');
  }

  setTimeout(function(){
    closeStepModal();
    renderTotals(); renderStats(); renderPipeline();
  }, 700);
}

/* ============================================================
   CANCEL ORDER
   ============================================================ */
function cancelCurrentOrder(){
  if (!currentOrder) return;
  if (IS_RESTRICTED && CURRENT_ROLE !== 'stock_jama_incharge'){
    alert('Only the Stock Jama In-charge can cancel an order back to Stock Jama.');
    return;
  }
  var o = currentOrder;
  if (o.stage === 'STOCK_JAMA' && !o.forwardBatches.length){
    alert('This order is already in Stock Jama.'); return;
  }
  var reason = prompt('Cancel this order and return it to Stock Jama?\n\n'
                    + 'ORDER: ' + o.orderNo + '\n'
                    + 'CURRENT STAGE: ' + STAGE_LABELS[o.stage] + '\n\n'
                    + 'All root cards used by this order will be freed.\n\n'
                    + 'Enter a cancellation reason (optional):', '');
  if (reason === null) return;

  var now = nowISO();
  clearJamaInCompletedMap(o.orderId);

  var cards = getRootCards();
  var cancelledRCs = Array.isArray(o.allRootCards) ? o.allRootCards.slice() : [];
  cancelledRCs.forEach(function(rc){ delete cards[rc]; });
  saveRootCards(cards);

  var restoredJamaItems = (o.items || []).map(function(it){
    return {
      artNo: it.artNo, name: it.name, touch: it.touch,
      orderQty: n0(it.orderQty), weight: wt2(it.weight),
      jamaQty: intQty(it.stockQty), jamaWt: wt2(it.totalWt)
    };
  }).filter(function(it){ return it.jamaQty > 0 || it.jamaWt > 0; });

  var restoredTotals = jamaBalanceTotals(restoredJamaItems);

  var state = getStage2Orders();
  if (!state[o.orderId]) state[o.orderId] = {};
  var st = state[o.orderId];
  st.stage = 'STOCK_JAMA';
  st.currentQty = restoredTotals.qty;
  st.currentWeight = restoredTotals.wt;
  st.jamaItems = restoredJamaItems;
  st.lastUpdate = now;
  st.rootCard = '';
  st.rootCardDate = '';
  if (!Array.isArray(st.cancelEvents)) st.cancelEvents = [];
  st.cancelEvents.push({ at: now, by: CURRENT_USER, fromStage: o.stage, reason: reason || '', qty: o.currentQty, wt: o.currentWeight, rootCards: cancelledRCs });
  if (!Array.isArray(st.cancelledRootCards)) st.cancelledRootCards = [];
  cancelledRCs.forEach(function(rc){ if (st.cancelledRootCards.indexOf(rc) === -1) st.cancelledRootCards.push(rc); });
  st.forwardBatches = [];
  state[o.orderId] = st;
  saveStage2Orders(state);

  var hist = getStage2History();
  if (!Array.isArray(hist[o.orderId])) hist[o.orderId] = [];
  hist[o.orderId].push({
    stage: 'STOCK_JAMA', kind: 'cancel',
    label: 'Cancelled from ' + STAGE_LABELS[o.stage] + ' — returned to Stock Jama',
    at: now, by: CURRENT_USER, qty: o.currentQty, weight: o.currentWeight,
    note: reason || '', rootCard: cancelledRCs.join(', ')
  });
  saveStage2History(hist);

  closeStepModal();
  renderStats(); renderPipeline();

  setTimeout(function(){
    alert('Order ' + o.orderNo + ' returned to Stock Jama.\n\n'
        + 'Restored Qty: ' + formatNumber(restoredTotals.qty) + ' pcs\n'
        + 'Restored Wt: ' + formatNumber(restoredTotals.wt) + ' g\n\n'
        + (cancelledRCs.length ? 'Freed root cards: ' + cancelledRCs.join(', ') : 'No root cards to free.'));
  }, 200);
}

/* ============================================================
   EDIT ITEMS MODAL
   ============================================================ */
var editItemsState = [];
var editItemsMode = 'normal';
var editItemsNewRootCard = '';

function openEditItemsModal(nextStage, isJamaMode){
  if (!currentOrder) return;
  editItemsMode = isJamaMode ? 'jama' : 'normal';

  var source;
  if (isJamaMode) source = currentOrder.jamaItems || [];
  else source = (currentOrder.editedItems && currentOrder.editedItems.length)
              ? currentOrder.editedItems : currentOrder.items;

  editItemsState = source.map(function(it){
    if (isJamaMode){
      var bQ = intQty(it.jamaQty), bW = wt2(it.jamaWt);
      if (bQ === 0 && bW === 0){ bQ = intQty(it.stockQty); bW = wt2(it.totalWt); }
      return {
        artNo: it.artNo, name: it.name, touch: it.touch,
        orderQty: n0(it.orderQty), weight: wt2(it.weight),
        balanceQty: bQ, balanceWt: bW,
        forwardQty: 0, forwardWt: 0, scrapQty: 0, scrapWt: 0
      };
    }
    return {
      artNo: it.artNo, name: it.name, touch: it.touch,
      orderQty: n0(it.orderQty), stockQty: intQty(it.stockQty),
      weight: wt2(it.weight),
      totalWt: wt2(it.totalWt != null ? it.totalWt : (n0(it.stockQty) * n0(it.weight))),
      forwardQty: 0, forwardWt: 0, scrapQty: 0, scrapWt: 0
    };
  });

  $("editItemsOrderNo").textContent   = currentOrder.orderNo;
  $("editItemsRootCard").textContent  = currentOrder.activeRootCard || '— (new on this forward)';
  $("editItemsNote").value = '';
  var stageLabel = nextStage ? STAGE_LABELS[nextStage] : 'STOCK QTY & TOTAL WT';
  $("editItemsStageHeader").textContent = 'FORWARD TO ' + stageLabel;

  var helpEl = $("editItemsModeHelp");
  if (helpEl){
    helpEl.innerHTML = isJamaMode
      ? 'Enter <b>Forward Qty</b> / <b>Forward WT</b> to send that batch to Plating. A <b>new root card</b> is auto-generated for every forward batch. '
      + 'Enter <b>Scrap Qty</b> / <b>Scrap WT</b> to permanently deduct items. '
      + '<br><b>Qty is always a whole number; weight allows 2 decimals.</b>'
      : 'Adjust each row\'s <b>Stock Qty</b> and <b>Total WT (g)</b> before forwarding. '
      + '<br><b>Qty is always a whole number; weight allows 2 decimals.</b>';
  }

  var rcRow = $("editItemsRootCardRow");
  if (rcRow) rcRow.style.display = 'none';

  var printBtn = $("editItemsPrintBtn");
  var pdfBtn   = $("editItemsPdfBtn");
  if (printBtn) printBtn.onclick = function(){ printStageStatement(nextStage); };
  if (pdfBtn)   pdfBtn.onclick   = function(){ downloadStageStatementPDF(nextStage); };

  var table = $("editItemsTable");
  if (table) table.classList.toggle('jama-mode', isJamaMode);

  var quick = document.querySelector('.edit-items-quick');
  if (quick) quick.style.display = isJamaMode ? 'flex' : 'none';

  renderEditItemsRows();
  $("editItemsModal").classList.remove('hidden');
}

function renderEditItemsRows(){
  var body = $("editItemsBody");
  if (editItemsMode === 'jama'){
    body.innerHTML = editItemsState.map(function(it, i){
      return '<tr data-idx="'+i+'">'
           +   '<td class="col-sl">'+(i+1)+'</td>'
           +   '<td class="col-art">'+escapeHtml(it.artNo)+'</td>'
           +   '<td class="name col-name">'+escapeHtml(it.name)+'</td>'
           +   '<td class="bal-cell col-bal">'+formatNumber(it.balanceQty)+'</td>'
           +   '<td class="bal-cell col-bal">'+formatNumber(it.balanceWt)+'</td>'
           +   '<td class="col-fwd"><input type="number" min="0" step="1"    data-edit="forwardQty" data-idx="'+i+'" value="'+it.forwardQty+'"></td>'
           +   '<td class="col-fwd"><input type="number" min="0" step="0.01" data-edit="forwardWt"  data-idx="'+i+'" value="'+it.forwardWt+'"></td>'
           +   '<td class="col-scrap"><input type="number" min="0" step="1"    data-edit="scrapQty"   data-idx="'+i+'" value="'+it.scrapQty+'"></td>'
           +   '<td class="col-scrap"><input type="number" min="0" step="0.01" data-edit="scrapWt"    data-idx="'+i+'" value="'+it.scrapWt+'"></td>'
           + '</tr>';
    }).join('');
    } else {
    body.innerHTML = editItemsState.map(function(it, i){
      return '<tr data-idx="'+i+'">'
           +   '<td class="col-sl">'+(i+1)+'</td>'
           +   '<td class="col-art">'+escapeHtml(it.artNo)+'</td>'
           +   '<td class="name col-name">'+escapeHtml(it.name)+'</td>'
           +   '<td class="col-bal"><input type="number" min="0" step="1" data-edit="stockQty" data-idx="'+i+'" value="'+it.stockQty+'"></td>'
           +   '<td class="col-bal">'+formatNumber(it.weight)+'</td>'
           +   '<td class="col-fwd"><input type="number" min="0" step="0.01" data-edit="totalWt" data-idx="'+i+'" value="'+it.totalWt+'"></td>'
           +   '<td class="col-scrap"></td>'
           +   '<td class="col-scrap"></td>'
           + '</tr>';
    }).join('');
  }

  body.querySelectorAll('input[data-edit]').forEach(function(inp){
    inp.addEventListener('input', function(){
      var idx = Number(inp.dataset.idx);
      var field = inp.dataset.edit;
      var v = Number(inp.value || 0);
      if (!Number.isFinite(v) || v < 0) v = 0;

      if (editItemsMode === 'jama'){
        var row = editItemsState[idx];
        if (field === 'forwardQty' || field === 'scrapQty'){
          v = intQty(v);
          if (field === 'forwardQty'){
            var maxQ = Math.max(0, row.balanceQty - row.scrapQty);
            if (v > maxQ) v = maxQ;
          } else {
            var maxSQ = Math.max(0, row.balanceQty - row.forwardQty);
            if (v > maxSQ) v = maxSQ;
          }
        } else {
          v = wt2(v);
          if (field === 'forwardWt'){
            var maxW = Math.max(0, row.balanceWt - row.scrapWt);
            if (v > maxW) v = wt2(maxW);
          } else {
            var maxSW = Math.max(0, row.balanceWt - row.forwardWt);
            if (v > maxSW) v = wt2(maxSW);
          }
        }
        row[field] = v; inp.value = v;
      } else {
        if (field === 'stockQty'){ v = intQty(v); editItemsState[idx][field] = v; inp.value = v; }
        else { v = wt2(v); editItemsState[idx][field] = v; inp.value = v; }
      }
      updateEditItemsTotals();
    });
  });

  updateEditItemsTotals();
}

function computeJamaSums(){
  var balQty = 0, balWt = 0, fwdQty = 0, fwdWt = 0, scrQty = 0, scrWt = 0;
  editItemsState.forEach(function(it){
    balQty += intQty(it.balanceQty); balWt += wt2(it.balanceWt);
    fwdQty += intQty(it.forwardQty); fwdWt += wt2(it.forwardWt);
    scrQty += intQty(it.scrapQty);   scrWt += wt2(it.scrapWt);
  });
  return {
    balQty: balQty, balWt: wt2(balWt),
    fwdQty: fwdQty, fwdWt: wt2(fwdWt),
    scrQty: scrQty, scrWt: wt2(scrWt),
    remQty: Math.max(0, balQty - fwdQty - scrQty),
    remWt:  wt2(Math.max(0, balWt  - fwdWt  - scrWt))
  };
}

function updateEditItemsTotals(){
  if (editItemsMode === 'jama'){
    var s = computeJamaSums();
    $("editItemsTotalQty").textContent = formatNumber(s.balQty);
    $("editItemsTotalWt").textContent  = formatNumber(s.balWt);
    $("editItemsFwdQtyInputTotal").textContent   = formatNumber(s.fwdQty);
    $("editItemsFwdWtInputTotal").textContent    = formatNumber(s.fwdWt);
    $("editItemsScrapQtyInputTotal").textContent = formatNumber(s.scrQty);
    $("editItemsScrapWtInputTotal").textContent  = formatNumber(s.scrWt);
    $("editItemsBalQty").textContent    = formatNumber(s.balQty);
    $("editItemsBalWt").textContent     = formatNumber(s.balWt);
    $("editItemsFwdQty").textContent    = formatNumber(s.fwdQty);
    $("editItemsFwdWt").textContent     = formatNumber(s.fwdWt);
    $("editItemsScrapQty").textContent  = formatNumber(s.scrQty);
    $("editItemsScrapWt").textContent   = formatNumber(s.scrWt);
    $("editItemsRemQty").textContent    = formatNumber(s.remQty);
    $("editItemsRemWt").textContent     = formatNumber(s.remWt);
  } else {
    var totQty = 0, totWt = 0;
    editItemsState.forEach(function(it){ totQty += intQty(it.stockQty); totWt += wt2(it.totalWt); });
    $("editItemsTotalQty").textContent = formatNumber(totQty);
    $("editItemsTotalWt").textContent  = formatNumber(wt2(totWt));
  }
}

function closeEditItemsModal(){ $("editItemsModal").classList.add('hidden'); }

function confirmEditItems(){
  if (!currentOrder) return;
  if (editItemsMode === 'jama') return confirmJamaForwardScrap();

  var totQty = 0, totWt = 0;
  editItemsState.forEach(function(it){ totQty += intQty(it.stockQty); totWt += wt2(it.totalWt); });
  totQty = intQty(totQty); totWt = wt2(totWt);
  if (!Number.isFinite(totQty) || totQty < 0){ alert('Invalid total quantity.'); return; }
  if (!Number.isFinite(totWt)  || totWt  < 0){ alert('Invalid total weight.'); return; }

  var note = $("editItemsNote").value.trim();
  var nextStage = pendingNextStage;

  if (currentOrder._openedRowType === 'BATCH' && currentOrder._openedBatch){
    return confirmBatchAdvance(nextStage, totQty, totWt, note);
  }

  var state = getStage2Orders();
  if (!state[currentOrder.orderId]) state[currentOrder.orderId] = {};
  state[currentOrder.orderId].editedItems = editItemsState.slice();
  saveStage2Orders(state);

  currentOrder.editedItems = editItemsState.slice();
  currentOrder.currentQty = totQty;
  currentOrder.currentWeight = totWt;

  closeEditItemsModal();
  applyStageChange(currentOrder.orderId, nextStage, { qty: totQty, weight: totWt, note: note });
}

/* ============================================================
   JAMA FORWARD (creates a new batch)
   ============================================================ */
function confirmJamaForwardScrap(){
  var s = computeJamaSums();
  var note = $("editItemsNote").value.trim();
  var msgBox = $("stepMessage");

  if (s.fwdQty <= 0 && s.fwdWt <= 0 && s.scrQty <= 0 && s.scrWt <= 0){
    alert('Enter either a Forward or a Scrap quantity / weight before confirming.'); return;
  }
  if (s.fwdQty > s.balQty || s.fwdWt > s.balWt || s.scrQty > s.balQty || s.scrWt > s.balWt){
    alert('Forward/Scrap quantity exceeds Jama balance.'); return;
  }

  var isForwarding = (s.fwdQty > 0 || s.fwdWt > 0);
  if (isForwarding){
    if (!confirm('Confirm FORWARD?\n\n'
      + 'Forward Qty: ' + formatNumber(s.fwdQty) + ' pcs\n'
      + 'Forward WT: ' + formatNumber(s.fwdWt) + ' g\n'
      + 'Remaining in Jama: ' + formatNumber(s.remQty) + ' pcs / ' + formatNumber(s.remWt) + ' g\n\n'
      + 'A new ROOT CARD will be auto-allotted.')) return;
  } else {
    if (!confirm('Confirm SCRAP?\n\n'
      + 'Scrap Qty: ' + formatNumber(s.scrQty) + ' pcs\n'
      + 'Scrap WT: ' + formatNumber(s.scrWt) + ' g\n\n'
      + 'This action cannot be undone.')) return;
  }

  var newRootCard = suggestRootCard();
  var cards = getRootCards();
  while (cards[newRootCard] && cards[newRootCard] !== currentOrder.orderId){
    consumeRootCard(); newRootCard = suggestRootCard();
  }
  if (isForwarding){
    cards[newRootCard] = currentOrder.orderId;
    saveRootCards(cards);
    consumeRootCard();
    markOrderInStockJama(currentOrder.orderId);
  }

  var state = getStage2Orders();
  if (!state[currentOrder.orderId]) state[currentOrder.orderId] = {};
  var st = state[currentOrder.orderId];

  if (!Array.isArray(st.jamaItems) || !st.jamaItems.length){
    st.jamaItems = (currentOrder.jamaItems || []).map(toJamaItem);
  }
  if (!Array.isArray(st.forwardBatches)) st.forwardBatches = [];
  if (!Array.isArray(st.forwardedEvents)) st.forwardedEvents = [];
  if (!Array.isArray(st.scrapEvents)) st.scrapEvents = [];

  var now = nowISO();
  var fwdItems = [], scrapItems = [];

  function findSrcRow(row, i){
    var byArt = null;
    for (var j = 0; j < st.jamaItems.length; j++){
      if (st.jamaItems[j].artNo === row.artNo){ byArt = st.jamaItems[j]; break; }
    }
    return byArt || st.jamaItems[i] || null;
  }

  editItemsState.forEach(function(row, i){
    var src = findSrcRow(row, i);
    if (!src) return;
    var fq = intQty(row.forwardQty), fw = wt2(row.forwardWt);
    var sq = intQty(row.scrapQty),   sw = wt2(row.scrapWt);
    if (fq === 0 && fw === 0 && sq === 0 && sw === 0) return;

    src.jamaQty = Math.max(0, intQty(src.jamaQty) - fq - sq);
    src.jamaWt  = wt2(Math.max(0, wt2(src.jamaWt) - fw - sw));

    if (fq > 0 || fw > 0){
      fwdItems.push({ artNo: row.artNo, name: row.name, touch: row.touch, qty: fq, wt: fw, orderQty: row.orderQty, weight: wt2(row.weight) });
    }
    if (sq > 0 || sw > 0){
      scrapItems.push({ artNo: row.artNo, name: row.name, touch: row.touch, qty: sq, wt: sw, orderQty: row.orderQty, weight: wt2(row.weight) });
    }
  });

  var remainingItems = st.jamaItems.filter(function(it){ return it.jamaQty > 0 || it.jamaWt > 0; });
  var remTotals = jamaBalanceTotals(remainingItems);

  if (isForwarding){
    st.forwardBatches.push({
      id: uid(),
      rootCard: newRootCard,
      at: now, by: CURRENT_USER,
      stage: 'PLATING',
      qty: s.fwdQty, wt: s.fwdWt,
      items: fwdItems,
      note: note,
      isFinal: (remTotals.qty <= 0 && remTotals.wt <= 0),
      jamaCompletedQty: currentOrder.totalStockQty,
      jamaCompletedWt: currentOrder.totalWeight,
      lastUpdate: now,
      advanceHistory: [{ stage: 'PLATING', at: now, by: CURRENT_USER, qty: s.fwdQty, wt: s.fwdWt, note: note }]
    });
    st.rootCard = newRootCard;
    st.rootCardDate = todayISO();
    st.forwardedEvents.push({
      at: now, by: CURRENT_USER,
      qty: s.fwdQty, wt: s.fwdWt, items: fwdItems, note: note,
      isFinal: (remTotals.qty <= 0 && remTotals.wt <= 0),
      rootCard: newRootCard
    });
  }

  if (scrapItems.length){
    st.scrapEvents.push({
      at: now, by: CURRENT_USER,
      qty: s.scrQty, wt: s.scrWt, items: scrapItems, note: note,
      rootCard: newRootCard || ''
    });
  }

  st.jamaItems = remainingItems.map(toJamaItem);

  var fullyForwarded = isForwarding && (remTotals.qty <= 0 && remTotals.wt <= 0);
  var fullyScrapped  = !isForwarding && (remTotals.qty <= 0 && remTotals.wt <= 0);

  if (fullyForwarded){
    st.stage = 'PLATING';
    st.platingQty = intQty((st.platingQty || 0) + s.fwdQty);
    st.platingWeight = wt2((st.platingWeight || 0) + s.fwdWt);
    st.currentQty = s.fwdQty;
    st.currentWeight = s.fwdWt;
  } else if (fullyScrapped){
    st.stage = 'SCRAPPED';
    st.currentQty = 0; st.currentWeight = 0;
  } else {
    st.stage = 'STOCK_JAMA';
    st.currentQty = remTotals.qty;
    st.currentWeight = remTotals.wt;
  }
  st.lastUpdate = now;

  state[currentOrder.orderId] = st;
  saveStage2Orders(state);

  if (isForwarding){
    var allRc = (currentOrder.allRootCards || []).slice();
    if (newRootCard && allRc.indexOf(newRootCard) === -1) allRc.push(newRootCard);
    markJamaInCompletedMap(currentOrder.orderId, { at: now, by: CURRENT_USER, qty: s.fwdQty, wt: s.fwdWt, rootCards: allRc });
  }
  if (fullyScrapped){
    markJamaInCompletedMap(currentOrder.orderId, { at: now, by: CURRENT_USER, qty: 0, wt: 0, rootCards: (currentOrder.allRootCards || []).slice() });
  }

  var hist = getStage2History();
  if (!Array.isArray(hist[currentOrder.orderId])) hist[currentOrder.orderId] = [];
  if (scrapItems.length){
    hist[currentOrder.orderId].push({
      stage: currentOrder.stage, kind: 'scrap', label: 'Scrapped',
      at: now, by: CURRENT_USER, qty: s.scrQty, weight: s.scrWt, note: note,
      rootCard: newRootCard || ''
    });
  }
  if (isForwarding){
    hist[currentOrder.orderId].push({
      stage: 'PLATING', kind: 'partial',
      label: 'Forwarded Lot to Plating',
      at: now, by: CURRENT_USER, qty: s.fwdQty, weight: s.fwdWt, note: note,
      rootCard: newRootCard
    });
  }
  saveStage2History(hist);

  if (isForwarding){
    var snaps = getJamaReports();
    snaps.push({
      rootCard: newRootCard, orderId: currentOrder.orderId,
      orderNo: currentOrder.orderNo, branch: currentOrder.branch,
      group: currentOrder.group, orderDate: currentOrder.orderDate,
      jamaDate: todayISO(), jamaAt: now,
      qty: s.fwdQty, weight: s.fwdWt, note: note, by: CURRENT_USER
    });
    saveJamaReports(snaps);
  }

  var summary = [];
  if (isForwarding) summary.push('Forwarded '+formatNumber(s.fwdQty)+' pcs / '+formatNumber(s.fwdWt)+' g');
  if (s.scrQty > 0 || s.scrWt > 0) summary.push('Scrapped '+formatNumber(s.scrQty)+' pcs / '+formatNumber(s.scrWt)+' g');
  if (remTotals.qty > 0 || remTotals.wt > 0) summary.push('Remaining in Jama: '+formatNumber(remTotals.qty)+' pcs / '+formatNumber(remTotals.wt)+' g');
  if (isForwarding) summary.push('New Root Card: '+newRootCard);
  if (msgBox){
    msgBox.textContent = summary.join(' · ');
    msgBox.classList.remove('error');
    msgBox.classList.add('show');
  }

  closeEditItemsModal();

  if (isForwarding){
    var byProduct = {};
    fwdItems.forEach(function(it){
      var key = String(it.name || it.artNo || '—');
      if (!byProduct[key]) byProduct[key] = { name: key, qty: 0, wt: 0 };
      byProduct[key].qty += n0(it.qty);
      byProduct[key].wt  += n0(it.wt);
    });
    var sumQty = 0, sumWt = 0;
    Object.keys(byProduct).forEach(function(k){ sumQty += byProduct[k].qty; sumWt += byProduct[k].wt; });

    var batchSnapshot = { rootCard: newRootCard, qty: s.fwdQty, wt: s.fwdWt, jamaCompletedQty: currentOrder.totalStockQty, jamaCompletedWt: currentOrder.totalWeight };
    var snapshot = {
      rootCard: newRootCard, orderNo: currentOrder.orderNo,
      branch: currentOrder.branch, group: currentOrder.group,
      orderDate: currentOrder.orderDate,
      qty: s.fwdQty, weight: s.fwdWt, note: note, by: CURRENT_USER, at: now,
      products: Object.keys(byProduct).map(function(k){ return byProduct[k]; }),
      sumQty: sumQty, sumWt: wt2(sumWt),
      stageStatement: buildStageStatement(currentOrder, batchSnapshot)
    };

    setTimeout(function(){
      closeStepModal();
      renderTotals(); renderStats(); renderPipeline();
      openRootCardPrintModal(snapshot);
    }, 800);
  } else {
    setTimeout(function(){
      closeStepModal();
      renderTotals(); renderStats(); renderPipeline();
    }, 700);
  }
}

/* ============================================================
   QUICK ACTIONS
   ============================================================ */
function quickForwardAll(){
  editItemsState.forEach(function(it){
    it.forwardQty = intQty(it.balanceQty); it.forwardWt = wt2(it.balanceWt);
    it.scrapQty = 0; it.scrapWt = 0;
  });
  renderEditItemsRows();
}
function quickScrapAll(){
  if (!confirm('Scrap the entire remaining Jama balance of this order? This cannot be undone.')) return;
  editItemsState.forEach(function(it){
    it.forwardQty = 0; it.forwardWt = 0;
    it.scrapQty = intQty(it.balanceQty); it.scrapWt = wt2(it.balanceWt);
  });
  renderEditItemsRows();
}
function quickClear(){
  editItemsState.forEach(function(it){
    it.forwardQty = 0; it.forwardWt = 0; it.scrapQty = 0; it.scrapWt = 0;
  });
  renderEditItemsRows();
}

/* ============================================================
   ORDER-LEVEL STAGE CHANGE (fallback)
   ============================================================ */
function applyStageChange(orderId, nextStage, extra){
  var state = getStage2Orders();
  if (!state[orderId]) state[orderId] = {};
  var s = state[orderId];

  var newQty = intQty(extra.qty != null ? extra.qty : (currentOrder ? currentOrder.currentQty : 0));
  var newWt  = wt2(extra.weight != null ? extra.weight : (currentOrder ? currentOrder.currentWeight : 0));

  if (nextStage === 'PLATING'){ s.platingQty = newQty; s.platingWeight = newWt; }
  else if (nextStage === 'RECEIVED_PLATING'){ s.receivedQty = newQty; s.receivedWeight = newWt; }
  else if (nextStage === 'PACKING'){ s.packingQty = newQty; s.packingWeight = newWt; }
  else if (nextStage === 'QC'){ s.qcQty = newQty; s.qcWeight = newWt; }
  else if (nextStage === 'DISPATCH'){ s.dispatchQty = newQty; s.dispatchWeight = newWt; }

  s.stage = nextStage;
  s.currentQty = newQty;
  s.currentWeight = newWt;
  s.lastUpdate = nowISO();
  if (extra.items) s.editedItems = extra.items;

  state[orderId] = s;
  saveStage2Orders(state);

  var history = getStage2History();
  if (!Array.isArray(history[orderId])) history[orderId] = [];
  history[orderId].push({
    stage: nextStage, label: STAGE_LABELS[nextStage],
    at: nowISO(), by: CURRENT_USER, qty: newQty, weight: newWt,
    note: extra.note || '', rootCard: s.rootCard || ''
  });
  saveStage2History(history);

  var msg = $("stepMessage");
  if (msg){
    msg.textContent = 'Forwarded to '+STAGE_LABELS[nextStage]+' on '+formatDateTime(nowISO())+'.';
    msg.classList.remove('error');
    msg.classList.add('show');
  }

  setTimeout(function(){
    closeStepModal();
    renderTotals(); renderStats(); renderPipeline();
  }, 900);
}

/* ============================================================
   ROOT CARD (standalone)
   ============================================================ */
function openRootCardModal(){
  if (!currentOrder) return;
  $("rootCardInput").value = suggestRootCard();
  $("verifiedQtyInput").value = currentOrder.currentQty;
  $("verifiedWeightInput").value = currentOrder.currentWeight;
  $("rootCardNote").value = '';
  $("rootCardModal").classList.remove('hidden');
  setTimeout(function(){ $("rootCardInput").focus(); $("rootCardInput").select(); }, 100);
}
function closeRootCardModal(){ $("rootCardModal").classList.add('hidden'); }

function confirmRootCard(){
  if (!currentOrder) return;
  var rc = $("rootCardInput").value.trim();
  if (!rc){ alert('Please enter a Root Card Number.'); return; }
  var cards = getRootCards();
  if (cards[rc] && cards[rc] !== currentOrder.orderId){
    alert('Root Card '+rc+' is already used by another order.'); return;
  }
  cards[rc] = currentOrder.orderId;
  saveRootCards(cards);
  if (rc === suggestRootCard()) consumeRootCard();

  var state = getStage2Orders();
  if (!state[currentOrder.orderId]) state[currentOrder.orderId] = {};
  state[currentOrder.orderId].rootCard = rc;
  state[currentOrder.orderId].rootCardDate = todayISO();
  saveStage2Orders(state);
  closeRootCardModal();
  renderStats(); renderPipeline();
}

var currentRootCardSnapshot = null;

function openRootCardPrintModal(snapshot){
  currentRootCardSnapshot = snapshot || null;
  if (!snapshot){ alert('No root card data available.'); return; }
  $("rootCardPrintContent").innerHTML = buildRootCardHTML(snapshot);
  $("rootCardPrintModal").classList.remove("hidden");
}

function buildRootCardHTML(s){
  var rows = s.products.map(function(p, i){
    return '<tr><td class="rc-td-sl">'+(i+1)+'</td><td class="rc-td-name">'+escapeHtml(p.name)+'</td><td class="rc-td-qty">'+formatNumber(p.qty)+'</td><td class="rc-td-wt">'+formatNumber(p.wt)+'</td></tr>';
  }).join('');
  var stmtRows = (s.stageStatement || []).map(function(r){
    var cls = r.reached ? '' : ' rc-stage-pending';
    return '<tr class="'+cls+'"><td class="stmt-lbl">'+escapeHtml(r.label)+'</td><td class="stmt-num">'+(r.reached ? formatNumber(r.qty) : '—')+'</td><td class="stmt-num">'+(r.reached ? formatNumber(r.weight) : '—')+'</td></tr>';
  }).join('');
  var html = '<div class="rc-slip">'
    + '<div class="rc-head"><div class="brand-block"><h2>Delivery Challan</h2><p>ROOT CARD — STOCK JAMA SLIP</p></div><div class="rc-no">'+escapeHtml(s.rootCard)+'</div></div>'
    + '<div class="rc-meta">'
    +   '<div><span class="k">Order No.</span><b>'+escapeHtml(s.orderNo)+'</b></div>'
    +   '<div><span class="k">Branch</span><b>'+escapeHtml(s.branch)+'</b></div>'
    +   '<div><span class="k">Category</span><b>'+escapeHtml(s.group)+'</b></div>'
    +   '<div><span class="k">Order Date</span><b>'+formatDate(s.orderDate)+'</b></div>'
    +   '<div><span class="k">Verified Qty</span><b>'+formatNumber(s.qty)+'</b></div>'
    +   '<div><span class="k">Verified Wt (g)</span><b>'+formatNumber(s.weight)+'</b></div>'
    +   '<div><span class="k">Allotted By</span><b>'+escapeHtml(s.by || '—')+'</b></div>'
    +   '<div><span class="k">Allotted On</span><b>'+formatDateTime(s.at)+'</b></div>'
    + '</div>'
    + '<table class="rc-items"><colgroup><col style="width:8%"><col style="width:54%"><col style="width:14%"><col style="width:24%"></colgroup>'
    +   '<thead><tr><th>SL</th><th>PRODUCT NAME</th><th style="text-align:center">QTY</th><th style="text-align:center">WT (g)</th></tr></thead>'
    +   '<tbody>'+rows+'</tbody>'
    +   '<tfoot><tr><td colspan="2" class="rc-total-label">GRAND TOTAL</td><td class="rc-total" style="text-align:center">'+formatNumber(s.sumQty)+'</td><td class="rc-total" style="text-align:center">'+formatNumber(s.sumWt)+'</td></tr></tfoot>'
    + '</table>';
  if (stmtRows){
    html += '<div class="rc-stmt-title">STAGE-WISE STATEMENT (QTY / WT)</div>'
         +  '<table class="rc-stmt"><colgroup><col style="width:58%"><col style="width:20%"><col style="width:22%"></colgroup>'
         +    '<thead><tr><th>STAGE</th><th style="text-align:center">QTY</th><th style="text-align:center">WT (g)</th></tr></thead>'
         +    '<tbody>'+stmtRows+'</tbody></table>';
  }
  html += '<div class="rc-remark"><div class="k">REMARKS</div><p>'+(s.note ? escapeHtml(s.note) : '—')+'</p></div>';
  html += '<div class="rc-sign"><div>Verified By</div><div>Received By (Plating)</div></div>';
  html += '</div>';
  return html;
}

function closeRootCardPrintModal(){ $("rootCardPrintModal").classList.add('hidden'); }

function printRootCard(){
  if (!currentRootCardSnapshot) return;
  var s = currentRootCardSnapshot;
  var w = window.open('', '_blank');
  if (!w){ alert('Please allow pop-ups to print.'); return; }
  var productRows = s.products.map(function(p, i){
    return '<tr><td>'+(i+1)+'</td><td class="nm">'+escapeHtml(p.name)+'</td><td>'+formatNumber(p.qty)+'</td><td>'+formatNumber(p.wt)+'</td></tr>';
  }).join('');
  var stmtRows = (s.stageStatement || []).map(function(r){
    var cls = r.reached ? '' : ' class="pend"';
    return '<tr'+cls+'><td class="lbl">'+escapeHtml(r.label)+'</td><td>'+(r.reached ? formatNumber(r.qty) : '—')+'</td><td>'+(r.reached ? formatNumber(r.weight) : '—')+'</td></tr>';
  }).join('');
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Delivery Challan '+escapeHtml(s.rootCard)+'</title>'
    + '<style>html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#252a31}'
    + '.rc-slip{width:105mm;height:148.5mm;box-sizing:border-box;border:1.5px solid #8c004c;border-radius:5px;padding:3mm;background:#fff;margin:0 auto;display:flex;flex-direction:column;overflow:hidden;font-size:8px}'
    + '.rc-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.2px solid #8c004c;padding-bottom:2.5px;margin-bottom:3px;gap:4px}'
    + '.rc-head h2{font-size:10px;color:#8c004c;margin:0;line-height:1.15}'
    + '.rc-head p{font-size:6px;color:#6c7480;margin:1px 0 0;letter-spacing:.2px}'
    + '.rc-no{background:#8c004c;color:#fff;padding:2px 6px;border-radius:4px;font-weight:800;font-size:9.5px;letter-spacing:.4px;white-space:nowrap}'
    + '.rc-meta{display:grid;grid-template-columns:1fr 1fr;gap:1px 5px;font-size:7.5px;margin-bottom:3px}'
    + '.rc-meta > div{border-bottom:1px dotted #ddd;padding:1px 0}'
    + '.rc-meta .k{font-size:5.8px;color:#6c7480;text-transform:uppercase;font-weight:700;display:block}'
    + '.rc-meta b{color:#8c004c;font-size:7.5px;display:block}'
    + '.rc-items{width:100%;border-collapse:collapse;margin-top:2px;table-layout:fixed}'
    + '.rc-items th,.rc-items td{border:0.6px solid #b8b8c0;padding:1px 2px;font-size:7px;text-align:center}'
    + '.rc-items th{background:#eee6f5;color:#8c004c;font-size:6.5px;font-weight:700}'
    + '.rc-items td.nm{text-align:left;padding-left:3px}'
    + '.rc-items tfoot td{font-weight:800;background:#f7f4fb;font-size:7px}'
    + '.rc-stmt-title{font-size:6.5px;color:#8c004c;font-weight:800;letter-spacing:.4px;margin:4px 0 1.5px;text-transform:uppercase}'
    + '.rc-stmt{width:100%;border-collapse:collapse;table-layout:fixed}'
    + '.rc-stmt th,.rc-stmt td{border:0.6px solid #b8b8c0;padding:1px 3px;font-size:6.8px;text-align:center}'
    + '.rc-stmt th{background:#eee6f5;color:#8c004c;font-size:6.2px;font-weight:700}'
    + '.rc-stmt td.lbl{text-align:left;padding-left:4px}'
    + '.rc-stmt tr.pend td{color:#b8b8c0}'
    + '.rc-remark{margin-top:3px;padding:3px 4px;background:#fff8e1;border:0.8px solid #ffe082;border-radius:3px}'
    + '.rc-remark .k{font-size:5.8px;color:#8a6300;text-transform:uppercase;font-weight:700}'
    + '.rc-remark p{font-size:7px;margin:0}'
    + '.rc-sign{display:flex;justify-content:space-between;margin-top:auto;padding-top:6px;font-size:6px;color:#666}'
    + '.rc-sign > div{text-align:center;border-top:0.8px solid #999;padding-top:2px;width:44%}'
    + '@page{size:105mm 148.5mm;margin:0}'
    + '@media print{html,body{background:#fff}.rc-slip{border-width:1.2px;margin:0}}'
    + '</style></head><body onload="window.focus();setTimeout(function(){window.print();},300);">'
    + '<div class="rc-slip">'
        +   '<div class="rc-head"><div><h2>Delivery Challan</h2><p>ROOT CARD — STOCK JAMA SLIP</p></div><div class="rc-no">'+escapeHtml(s.rootCard)+'</div></div>'
    +   '<div class="rc-meta">'
    +     '<div><span class="k">Order No.</span><b>'+escapeHtml(s.orderNo)+'</b></div>'
    +     '<div><span class="k">Branch</span><b>'+escapeHtml(s.branch)+'</b></div>'
    +     '<div><span class="k">Category</span><b>'+escapeHtml(s.group)+'</b></div>'
    +     '<div><span class="k">Order Date</span><b>'+formatDate(s.orderDate)+'</b></div>'
    +     '<div><span class="k">Verified Qty</span><b>'+formatNumber(s.qty)+'</b></div>'
    +     '<div><span class="k">Verified Wt (g)</span><b>'+formatNumber(s.weight)+'</b></div>'
    +     '<div><span class="k">Allotted By</span><b>'+escapeHtml(s.by || '—')+'</b></div>'
    +     '<div><span class="k">Allotted On</span><b>'+formatDateTime(s.at)+'</b></div>'
    +   '</div>'
    +   '<table class="rc-items"><colgroup><col style="width:8%"><col style="width:54%"><col style="width:14%"><col style="width:24%"></colgroup>'
    +     '<thead><tr><th>SL</th><th>PRODUCT NAME</th><th>QTY</th><th>WT (g)</th></tr></thead>'
    +     '<tbody>'+productRows+'</tbody>'
    +     '<tfoot><tr><td colspan="2">GRAND TOTAL</td><td>'+formatNumber(s.sumQty)+'</td><td>'+formatNumber(s.sumWt)+'</td></tr></tfoot>'
    +   '</table>'
    +   (stmtRows ? '<div class="rc-stmt-title">STAGE-WISE STATEMENT</div><table class="rc-stmt"><colgroup><col style="width:58%"><col style="width:20%"><col style="width:22%"></colgroup><thead><tr><th>STAGE</th><th>QTY</th><th>WT (g)</th></tr></thead><tbody>'+stmtRows+'</tbody></table>' : '')
    +   '<div class="rc-remark"><div class="k">REMARKS</div><p>'+(s.note ? escapeHtml(s.note) : '—')+'</p></div>'
    +   '<div class="rc-sign"><div>Verified By</div><div>Received By</div></div>'
    + '</div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

async function downloadRootCardPDF(){
  if (!currentRootCardSnapshot){ alert('No root card data.'); return; }
  if (!window.jspdf){ alert('PDF library not loaded.'); return; }
  var s = currentRootCardSnapshot;
  var { jsPDF } = window.jspdf;
  var doc = new jsPDF({ orientation:'portrait', unit:'mm', format:[105, 148] });
  doc.setDrawColor(140,0,76); doc.setLineWidth(0.5);
  doc.rect(3, 3, 99, 142);
  doc.setFontSize(11); doc.setTextColor(140,0,76); doc.setFont(undefined,'bold');
  doc.text('Delivery Challan', 6, 9.5);
  doc.setFont(undefined,'normal');
  doc.setFontSize(6.5); doc.setTextColor(108,116,128);
  doc.text('ROOT CARD — STOCK JAMA SLIP', 6, 13);
  doc.setFillColor(140,0,76);
  doc.rect(72, 4.5, 30, 8, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(10);
  doc.text(String(s.rootCard), 87, 10, { align:'center' });
  doc.setTextColor(60,60,60); doc.setFontSize(7.5);
  var y = 18;
  doc.setFont(undefined,'bold'); doc.text('Order No.:', 6, y); doc.setFont(undefined,'normal'); doc.text(String(s.orderNo), 30, y);
  doc.setFont(undefined,'bold'); doc.text('Branch:',55, y); doc.setFont(undefined,'normal'); doc.text(String(s.branch), 72, y); y += 4.5;
  doc.setFont(undefined,'bold'); doc.text('Category:', 6, y); doc.setFont(undefined,'normal'); doc.text(String(s.group), 30, y);
  doc.setFont(undefined,'bold'); doc.text('Date:', 55, y); doc.setFont(undefined,'normal'); doc.text(String(formatDate(s.orderDate)), 72, y); y += 4.5;
  doc.setFont(undefined,'bold'); doc.text('Verified Qty:', 6, y); doc.setFont(undefined,'normal'); doc.text(formatNumber(s.qty), 30, y);
  doc.setFont(undefined,'bold'); doc.text('Verified Wt:', 55, y); doc.setFont(undefined,'normal'); doc.text(formatNumber(s.weight)+' g', 72, y); y += 4.5;
  doc.setFont(undefined,'bold'); doc.text('By:', 6, y); doc.setFont(undefined,'normal'); doc.text(String(s.by || '—'), 30, y);
  doc.setFont(undefined,'bold'); doc.text('On:', 55, y); doc.setFont(undefined,'normal'); doc.text(String(formatDateTime(s.at)), 72, y);

  doc.autoTable({
    startY: 42,
    head: [['SL','PRODUCT NAME','QTY','WT (g)']],
    body: s.products.map(function(p, i){ return [ i+1, p.name, formatNumber(p.qty), formatNumber(p.wt) ]; }),
    foot: [['', 'GRAND TOTAL', formatNumber(s.sumQty), formatNumber(s.sumWt)]],
    styles: { fontSize: 6.5, cellPadding: 0.8, lineWidth: 0.15 },
    headStyles: { fillColor: [238,230,245], textColor: [140,0,76], fontStyle:'bold', fontSize:6.5, lineWidth:0.15 },
    footStyles: { fillColor: [247,244,251], textColor: [140,0,76], fontStyle:'bold', fontSize:6.5, lineWidth:0.15 },
    columnStyles: { 0:{cellWidth:8,halign:'center'}, 1:{cellWidth:52,halign:'left'}, 2:{cellWidth:14,halign:'center'}, 3:{cellWidth:19,halign:'center'} },
    theme: 'grid', margin: { left: 6, right: 6 }
  });

  var afterTableY = doc.lastAutoTable.finalY + 3;
  if (s.stageStatement && s.stageStatement.length){
    doc.setFontSize(6.5); doc.setTextColor(140,0,76); doc.setFont(undefined,'bold');
    doc.text('STAGE-WISE STATEMENT (QTY / WT)', 6, afterTableY);
    doc.autoTable({
      startY: afterTableY + 1.5,
      head: [['STAGE','QTY','WT (g)']],
      body: s.stageStatement.map(function(r){
        return [ r.label, r.reached ? formatNumber(r.qty) : '—', r.reached ? formatNumber(r.weight) : '—' ];
      }),
      styles: { fontSize: 6.5, cellPadding: 0.6, lineWidth: 0.15 },
      headStyles: { fillColor: [238,230,245], textColor: [140,0,76], fontStyle:'bold', fontSize:6.2, lineWidth:0.15 },
      columnStyles: { 0:{cellWidth:55,halign:'left'}, 1:{cellWidth:19,halign:'center'}, 2:{cellWidth:19,halign:'center'} },
      theme: 'grid', margin: { left: 6, right: 6 }
    });
    afterTableY = doc.lastAutoTable.finalY + 3;
  }

  doc.setFillColor(255,248,225); doc.setDrawColor(255,224,130);
  doc.rect(6, afterTableY, 93, 12, 'FD');
  doc.setFontSize(6); doc.setTextColor(138,99,0); doc.setFont(undefined,'bold');
  doc.text('REMARKS:', 8, afterTableY + 3.5);
  doc.setTextColor(37,42,49); doc.setFont(undefined,'normal'); doc.setFontSize(7);
  doc.text(doc.splitTextToSize(s.note ? s.note : '—', 88), 8, afterTableY + 7.5);

  var sigY = 138;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.25);
  doc.line(8, sigY, 46, sigY); doc.line(58, sigY, 97, sigY);
  doc.setFontSize(6); doc.setTextColor(80,80,80);
  doc.text('Verified By', 8, sigY + 3); doc.text('Received By (Plating)', 58, sigY + 3);

  doc.save('DeliveryChallan_'+String(s.rootCard).replace(/[^a-z0-9_-]+/gi,'_')+'.pdf');
}

/* ============================================================
   STAGE-WISE STATEMENT SNAPSHOT + PRINT
   ============================================================ */
function buildStageStatementSnapshot(nextStage){
  var live = findOrderById(currentOrder.orderId) || currentOrder;
  var totQty = 0, totWt = 0;
  editItemsState.forEach(function(it){
    if (editItemsMode === 'jama'){ totQty += intQty(it.forwardQty); totWt += wt2(it.forwardWt); }
    else { totQty += intQty(it.stockQty); totWt += wt2(it.totalWt); }
  });
  totQty = intQty(totQty); totWt = wt2(totWt);

  var temp = Object.assign({}, live);
  if (nextStage === 'PLATING'){ temp.stage = 'PLATING'; temp.platingQty = totQty; temp.platingWeight = totWt; }
  else if (nextStage === 'RECEIVED_PLATING'){ temp.stage = 'RECEIVED_PLATING'; temp.receivedQty = totQty; temp.receivedWeight = totWt; }
  else if (nextStage === 'PACKING'){ temp.stage = 'PACKING'; temp.packingQty = totQty; temp.packingWeight = totWt; }
  else if (nextStage === 'QC'){ temp.stage = 'QC'; temp.qcQty = totQty; temp.qcWeight = totWt; }
  else if (nextStage === 'DISPATCH'){ temp.stage = 'DISPATCH'; temp.dispatchQty = totQty; temp.dispatchWeight = totWt; }
  else { temp.stage = live.stage; }
  temp.currentQty = totQty; temp.currentWeight = totWt;

  var byProduct = {};
  editItemsState.forEach(function(it){
    var qty = editItemsMode === 'jama' ? intQty(it.forwardQty) : intQty(it.stockQty);
    var wt  = editItemsMode === 'jama' ? wt2(it.forwardWt)  : wt2(it.totalWt);
    if (qty <= 0 && wt <= 0) return;
    var key = String(it.name || it.artNo || '—');
    if (!byProduct[key]) byProduct[key] = { name: key, qty: 0, wt: 0 };
    byProduct[key].qty += qty;
    byProduct[key].wt  += wt;
  });

  var sumQty = 0, sumWt = 0;
  Object.keys(byProduct).forEach(function(k){ sumQty += byProduct[k].qty; sumWt += byProduct[k].wt; });

  var batchSnapshot = {
    qty: totQty, wt: totWt,
    jamaCompletedQty: currentOrder.totalStockQty,
    jamaCompletedWt: currentOrder.totalWeight
  };

  return {
    rootCard: editItemsNewRootCard || (temp.rootCard || '—'),
    orderNo: temp.orderNo, branch: temp.branch, group: temp.group,
    orderDate: temp.orderDate, qty: totQty, weight: totWt,
    note: $("editItemsNote").value.trim(),
    by: CURRENT_USER, at: nowISO(),
    products: Object.keys(byProduct).map(function(k){ return byProduct[k]; }),
    sumQty: sumQty, sumWt: wt2(sumWt),
    stageStatement: buildStageStatement(temp, batchSnapshot)
  };
}

function printStageStatement(nextStage){
  if (!currentOrder){ alert('No order selected.'); return; }
  var s = buildStageStatementSnapshot(nextStage);
  var w = window.open('', '_blank');
  if (!w){ alert('Please allow pop-ups to print.'); return; }
  var productRows = s.products.map(function(p, i){
    return '<tr><td>'+(i+1)+'</td><td class="nm">'+escapeHtml(p.name)+'</td><td>'+formatNumber(p.qty)+'</td><td>'+formatNumber(p.wt)+'</td></tr>';
  }).join('');
  var stmtRows = s.stageStatement.map(function(r){
    var cls = r.reached ? '' : ' class="pend"';
    return '<tr'+cls+'><td class="lbl">'+escapeHtml(r.label)+'</td><td>'+(r.reached ? formatNumber(r.qty) : '—')+'</td><td>'+(r.reached ? formatNumber(r.weight) : '—')+'</td></tr>';
  }).join('');
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Delivery Challan '+escapeHtml(s.rootCard)+'</title>'
    + '<style>html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#252a31}'
    + '.rc-slip{width:105mm;height:148.5mm;box-sizing:border-box;border:1.5px solid #8c004c;border-radius:5px;padding:3mm;background:#fff;margin:0 auto;display:flex;flex-direction:column;overflow:hidden;font-size:8px}'
    + '.rc-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.2px solid #8c004c;padding-bottom:2.5px;margin-bottom:3px;gap:4px}'
    + '.rc-head h2{font-size:10px;color:#8c004c;margin:0;line-height:1.15}'
    + '.rc-head p{font-size:6px;color:#6c7480;margin:1px 0 0;letter-spacing:.2px}'
    + '.rc-no{background:#8c004c;color:#fff;padding:2px 6px;border-radius:4px;font-weight:800;font-size:9.5px;letter-spacing:.4px;white-space:nowrap}'
    + '.rc-meta{display:grid;grid-template-columns:1fr 1fr;gap:1px 5px;font-size:7.5px;margin-bottom:3px}'
    + '.rc-meta > div{border-bottom:1px dotted #ddd;padding:1px 0}'
    + '.rc-meta .k{font-size:5.8px;color:#6c7480;text-transform:uppercase;font-weight:700;display:block}'
    + '.rc-meta b{color:#8c004c;font-size:7.5px;display:block}'
    + '.rc-items{width:100%;border-collapse:collapse;margin-top:2px;table-layout:fixed}'
    + '.rc-items th,.rc-items td{border:0.6px solid #b8b8c0;padding:1px 2px;font-size:7px;text-align:center}'
    + '.rc-items th{background:#eee6f5;color:#8c004c;font-size:6.5px;font-weight:700}'
    + '.rc-items td.nm{text-align:left;padding-left:3px}'
    + '.rc-items tfoot td{font-weight:800;background:#f7f4fb;font-size:7px}'
    + '.rc-stmt-title{font-size:6.5px;color:#8c004c;font-weight:800;letter-spacing:.4px;margin:4px 0 1.5px;text-transform:uppercase}'
    + '.rc-stmt{width:100%;border-collapse:collapse;table-layout:fixed}'
    + '.rc-stmt th,.rc-stmt td{border:0.6px solid #b8b8c0;padding:1px 3px;font-size:6.8px;text-align:center}'
    + '.rc-stmt th{background:#eee6f5;color:#8c004c;font-size:6.2px;font-weight:700}'
    + '.rc-stmt td.lbl{text-align:left;padding-left:4px}'
    + '.rc-stmt tr.pend td{color:#b8b8c0}'
    + '.rc-remark{margin-top:3px;padding:3px 4px;background:#fff8e1;border:0.8px solid #ffe082;border-radius:3px}'
    + '.rc-remark .k{font-size:5.8px;color:#8a6300;text-transform:uppercase;font-weight:700}'
    + '.rc-remark p{font-size:7px;margin:0}'
    + '.rc-sign{display:flex;justify-content:space-between;margin-top:auto;padding-top:6px;font-size:6px;color:#666}'
    + '.rc-sign > div{text-align:center;border-top:0.8px solid #999;padding-top:2px;width:44%}'
    + '@page{size:105mm 148.5mm;margin:0}'
    + '@media print{html,body{background:#fff}.rc-slip{border-width:1.2px;margin:0}}'
    + '</style></head><body onload="window.focus();setTimeout(function(){window.print();},300);">'
    + '<div class="rc-slip">'
    +   '<div class="rc-head"><div><h2>Delivery Challan</h2><p>ROOT CARD — STOCK JAMA SLIP</p></div><div class="rc-no">'+escapeHtml(s.rootCard)+'</div></div>'
    +   '<div class="rc-meta">'
    +     '<div><span class="k">Order No.</span><b>'+escapeHtml(s.orderNo)+'</b></div>'
    +     '<div><span class="k">Branch</span><b>'+escapeHtml(s.branch)+'</b></div>'
    +     '<div><span class="k">Category</span><b>'+escapeHtml(s.group)+'</b></div>'
    +     '<div><span class="k">Order Date</span><b>'+formatDate(s.orderDate)+'</b></div>'
    +     '<div><span class="k">Verified Qty</span><b>'+formatNumber(s.qty)+'</b></div>'
    +     '<div><span class="k">Verified Wt (g)</span><b>'+formatNumber(s.weight)+'</b></div>'
    +     '<div><span class="k">Allotted By</span><b>'+escapeHtml(s.by || '—')+'</b></div>'
    +     '<div><span class="k">Allotted On</span><b>'+formatDateTime(s.at)+'</b></div>'
    +   '</div>'
    +   '<table class="rc-items"><colgroup><col style="width:8%"><col style="width:54%"><col style="width:14%"><col style="width:24%"></colgroup>'
    +     '<thead><tr><th>SL</th><th>PRODUCT NAME</th><th>QTY</th><th>WT (g)</th></tr></thead>'
    +     '<tbody>'+productRows+'</tbody>'
    +     '<tfoot><tr><td colspan="2">GRAND TOTAL</td><td>'+formatNumber(s.sumQty)+'</td><td>'+formatNumber(s.sumWt)+'</td></tr></tfoot>'
    +   '</table>'
    +   '<div class="rc-stmt-title">STAGE-WISE STATEMENT</div>'
    +   '<table class="rc-stmt"><colgroup><col style="width:58%"><col style="width:20%"><col style="width:22%"></colgroup><thead><tr><th>STAGE</th><th>QTY</th><th>WT (g)</th></tr></thead><tbody>'+stmtRows+'</tbody></table>'
    +   '<div class="rc-remark"><div class="k">REMARKS</div><p>'+(s.note ? escapeHtml(s.note) : '—')+'</p></div>'
    +   '<div class="rc-sign"><div>Verified By</div><div>Received By</div></div>'
    + '</div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

async function downloadStageStatementPDF(nextStage){
  if (!currentOrder){ alert('No order selected.'); return; }
  if (!window.jspdf){ alert('PDF library not loaded.'); return; }
  var s = buildStageStatementSnapshot(nextStage);
  var { jsPDF } = window.jspdf;
  var doc = new jsPDF({ orientation:'portrait', unit:'mm', format:[105, 148] });
  doc.setDrawColor(140,0,76); doc.setLineWidth(0.5);
  doc.rect(3, 3, 99, 142);
  doc.setFontSize(11); doc.setTextColor(140,0,76); doc.setFont(undefined,'bold');
  doc.text('Delivery Challan', 6, 9.5);
  doc.setFont(undefined,'normal');
  doc.setFontSize(6.5); doc.setTextColor(108,116,128);
  doc.text('ROOT CARD — STOCK JAMA SLIP', 6, 13);
  doc.setFillColor(140,0,76);
  doc.rect(72, 4.5, 30, 8, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(10);
  doc.text(String(s.rootCard || '—'), 87, 10, { align:'center' });

  doc.setTextColor(60,60,60); doc.setFontSize(7.5);
  var y = 18;
  doc.setFont(undefined,'bold'); doc.text('Order No.:', 6, y); doc.setFont(undefined,'normal'); doc.text(String(s.orderNo), 30, y);
  doc.setFont(undefined,'bold'); doc.text('Branch:', 55, y); doc.setFont(undefined,'normal'); doc.text(String(s.branch), 72, y); y += 4.5;
  doc.setFont(undefined,'bold'); doc.text('Category:', 6, y); doc.setFont(undefined,'normal'); doc.text(String(s.group), 30, y);
  doc.setFont(undefined,'bold'); doc.text('Date:', 55, y); doc.setFont(undefined,'normal'); doc.text(String(formatDate(s.orderDate)), 72, y); y += 4.5;
  doc.setFont(undefined,'bold'); doc.text('Verified Qty:', 6, y); doc.setFont(undefined,'normal'); doc.text(formatNumber(s.qty), 30, y);
  doc.setFont(undefined,'bold'); doc.text('Verified Wt:', 55, y); doc.setFont(undefined,'normal'); doc.text(formatNumber(s.weight)+' g', 72, y); y += 4.5;
  doc.setFont(undefined,'bold'); doc.text('By:', 6, y); doc.setFont(undefined,'normal'); doc.text(String(s.by || '—'), 30, y);
  doc.setFont(undefined,'bold'); doc.text('On:', 55, y); doc.setFont(undefined,'normal'); doc.text(String(formatDateTime(s.at)), 72, y);

  doc.autoTable({
    startY: 42,
    head: [['SL','PRODUCT NAME','QTY','WT (g)']],
    body: s.products.map(function(p, i){ return [ i+1, p.name, formatNumber(p.qty), formatNumber(p.wt) ]; }),
    foot: [['', 'GRAND TOTAL', formatNumber(s.sumQty), formatNumber(s.sumWt)]],
    styles: { fontSize: 6.5, cellPadding: 0.8, lineWidth: 0.15 },
    headStyles: { fillColor: [238,230,245], textColor: [140,0,76], fontStyle:'bold', fontSize:6.5, lineWidth:0.15 },
    footStyles: { fillColor: [247,244,251], textColor: [140,0,76], fontStyle:'bold', fontSize:6.5, lineWidth:0.15 },
    columnStyles: { 0:{cellWidth:8,halign:'center'}, 1:{cellWidth:52,halign:'left'}, 2:{cellWidth:14,halign:'center'}, 3:{cellWidth:19,halign:'center'} },
    theme: 'grid', margin: { left: 6, right: 6 }
  });

  var afterY = doc.lastAutoTable.finalY + 3;
  doc.setFontSize(6.5); doc.setTextColor(140,0,76); doc.setFont(undefined,'bold');
  doc.text('STAGE-WISE STATEMENT (QTY / WT)', 6, afterY);
  doc.autoTable({
    startY: afterY + 1.5,
    head: [['STAGE','QTY','WT (g)']],
    body: s.stageStatement.map(function(r){ return [ r.label, r.reached ? formatNumber(r.qty) : '—', r.reached ? formatNumber(r.weight) : '—' ]; }),
    styles: { fontSize: 6.5, cellPadding: 0.6, lineWidth: 0.15 },
    headStyles: { fillColor: [238,230,245], textColor: [140,0,76], fontStyle:'bold', fontSize:6.2, lineWidth:0.15 },
    columnStyles: { 0:{cellWidth:55,halign:'left'}, 1:{cellWidth:19,halign:'center'}, 2:{cellWidth:19,halign:'center'} },
    theme: 'grid', margin: { left: 6, right: 6 }
  });

  afterY = doc.lastAutoTable.finalY + 3;
  doc.setFillColor(255,248,225); doc.setDrawColor(255,224,130);
  doc.rect(6, afterY, 93, 12, 'FD');
  doc.setFontSize(6); doc.setTextColor(138,99,0); doc.setFont(undefined,'bold');
  doc.text('REMARKS:', 8, afterY + 3.5);
  doc.setTextColor(37,42,49); doc.setFont(undefined,'normal'); doc.setFontSize(7);
  doc.text(doc.splitTextToSize(s.note ? s.note : '—', 88), 8, afterY + 7.5);

  var sigY = 138;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.25);
  doc.line(8, sigY, 46, sigY); doc.line(58, sigY, 97, sigY);
  doc.setFontSize(6); doc.setTextColor(80,80,80);
  doc.text('Verified By', 8, sigY + 3); doc.text('Received By', 58, sigY + 3);

  var tag = nextStage ? ('_'+String(nextStage).replace(/[^a-z0-9]+/gi,'_')) : '';
  doc.save('DeliveryChallan_'+String(s.rootCard || 'X').replace(/[^a-z0-9_-]+/gi,'_')+tag+'.pdf');
}

/* ============================================================
   REPORTS / TRACKER / KORA / EXPORTS
   ============================================================ */
var reportFilterFrom = '', reportFilterTo = '';
function openReports(){
  var now = new Date();
  var first = new Date(now.getFullYear(), now.getMonth(), 1);
  var last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  if (!reportFilterFrom) reportFilterFrom = first.toISOString().slice(0,10);
  if (!reportFilterTo)   reportFilterTo   = last.toISOString().slice(0,10);
  $("reportFromDate").value = reportFilterFrom;
  $("reportToDate").value   = reportFilterTo;
  renderReports();
  $("reportsModal").classList.remove('hidden');
}
function closeReports(){ $("reportsModal").classList.add('hidden'); }
function clearReportFilters(){ reportFilterFrom = ''; reportFilterTo = ''; $("reportFromDate").value=''; $("reportToDate").value=''; renderReports(); }
function applyReportFilters(){ reportFilterFrom = $("reportFromDate").value || ''; reportFilterTo = $("reportToDate").value || ''; renderReports(); }
function getFilteredJamaSnapshots(){
  return getJamaReports().filter(function(s){
    var d = s.jamaDate || (s.jamaAt ? s.jamaAt.slice(0,10) : '');
    if (!d) return false;
    if (reportFilterFrom && d < reportFilterFrom) return false;
    if (reportFilterTo   && d > reportFilterTo)   return false;
    return true;
  });
}
function renderReports(){
  var snaps = getFilteredJamaSnapshots();
  var byCat = {}, byBranch = {}, grandQty = 0, grandWt = 0;
  snaps.forEach(function(s){
    var g = s.group || '—';
    if (!byCat[g]) byCat[g] = { count:0, qty:0, weight:0 };
    byCat[g].count += 1; byCat[g].qty += Number(s.qty||0); byCat[g].weight += Number(s.weight||0);
    var b = s.branch || '—';
    if (!byBranch[b]) byBranch[b] = { count:0, qty:0, weight:0 };
    byBranch[b].count += 1; byBranch[b].qty += Number(s.qty||0); byBranch[b].weight += Number(s.weight||0);
    grandQty += Number(s.qty||0); grandWt += Number(s.weight||0);
  });
  var rangeLabel = (reportFilterFrom || reportFilterTo)
    ? '— '+(reportFilterFrom ? formatDate(reportFilterFrom) : '…')+' to '+(reportFilterTo ? formatDate(reportFilterTo) : '…')
    : '— All Time';
  var html = '<div class="reports-section"><h3><i class="fas fa-inbox"></i> STOCK JAMA TOTALS '+rangeLabel+'</h3>'
       +  '<div class="reports-cards">'
       +    '<div class="reports-card"><div class="k">Total Root Cards</div><div class="v">'+snaps.length+'</div><div class="s">Jama entries</div></div>'
       +    '<div class="reports-card"><div class="k">Total Jama Qty</div><div class="v">'+formatNumber(grandQty)+'</div><div class="s">pcs</div></div>'
       +    '<div class="reports-card"><div class="k">Total Jama Weight</div><div class="v">'+formatNumber(grandWt)+'</div><div class="s">grams</div></div>'
       +  '</div>';
  var CATS = ['3D IDOLS','2D IDOLS','JEWELLERY','GOD FRAMES'];
  html += '<div class="reports-table-wrap"><table class="reports-table"><thead><tr><th>PRODUCT CATEGORY</th><th>ROOT CARDS</th><th>QTY</th><th>WEIGHT (g)</th></tr></thead><tbody>';
  CATS.forEach(function(cat){
    var c = byCat[cat] || { count:0, qty:0, weight:0 };
    html += '<tr><td class="party"><b>'+escapeHtml(cat)+'</b></td><td>'+c.count+'</td><td>'+formatNumber(c.qty)+'</td><td>'+formatNumber(c.weight)+'</td></tr>';
  });
  Object.keys(byCat).forEach(function(g){
    if (CATS.indexOf(g) !== -1) return;
    var c = byCat[g];
    html += '<tr><td class="party"><b>'+escapeHtml(g)+'</b></td><td>'+c.count+'</td><td>'+formatNumber(c.qty)+'</td><td>'+formatNumber(c.weight)+'</td></tr>';
  });
  html += '</tbody><tfoot><tr><td class="party">GRAND TOTAL</td><td>'+snaps.length+'</td><td>'+formatNumber(grandQty)+'</td><td>'+formatNumber(grandWt)+'</td></tr></tfoot></table></div></div>';

  html += '<div class="reports-section"><h3><i class="fas fa-code-branch"></i> BRANCH-WISE JAMA '+rangeLabel+'</h3>';
  var bk = Object.keys(byBranch).sort();
  if (!bk.length){ html += '<div class="tracker-hint">No jama records in the selected date range.</div>'; }
  else {
    html += '<div class="reports-table-wrap"><table class="reports-table"><thead><tr><th>BRANCH / WORKSHOP</th><th>ROOT CARDS</th><th>QTY</th><th>WEIGHT (g)</th></tr></thead><tbody>';
    bk.forEach(function(b){
      var c = byBranch[b];
            html += '<tr><td class="party"><b>'+escapeHtml(b)+'</b></td><td>'+c.count+'</td><td>'+formatNumber(c.qty)+'</td><td>'+formatNumber(c.weight)+'</td></tr>';
    });
    html += '</tbody><tfoot><tr><td class="party">GRAND TOTAL</td><td>'+snaps.length+'</td><td>'+formatNumber(grandQty)+'</td><td>'+formatNumber(grandWt)+'</td></tr></tfoot></table></div>';
  }
  html += '</div>';
  $("reportsBody").innerHTML = html;
}
function printReports(){
  var bodyHtml = $("reportsBody").innerHTML;
  var w = window.open('', '_blank');
  if (!w){ alert('Please allow pop-ups to print.'); return; }
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stage-2 Jama Reports</title>'
    + '<style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#252a31}h1{color:#8c004c;margin:0 0 4px;font-size:20px}h3{color:#8c004c;font-size:14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;font-size:11px;text-align:center}th{background:#eee6f5;color:#8c004c}td.party{text-align:left}tfoot td{font-weight:800;background:#f5f5f5}@media print{@page{size:A4 landscape;margin:10mm}}</style></head><body>'
    + '<h1>GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD</h1>'
    + '<div style="font-size:11px;color:#6c7480;margin-bottom:12px"><b>STAGE-2 JAMA REPORTS</b> | Printed: '+escapeHtml(new Date().toLocaleString('en-IN'))+'</div>'
    + bodyHtml + '</body></html>';
  w.document.open(); w.document.write(html); w.document.close();
  w.focus(); setTimeout(function(){ w.print(); }, 350);
}
async function downloadReportsPDF(){
  if (!window.jspdf){ alert('PDF library not loaded.'); return; }
  var snaps = getFilteredJamaSnapshots();
  var byCat = {}, byBranch = {}, grandQty = 0, grandWt = 0;
  snaps.forEach(function(s){
    var g = s.group || '—';
    if (!byCat[g]) byCat[g] = { count:0, qty:0, weight:0 };
    byCat[g].count += 1; byCat[g].qty += Number(s.qty||0); byCat[g].weight += Number(s.weight||0);
    var b = s.branch || '—';
    if (!byBranch[b]) byBranch[b] = { count:0, qty:0, weight:0 };
    byBranch[b].count += 1; byBranch[b].qty += Number(s.qty||0); byBranch[b].weight += Number(s.weight||0);
    grandQty += Number(s.qty||0); grandWt += Number(s.weight||0);
  });
  var { jsPDF } = window.jspdf;
  var doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  doc.setFontSize(14); doc.setTextColor(140,0,76);
  doc.text('GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD', 14, 13);
  doc.setFontSize(11); doc.text('STAGE-2 JAMA REPORTS', 14, 20);
  var CATS = ['3D IDOLS','2D IDOLS','JEWELLERY','GOD FRAMES'];
  var rows = CATS.map(function(cat){ var c = byCat[cat] || { count:0, qty:0, weight:0 }; return [ cat, c.count, formatNumber(c.qty), formatNumber(c.weight) ]; });
  Object.keys(byCat).forEach(function(g){
    if (CATS.indexOf(g) !== -1) return;
    var c = byCat[g]; rows.push([ g, c.count, formatNumber(c.qty), formatNumber(c.weight) ]);
  });
  doc.autoTable({
    startY: 34, head: [['PRODUCT CATEGORY','ROOT CARDS','QTY','WEIGHT (g)']], body: rows,
    foot: [['GRAND TOTAL', snaps.length, formatNumber(grandQty), formatNumber(grandWt)]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [140,0,76], textColor: [255,255,255], fontStyle:'bold' },
    footStyles: { fillColor: [238,230,245], textColor: [140,0,76], fontStyle:'bold' },
    theme: 'grid', margin: { left: 14, right: 14 }
  });
  var startY = doc.lastAutoTable.finalY + 8;
  var bRows = Object.keys(byBranch).sort().map(function(b){ var c = byBranch[b]; return [ b, c.count, formatNumber(c.qty), formatNumber(c.weight) ]; });
  doc.autoTable({
    startY: startY, head: [['BRANCH / WORKSHOP','ROOT CARDS','QTY','WEIGHT (g)']], body: bRows.length ? bRows : [['—','0','0','0']],
    foot: [['GRAND TOTAL', snaps.length, formatNumber(grandQty), formatNumber(grandWt)]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [140,0,76], textColor: [255,255,255], fontStyle:'bold' },
    footStyles: { fillColor: [238,230,245], textColor: [140,0,76], fontStyle:'bold' },
    theme: 'grid', margin: { left: 14, right: 14 }
  });
  doc.save('Stage2_JamaReports_' + new Date().toISOString().slice(0,10) + '.pdf');
}
async function downloadReportsExcel(){
  if (!window.ExcelJS){ alert('Excel library not loaded.'); return; }
  var snaps = getFilteredJamaSnapshots();
  var grandQty = 0, grandWt = 0;
  snaps.forEach(function(s){ grandQty += Number(s.qty||0); grandWt += Number(s.weight||0); });
  var wb = new ExcelJS.Workbook();
  var ws2 = wb.addWorksheet('Category Summary');
  ws2.columns = [{width:24},{width:14},{width:12},{width:16}];
  ws2.mergeCells('A1:D1');
  ws2.getCell('A1').value = 'STOCK JAMA — CATEGORY SUMMARY';
  ws2.getCell('A1').font = { bold:true, size:14, color:{argb:'FF8C004C'} };
  ws2.getCell('A1').alignment = { horizontal:'center' };
  ws2.getRow(1).height = 24;
  var hr2 = ws2.addRow(['PRODUCT CATEGORY','ROOT CARDS','QTY','WEIGHT (g)']);
  hr2.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hr2.eachCell(function(c){ c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF8C004C'} }; c.alignment = { horizontal:'center', vertical:'middle' }; });
  var CATS = ['3D IDOLS','2D IDOLS','JEWELLERY','GOD FRAMES'];
  var byCat = {};
  snaps.forEach(function(s){ var g = s.group || '—'; if (!byCat[g]) byCat[g] = { count:0, qty:0, weight:0 }; byCat[g].count += 1; byCat[g].qty += Number(s.qty||0); byCat[g].weight += Number(s.weight||0); });
  CATS.forEach(function(cat){ var c = byCat[cat] || { count:0, qty:0, weight:0 }; ws2.addRow([ cat, c.count, c.qty, c.weight ]); });
  Object.keys(byCat).forEach(function(g){ if (CATS.indexOf(g) !== -1) return; var c = byCat[g]; ws2.addRow([ g, c.count, c.qty, c.weight ]); });
  ws2.addRow(['GRAND TOTAL', snaps.length, grandQty, grandWt]);
  ws2.lastRow.font = { bold:true };
  ws2.eachRow(function(r, n){ if (n <= 1) return; r.eachCell(function(c){ c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }; c.alignment = { horizontal:'center', vertical:'middle' }; }); r.getCell(1).alignment = { horizontal:'left', vertical:'middle' }; });

  var ws3 = wb.addWorksheet('Branch Summary');
  ws3.columns = [{width:26},{width:14},{width:12},{width:16}];
  ws3.mergeCells('A1:D1');
  ws3.getCell('A1').value = 'STOCK JAMA — BRANCH-WISE SUMMARY';
  ws3.getCell('A1').font = { bold:true, size:14, color:{argb:'FF8C004C'} };
  ws3.getCell('A1').alignment = { horizontal:'center' };
  ws3.getRow(1).height = 24;
  var hr3 = ws3.addRow(['BRANCH / WORKSHOP','ROOT CARDS','QTY','WEIGHT (g)']);
  hr3.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hr3.eachCell(function(c){ c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF8C004C'} }; c.alignment = { horizontal:'center', vertical:'middle' }; });
  var byBranch = {};
  snaps.forEach(function(s){ var b = s.branch || '—'; if (!byBranch[b]) byBranch[b] = { count:0, qty:0, weight:0 }; byBranch[b].count += 1; byBranch[b].qty += Number(s.qty||0); byBranch[b].weight += Number(s.weight||0); });
  Object.keys(byBranch).sort().forEach(function(b){ var c = byBranch[b]; ws3.addRow([ b, c.count, c.qty, c.weight ]); });
  ws3.addRow(['GRAND TOTAL', snaps.length, grandQty, grandWt]);
  ws3.lastRow.font = { bold:true };
  ws3.eachRow(function(r, n){ if (n <= 1) return; r.eachCell(function(c){ c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }; c.alignment = { horizontal:'center', vertical:'middle' }; }); r.getCell(1).alignment = { horizontal:'left', vertical:'middle' }; });

  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'Stage2_JamaReports_' + new Date().toISOString().slice(0,10) + '.xlsx'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

/* ============================================================
   STOCK PROCESSING DIFFERENCE
   ============================================================ */
var diffFilterFrom = '', diffFilterTo = '';
function openDiffReport(){
  if (!diffFilterFrom) diffFilterFrom = '2026-10-01';
  if (!diffFilterTo)   diffFilterTo   = '2026-11-30';
  $("diffFromDate").value = diffFilterFrom;
  $("diffToDate").value   = diffFilterTo;
  renderDiffReport();
  $("diffModal").classList.remove('hidden');
}
function closeDiffReport(){ $("diffModal").classList.add('hidden'); }
function clearDiffFilters(){ diffFilterFrom = ''; diffFilterTo = ''; $("diffFromDate").value=''; $("diffToDate").value=''; renderDiffReport(); }
function applyDiffFilters(){ diffFilterFrom = $("diffFromDate").value || ''; diffFilterTo = $("diffToDate").value || ''; renderDiffReport(); }

function buildDiffRows(){
  var raw = buildPipeline();
  var seen = {}, orders = [];
  raw.forEach(function(r){
    if (!r._order || seen[r.orderId]) return;
    seen[r.orderId] = true; orders.push(r._order);
  });
  var rows = orders.filter(function(o){
    if (!o.allRootCards.length) return false;
    var d = o.rootCardDate || '';
    if (!d){
      var h = getStage2History();
      var log = Array.isArray(h[o.orderId]) ? h[o.orderId] : [];
      var rcEntry = log.slice().reverse().find(function(e){ return e.rootCard; });
      if (rcEntry && rcEntry.at) d = rcEntry.at.slice(0,10);
    }
    if (!d) return false;
    if (diffFilterFrom && d < diffFilterFrom) return false;
    if (diffFilterTo   && d > diffFilterTo)   return false;
    return true;
  });
  return rows.map(function(o){
    var rcvQty = Number(o.totalStockQty || 0);
    var rcvWt  = Number(o.totalWeight  || 0);
    var platingQty = Number(o.platingQty || 0);
    var platingWt  = Number(o.platingWeight || 0);
    var recvPlQty = Number(o.receivedQty || 0);
    var recvPlWt  = Number(o.receivedWeight || 0);
    var packQty = Number(o.packingQty || 0);
    var packWt  = Number(o.packingWeight || 0);
    var qcQty = Number(o.qcQty || 0);
    var qcWt  = Number(o.qcWeight || 0);
    var dispQty = Number(o.dispatchQty || 0);
    var dispWt  = Number(o.dispatchWeight || 0);
    return {
      orderId: o.orderId, rootCard: o.allRootCards.join(' / ') || o.rootCard, orderNo: o.orderNo,
      branch: o.branch, group: o.group, orderDate: o.orderDate, rootCardDate: o.rootCardDate || '', stage: o.stage,
      rcvQty: rcvQty, rcvWt: rcvWt, jamaQty: rcvQty, jamaWt: rcvWt,
      platingQty: platingQty, platingWt: platingWt, recvPlQty: recvPlQty, recvPlWt: recvPlWt,
      packQty: packQty, packWt: packWt, qcQty: qcQty, qcWt: qcWt, dispQty: dispQty, dispWt: dispWt,
      diffQty: dispQty - rcvQty, diffWt: dispWt - rcvWt
    };
  }).sort(function(a,b){
    if (a.rootCardDate && b.rootCardDate) return a.rootCardDate.localeCompare(b.rootCardDate);
    return (a.rootCard || '').localeCompare(b.rootCard || '');
  });
}

function renderDiffReport(){
  var rows = buildDiffRows();
  var rangeLabel = (diffFilterFrom || diffFilterTo)
    ? '— '+(diffFilterFrom ? formatDate(diffFilterFrom) : '…')+' to '+(diffFilterTo ? formatDate(diffFilterTo) : '…')
    : '— All Time';
  if (!rows.length){ $("diffBody").innerHTML = '<div class="diff-empty">No root cards allotted in the selected date range.</div>'; return; }

  var t = { rcvQty:0, rcvWt:0, platingQty:0, platingWt:0, recvPlQty:0, recvPlWt:0, packQty:0, packWt:0, qcQty:0, qcWt:0, dispQty:0, dispWt:0, diffQty:0, diffWt:0 };
  rows.forEach(function(r){
    t.rcvQty += r.rcvQty; t.rcvWt += r.rcvWt;
    t.platingQty += r.platingQty; t.platingWt += r.platingWt;
    t.recvPlQty += r.recvPlQty; t.recvPlWt += r.recvPlWt;
    t.packQty += r.packQty; t.packWt += r.packWt;
    t.qcQty += r.qcQty; t.qcWt += r.qcWt;
    t.dispQty += r.dispQty; t.dispWt += r.dispWt;
    t.diffQty += r.diffQty; t.diffWt += r.diffWt;
  });
  function diffCls(v){ return v > 0 ? 'diff-pos' : (v < 0 ? 'diff-neg' : 'diff-zero'); }

  var html = '<div class="reports-section"><h3><i class="fas fa-balance-scale"></i> ROOT-CARD-WISE STOCK PROCESSING DIFFERENCE '+rangeLabel+'</h3>'
       +  '<div class="reports-cards">'
       +    '<div class="reports-card"><div class="k">Root Cards</div><div class="v">'+rows.length+'</div><div class="s">In range</div></div>'
       +    '<div class="reports-card"><div class="k">Stock Received Qty</div><div class="v">'+formatNumber(t.rcvQty)+'</div><div class="s">pcs</div></div>'
       +    '<div class="reports-card"><div class="k">Dispatched Qty</div><div class="v">'+formatNumber(t.dispQty)+'</div><div class="s">pcs</div></div>'
       +    '<div class="reports-card"><div class="k">Difference Qty</div><div class="v" style="color:'+(t.diffQty<0?'#b3261e':(t.diffQty>0?'#137333':'#8c004c'))+'">'+formatSigned(t.diffQty)+'</div><div class="s">pcs</div></div>'
       +    '<div class="reports-card"><div class="k">Difference Weight</div><div class="v" style="color:'+(t.diffWt<0?'#b3261e':(t.diffWt>0?'#137333':'#8c004c'))+'">'+formatSigned(t.diffWt)+'</div><div class="s">grams</div></div>'
       +  '</div></div>';

  html += '<div class="reports-table-wrap" style="max-height:65vh;overflow:auto"><table class="diff-table"><thead>'
       +    '<tr>'
       +      '<th rowspan="2">ROOT CARD</th><th rowspan="2">ORDER NO.</th><th rowspan="2">BRANCH</th><th rowspan="2">CATEGORY</th>'
       +      '<th colspan="2" class="th-group">STOCK RECEIVED FROM BRANCH</th>'
       +      '<th colspan="2" class="th-group">AFTER JAMA</th>'
       +      '<th colspan="2" class="th-group">AFTER PLATING/POLISH</th>'
       +      '<th colspan="2" class="th-group">AFTER RECEIVED FROM PLATING</th>'
       +      '<th colspan="2" class="th-group">AFTER PACKING</th>'
       +      '<th colspan="2" class="th-group">AFTER QC</th>'
       +      '<th colspan="2" class="th-group">AFTER DISPATCH</th>'
       +      '<th colspan="2" class="th-diff">DIFFERENCE (BRANCH → DISPATCH)</th>'
       +    '</tr><tr>'
       +      '<th class="th-recv">QTY</th><th class="th-recv">WT (g)</th>'
       +      '<th class="th-stage">QTY</th><th class="th-stage">WT (g)</th>'
       +      '<th class="th-stage">QTY</th><th class="th-stage">WT (g)</th>'
       +      '<th class="th-stage">QTY</th><th class="th-stage">WT (g)</th>'
       +      '<th class="th-stage">QTY</th><th class="th-stage">WT (g)</th>'
       +      '<th class="th-stage">QTY</th><th class="th-stage">WT (g)</th>'
       +      '<th class="th-stage">QTY</th><th class="th-stage">WT (g)</th>'
       +      '<th class="th-diff">QTY</th><th class="th-diff">WT (g)</th>'
       +    '</tr></thead><tbody>';

  rows.forEach(function(r){
    html += '<tr>'
         +   '<td class="rc-cell">'+escapeHtml(r.rootCard)+'</td>'
         +   '<td>'+escapeHtml(r.orderNo)+'</td>'
         +   '<td>'+escapeHtml(r.branch)+'</td>'
         +   '<td>'+escapeHtml(r.group)+'</td>'
         +   '<td>'+formatNumber(r.rcvQty)+'</td><td>'+formatNumber(r.rcvWt)+'</td>'
         +   '<td>'+formatNumber(r.jamaQty)+'</td><td>'+formatNumber(r.jamaWt)+'</td>'
         +   '<td>'+formatNumber(r.platingQty)+'</td><td>'+formatNumber(r.platingWt)+'</td>'
         +   '<td>'+formatNumber(r.recvPlQty)+'</td><td>'+formatNumber(r.recvPlWt)+'</td>'
         +   '<td>'+formatNumber(r.packQty)+'</td><td>'+formatNumber(r.packWt)+'</td>'
         +   '<td>'+formatNumber(r.qcQty)+'</td><td>'+formatNumber(r.qcWt)+'</td>'
         +   '<td>'+formatNumber(r.dispQty)+'</td><td>'+formatNumber(r.dispWt)+'</td>'
         +   '<td class="'+diffCls(r.diffQty)+'">'+formatSigned(r.diffQty)+'</td>'
         +   '<td class="'+diffCls(r.diffWt)+'">'+formatSigned(r.diffWt)+'</td>'
         + '</tr>';
  });

  html += '</tbody><tfoot><tr>'
       +    '<td colspan="4" style="text-align:right">GRAND TOTAL</td>'
       +    '<td>'+formatNumber(t.rcvQty)+'</td><td>'+formatNumber(t.rcvWt)+'</td>'
       +    '<td>'+formatNumber(t.rcvQty)+'</td><td>'+formatNumber(t.rcvWt)+'</td>'
       +    '<td>'+formatNumber(t.platingQty)+'</td><td>'+formatNumber(t.platingWt)+'</td>'
       +    '<td>'+formatNumber(t.recvPlQty)+'</td><td>'+formatNumber(t.recvPlWt)+'</td>'
       +    '<td>'+formatNumber(t.packQty)+'</td><td>'+formatNumber(t.packWt)+'</td>'
       +    '<td>'+formatNumber(t.qcQty)+'</td><td>'+formatNumber(t.qcWt)+'</td>'
       +    '<td>'+formatNumber(t.dispQty)+'</td><td>'+formatNumber(t.dispWt)+'</td>'
       +    '<td class="'+diffCls(t.diffQty)+'">'+formatSigned(t.diffQty)+'</td>'
       +    '<td class="'+diffCls(t.diffWt)+'">'+formatSigned(t.diffWt)+'</td>'
       +  '</tr></tfoot></table></div>';

  $("diffBody").innerHTML = html;
}

function printDiffReport(){
  var bodyHtml = $("diffBody").innerHTML;
  if (!bodyHtml){ alert('Nothing to print.'); return; }
  var w = window.open('', '_blank');
  if (!w){ alert('Please allow pop-ups to print.'); return; }
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stock Processing Difference</title>'
    + '<style>body{font-family:Arial,Helvetica,sans-serif;padding:16px;color:#252a31}h1{color:#8c004c;margin:0 0 4px;font-size:18px}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #ccc;padding:3px 4px;text-align:center}th{background:#eee6f5;color:#8c004c;font-size:8.5px}th.th-group{background:#e0d0f0}th.th-recv{background:#fff4d6;color:#8a6300}th.th-stage{background:#e1efff;color:#094d9c}th.th-diff{background:#ffdfe0;color:#b3261e}td.diff-pos{color:#137333;font-weight:800}td.diff-neg{color:#b3261e;font-weight:800}td.diff-zero{color:#6c7480}td.rc-cell{font-weight:800;color:#8c004c}tfoot td{font-weight:800;background:#f7f4fb}@media print{@page{size:A3 landscape;margin:8mm}}</style></head><body>'
    + '<h1>GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD</h1>'
    + '<div style="font-size:11px;color:#6c7480;margin-bottom:12px"><b>STOCK PROCESSING DIFFERENCE (ROOT-CARD-WISE)</b> | Range: ' + (diffFilterFrom ? formatDate(diffFilterFrom) : '…') + ' to ' + (diffFilterTo ? formatDate(diffFilterTo) : '…') + '</div>'
    + bodyHtml + '</body></html>';
  w.document.open(); w.document.write(html); w.document.close();
  w.focus(); setTimeout(function(){ w.print(); }, 350);
}

async function downloadDiffPDF(){
  if (!window.jspdf){ alert('PDF library not loaded.'); return; }
  var rows = buildDiffRows();
  if (!rows.length){ alert('No data to export.'); return; }
  var { jsPDF } = window.jspdf;
  var doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a3' });
  doc.setFontSize(13); doc.setTextColor(140,0,76);
  doc.text('GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD', 14, 12);
  doc.setFontSize(11); doc.text('STOCK PROCESSING DIFFERENCE — ROOT-CARD-WISE', 14, 19);
  var head = [['ROOT CARD','ORDER NO.','BRANCH','CATEGORY','RCV QTY','RCV WT','JAMA QTY','JAMA WT','PLATING QTY','PLATING WT','RECV PL QTY','RECV PL WT','PACK QTY','PACK WT','QC QTY','QC WT','DISP QTY','DISP WT','DIFF QTY','DIFF WT']];
  var body = rows.map(function(r){
    return [ r.rootCard, r.orderNo, r.branch, r.group,
      formatNumber(r.rcvQty), formatNumber(r.rcvWt),
      formatNumber(r.rcvQty), formatNumber(r.rcvWt),
      formatNumber(r.platingQty), formatNumber(r.platingWt),
      formatNumber(r.recvPlQty), formatNumber(r.recvPlWt),
      formatNumber(r.packQty), formatNumber(r.packWt),
      formatNumber(r.qcQty), formatNumber(r.qcWt),
      formatNumber(r.dispQty), formatNumber(r.dispWt),
      formatSigned(r.diffQty), formatSigned(r.diffWt) ];
  });
  doc.autoTable({
    startY: 32, head: head, body: body,
    styles: { fontSize: 6.5, cellPadding: 1, lineWidth: 0.1 },
    headStyles: { fillColor:[238,230,245], textColor:[140,0,76], fontStyle:'bold', fontSize:6.2 },
    theme: 'grid', margin: { left: 8, right: 8 }
  });
  doc.save('StockProcessingDifference_' + new Date().toISOString().slice(0,10) + '.pdf');
}

async function downloadDiffExcel(){
  if (!window.ExcelJS){ alert('Excel library not loaded.'); return; }
  var rows = buildDiffRows();
  if (!rows.length){ alert('No data to export.'); return; }
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet('Stock Processing Diff', { pageSetup:{ paperSize:8, orientation:'landscape' } });
  var HEADERS = ['ROOT CARD','ORDER NO.','BRANCH','CATEGORY','RCV QTY','RCV WT','JAMA QTY','JAMA WT','PLATING QTY','PLATING WT','RECV PL QTY','RECV PL WT','PACK QTY','PACK WT','QC QTY','QC WT','DISP QTY','DISP WT','DIFF QTY','DIFF WT'];
  var WIDTHS = [16,12,14,14, 10,12, 10,12, 12,14, 14,18, 10,12, 10,12, 12,14, 12,12];
  ws.columns = HEADERS.map(function(h,i){ return { header:h, width: WIDTHS[i] }; });
  ws.mergeCells('A1:T1'); ws.getCell('A1').value = 'GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD';
  ws.getCell('A1').font = { bold:true, size:15, color:{argb:'FF8C004C'} };
  ws.getCell('A1').alignment = { horizontal:'center', vertical:'middle' };
  ws.getRow(1).height = 24;
  ws.addRow([]);
  var hr = ws.addRow(HEADERS);
  hr.height = 22;
  hr.eachCell(function(c){
    c.font = { bold:true, color:{argb:'FFFFFFFF'} };
    c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF8C004C'} };
    c.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
    c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
  });
  rows.forEach(function(r){
    var row = ws.addRow([
      r.rootCard, r.orderNo, r.branch, r.group,
      Number(r.rcvQty), Number(r.rcvWt), Number(r.rcvQty), Number(r.rcvWt),
      Number(r.platingQty), Number(r.platingWt), Number(r.recvPlQty), Number(r.recvPlWt),
      Number(r.packQty), Number(r.packWt), Number(r.qcQty), Number(r.qcWt),
      Number(r.dispQty), Number(r.dispWt), Number(r.diffQty), Number(r.diffWt)
    ]);
    row.eachCell(function(c){
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      c.alignment = { horizontal:'center', vertical:'middle' };
    });
  });
  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'StockProcessingDifference_' + new Date().toISOString().slice(0,10) + '.xlsx'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

/* ============================================================
   ART NO. TRACKER
   ============================================================ */
function openTracker(){
  $("trackerInput").value = '';
  $("trackerResults").innerHTML = '<div class="tracker-hint"><i class="fas fa-info-circle"></i> Type an Art No. above and press Search.</div>';
  $("trackerModal").classList.remove('hidden');
  setTimeout(function(){ $("trackerInput").focus(); }, 100);
}
function closeTracker(){ $("trackerModal").classList.add('hidden'); }

function runTracker(){
  var q = $("trackerInput").value.trim().toLowerCase();
  var results = $("trackerResults");
  if (!q){ results.innerHTML = '<div class="tracker-hint">Please enter an Art No.</div>'; return; }

  var raw = buildPipeline();
  var seenOrders = {};
  var matches = [];
  raw.forEach(function(r){
    if (!r._order || seenOrders[r.orderId]) return;
    var o = r._order;
    var source = (o.jamaQty > 0 ? o.jamaItems : (o.items || []));
    var hitItems = source.filter(function(it){ return String(it.artNo || '').toLowerCase().indexOf(q) !== -1; });
    if (hitItems.length){ seenOrders[r.orderId] = true; matches.push({ order: o, items: hitItems }); }
  });
  if (!matches.length){
    results.innerHTML = '<div class="tracker-no-results"><i class="fas fa-exclamation-triangle"></i> No matching Art No. found in any Stage-2 order.</div>';
    return;
  }
  var curIdx = function(st){ return STAGE_SEQUENCE.indexOf(st); };
  var html = '<div style="margin-bottom:10px;font-size:13px;color:#6c7480"><b>'+matches.length+'</b> order(s) contain art no. <b>'+escapeHtml(q)+'</b></div>';
  matches.forEach(function(m){
    var o = m.order;
    var idx = curIdx(o.stage);
    var stepsHtml = STAGE_SEQUENCE.map(function(st, i){
      var cls = i < idx ? 'done' : (i === idx ? 'active' : '');
      return '<div class="step '+cls+'">'+STAGE_LABELS[st]+'</div>';
    }).join('<i class="fas fa-chevron-right arrow"></i>');

    html += '<div class="tracker-card">'
         +   '<div class="tracker-card-head">'
         +     '<h3><i class="fas fa-box"></i> ORDER '+escapeHtml(o.orderNo)+'</h3>'
         +     '<span class="rc-badge"><i class="fas fa-tag"></i> '+(o.activeRootCard ? escapeHtml(o.activeRootCard) : 'NO ROOT CARD YET')+'</span>'
         +   '</div>'
         +   '<div class="tracker-grid">'
         +     '<div><span class="k">BRANCH</span><b>'+escapeHtml(o.branch)+'</b></div>'
         +     '<div><span class="k">GROUP</span><b>'+escapeHtml(o.group)+'</b></div>'
         +     '<div><span class="k">CURRENT STAGE</span><b>'+STAGE_LABELS[o.stage]+'</b></div>'
         +     '<div><span class="k">CURRENT QTY</span><b>'+formatNumber(o.currentQty)+'</b></div>'
         +     '<div><span class="k">CURRENT WT (g)</span><b>'+formatNumber(o.currentWeight)+'</b></div>'
         +     '<div><span class="k">ORDER DATE</span><b>'+formatDate(o.orderDate)+'</b></div>'
         +   '</div>'
         +   '<div style="margin-top:12px;overflow:auto"><table style="min-width:600px">'
         +     '<thead><tr><th>ART NO.</th><th>NAME</th><th>TOUCH</th><th>ORDER QTY</th><th>QTY</th><th>WT (g)</th><th>TOTAL WT (g)</th></tr></thead><tbody>'
         +       m.items.map(function(it){
                   var q1 = it.jamaQty != null ? it.jamaQty : it.stockQty;
                   var w1 = it.jamaWt  != null ? it.jamaWt  : it.totalWt;
                   return '<tr><td><b>'+escapeHtml(it.artNo)+'</b></td><td style="text-align:left">'+escapeHtml(it.name)+'</td><td>'+escapeHtml(it.touch || '—')+'</td><td>'+formatNumber(it.orderQty)+'</td><td>'+formatNumber(q1)+'</td><td>'+formatNumber(it.weight)+'</td><td>'+formatNumber(w1)+'</td></tr>';
                 }).join('')
         +     '</tbody></table></div>'
         +   '<div class="tracker-path"><h4><i class="fas fa-route"></i> STAGE PATH</h4><div class="steps">'+stepsHtml+'</div></div>'
         + '</div>';
  });
  results.innerHTML = html;
}

/* ============================================================
   KORA STOCK
   ============================================================ */
function openKoraStock(){
  var raw = buildPipeline();
  var seen = {}, orders = [];
  raw.forEach(function(r){
    if (!r._order || seen[r.orderId]) return;
    seen[r.orderId] = true; orders.push(r._order);
  });

  var byKey = {};
  orders.forEach(function(o){
    if (o.stage === 'DISPATCH') return;

    if (o.jamaQty > 0 || o.jamaWeight > 0){
      (o.jamaItems || []).forEach(function(it){
        var art = String(it.artNo || '').trim();
        if (!art || intQty(it.jamaQty) <= 0) return;
        var k = 'STOCK_JAMA||' + art;
        if (!byKey[k]) byKey[k] = { section: 'STOCK_JAMA', artNo: art, name: it.name || '—', group: o.group || '—', qty: 0, wt: 0, orders: [] };
        byKey[k].qty += intQty(it.jamaQty);
        byKey[k].wt   = wt2(byKey[k].wt + wt2(it.jamaWt));
        if (byKey[k].orders.indexOf(o.orderNo) === -1) byKey[k].orders.push(o.orderNo);
      });
    }

    (o.forwardBatches || []).forEach(function(b){
      if (o.cancelledRootCards.indexOf(b.rootCard) !== -1) return;
      var batchStage = b.stage || 'PLATING';
      if (STAGE_SEQUENCE.indexOf(batchStage) < STAGE_SEQUENCE.indexOf('PLATING')) batchStage = 'PLATING';
      if (batchStage === 'DISPATCH') return;
      (b.items || []).forEach(function(it){
        var art = String(it.artNo || '').trim();
        if (!art || intQty(it.qty) <= 0) return;
        var k = batchStage + '||' + art;
        if (!byKey[k]) byKey[k] = { section: batchStage, artNo: art, name: it.name || '—', group: o.group || '—', qty: 0, wt: 0, orders: [] };
        byKey[k].qty += intQty(it.qty);
        byKey[k].wt   = wt2(byKey[k].wt + wt2(it.wt));
        if (byKey[k].orders.indexOf(o.orderNo) === -1) byKey[k].orders.push(o.orderNo);
      });
    });

    (o.scrapEvents || []).forEach(function(ev){
      (ev.items || []).forEach(function(it){
        var art = String(it.artNo || '').trim();
        if (!art) return;
        var k = 'SCRAPPED||' + art;
        if (!byKey[k]) byKey[k] = { section: 'SCRAPPED', artNo: art, name: it.name || '—', group: o.group || '—', qty: 0, wt: 0, orders: [] };
        byKey[k].qty += intQty(it.qty);
        byKey[k].wt   = wt2(byKey[k].wt + wt2(it.wt));
        if (byKey[k].orders.indexOf(o.orderNo) === -1) byKey[k].orders.push(o.orderNo);
      });
    });
  });

  window.__koraRows = Object.keys(byKey).map(function(k){ return byKey[k]; }).sort(function(a, b){
    var siA = a.section === 'SCRAPPED' ? 99 : STAGE_SEQUENCE.indexOf(a.section);
    var siB = b.section === 'SCRAPPED' ? 99 : STAGE_SEQUENCE.indexOf(b.section);
    var si = siA - siB;
    if (si !== 0) return si;
    return a.artNo.localeCompare(b.artNo);
  });

  var nameSel = $("koraFilterName");
  var groupSel = $("koraFilterGroup");
  var names = {}, groups = {};
  window.__koraRows.forEach(function(r){
    if (r.name) names[r.name] = true;
    if (r.group) groups[r.group] = true;
  });
  nameSel.innerHTML = '<option value="">All Names</option>' + Object.keys(names).sort().map(function(n){ return '<option value="'+escapeHtml(n)+'">'+escapeHtml(n)+'</option>'; }).join('');
  groupSel.innerHTML = '<option value="">All Groups</option>' + Object.keys(groups).sort().map(function(g){ return '<option value="'+escapeHtml(g)+'">'+escapeHtml(g)+'</option>'; }).join('');

  $("koraSearchArt").value = '';
  $("koraFilterSection").value = '';
  renderKoraStock();
  $("koraStockModal").classList.remove('hidden');
}

function closeKoraStock(){ $("koraStockModal").classList.add('hidden'); }

function renderKoraStock(){
  var search = String($("koraSearchArt").value || '').trim().toLowerCase();
  var filterSection = $("koraFilterSection").value || '';
  var filterName = $("koraFilterName").value || '';
  var filterGroup = $("koraFilterGroup").value || '';

  var rows = (window.__koraRows || []).filter(function(r){
    if (filterSection && r.section !== filterSection) return false;
    if (search && String(r.artNo).toLowerCase().indexOf(search) === -1) return false;
    if (filterName && r.name !== filterName) return false;
    if (filterGroup && r.group !== filterGroup) return false;
    return true;
  });

  var baseFiltered = (window.__koraRows || []).filter(function(r){
    if (search && String(r.artNo).toLowerCase().indexOf(search) === -1) return false;
    if (filterName && r.name !== filterName) return false;
    if (filterGroup && r.group !== filterGroup) return false;
    return true;
  });

  var sectionTotals = {};
  STAGE_SEQUENCE.forEach(function(st){ sectionTotals[st] = { qty: 0, wt: 0, rows: 0 }; });
  sectionTotals['SCRAPPED'] = { qty: 0, wt: 0, rows: 0 };
  var grandQty = 0, grandWt = 0;
  baseFiltered.forEach(function(r){
    if (!sectionTotals[r.section]) sectionTotals[r.section] = { qty: 0, wt: 0, rows: 0 };
    sectionTotals[r.section].qty  += intQty(r.qty);
    sectionTotals[r.section].wt    = wt2(sectionTotals[r.section].wt + wt2(r.wt));
    sectionTotals[r.section].rows += 1;
    grandQty += intQty(r.qty);
    grandWt  = wt2(grandWt + wt2(r.wt));
  });

  var sumHtml = '';
  STAGE_SEQUENCE.forEach(function(st){
    if (st === 'DISPATCH') return;
    var t = sectionTotals[st];
    var active = filterSection === st ? ' kora-card-active' : '';
    sumHtml += '<div class="kora-card'+active+'" data-section="'+st+'">'
            +    '<div class="k">'+STAGE_LABELS[st]+'</div>'
            +    '<div class="v">'+formatNumber(t.qty)+'</div>'
            +    '<div class="s">'+formatNumber(t.wt)+' g · '+t.rows+' article'+(t.rows===1?'':'s')+'</div>'
            +  '</div>';
  });
  var stScrap = sectionTotals['SCRAPPED'];
  var activeScrap = filterSection === 'SCRAPPED' ? ' kora-card-active' : '';
  sumHtml += '<div class="kora-card'+activeScrap+'" data-section="SCRAPPED">'
          +    '<div class="k">SCRAPPED</div>'
          +    '<div class="v">'+formatNumber(stScrap.qty)+'</div>'
          +    '<div class="s">'+formatNumber(stScrap.wt)+' g · '+stScrap.rows+' article'+(stScrap.rows===1?'':'s')+'</div>'
          +  '</div>';
  sumHtml += '<div class="kora-card kora-card-total">'
          +    '<div class="k">GRAND TOTAL</div>'
          +    '<div class="v">'+formatNumber(grandQty)+'</div>'
          +    '<div class="s">'+formatNumber(grandWt)+' g</div>'
          +  '</div>';
  $("koraSummaryGrid").innerHTML = sumHtml;

  $("koraSummaryGrid").querySelectorAll('.kora-card[data-section]').forEach(function(c){
    c.addEventListener('click', function(){
      var st = c.dataset.section;
      var sel = $("koraFilterSection");
      sel.value = (sel.value === st ? '' : st);
      renderKoraStock();
    });
  });

  var tbody = $("koraBody");
  if (!rows.length){
    tbody.innerHTML = '<tr><td colspan="7" class="empty-list">No matching stock in the selected section.</td></tr>';
    $("koraFootQty").textContent = '0';
    $("koraFootWt").textContent = '0.00';
    return;
  }

  var tQty = 0, tWt = 0;
  tbody.innerHTML = rows.map(function(r){
    tQty += intQty(r.qty);
    tWt   = wt2(tWt + wt2(r.wt));
    var badgeCls = STAGE_CLASS[r.section] || 'stock';
    var secLabel = r.section === 'SCRAPPED' ? 'Scrapped' : STAGE_LABELS[r.section];
    return '<tr>'
         +   '<td><b>'+escapeHtml(r.artNo)+'</b></td>'
         +   '<td style="text-align:left">'+escapeHtml(r.name)+'</td>'
         +   '<td>'+escapeHtml(r.group)+'</td>'
         +   '<td><span class="badge '+badgeCls+'">'+secLabel+'</span></td>'
         +   '<td>'+formatNumber(r.qty)+'</td>'
         +   '<td>'+formatNumber(r.wt)+'</td>'
         +   '<td style="font-size:11px;color:#6c7480">'+escapeHtml(r.orders.join(', '))+'</td>'
         + '</tr>';
  }).join('');

  $("koraFootQty").textContent = formatNumber(tQty);
  $("koraFootWt").textContent  = formatNumber(tWt);
}

function resetKoraFilters(){
  $("koraSearchArt").value = '';
  $("koraFilterSection").value = '';
  $("koraFilterName").value = '';
  $("koraFilterGroup").value = '';
  renderKoraStock();
}

async function exportKoraExcel(){
  if (!window.ExcelJS){ alert('Excel library not loaded.'); return; }
  var rows = (window.__koraRows || []);
  if (!rows.length){ alert('No stock to export.'); return; }
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet('Kora Stock');
  ws.columns = [
    { header:'ART NO.', width:14 }, { header:'PRODUCT NAME', width:26 },
    { header:'PRODUCT GROUP', width:18 }, { header:'SECTION', width:22 },
    { header:'QTY', width:10 }, { header:'WEIGHT (g)', width:14 }, { header:'ORDERS', width:30 }
  ];
  ws.mergeCells('A1:G1'); ws.getCell('A1').value = 'GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD';
  ws.getCell('A1').font = { bold:true, size:15, color:{argb:'FF8C004C'} };
  ws.getCell('A1').alignment = { horizontal:'center', vertical:'middle' };
  ws.getRow(1).height = 24;
  ws.mergeCells('A2:G2'); ws.getCell('A2').value = 'KORA STOCK — ALL SECTIONS';
  ws.getCell('A2').font = { bold:true, size:12, color:{argb:'FF8C004C'} };
  ws.getCell('A2').alignment = { horizontal:'center', vertical:'middle' };
  ws.getRow(2).height = 20;
  ws.addRow([]);
  var hr = ws.addRow(['ART NO.','PRODUCT NAME','PRODUCT GROUP','SECTION','QTY','WEIGHT (g)','ORDERS']);
  hr.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hr.height = 22;
  hr.eachCell(function(c){
    c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF8C004C'} };
    c.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
    c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
  });
  var tQty = 0, tWt = 0;
  rows.forEach(function(r){
    tQty += intQty(r.qty);
    tWt   = wt2(tWt + wt2(r.wt));
    var secLabel = r.section === 'SCRAPPED' ? 'Scrapped' : STAGE_LABELS[r.section];
    var row = ws.addRow([r.artNo, r.name, r.group, secLabel, intQty(r.qty), wt2(r.wt), r.orders.join(', ')]);
    row.eachCell(function(c){
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      c.alignment = { horizontal:'center', vertical:'middle' };
    });
    row.getCell(2).alignment = { horizontal:'left', vertical:'middle' };
  });
  var tr = ws.addRow(['GRAND TOTAL','','','', tQty, tWt, '']);
  tr.font = { bold:true };
  tr.eachCell(function(c){
    c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEEE6F5'} };
    c.border = { top:{style:'medium'}, left:{style:'thin'}, bottom:{style:'medium'}, right:{style:'thin'} };
    c.alignment = { horizontal:'center', vertical:'middle' };
  });
  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'KoraStock_' + new Date().toISOString().slice(0,10) + '.xlsx'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

/* ============================================================
   PIPELINE / ORDER EXCEL EXPORTS
   ============================================================ */
async function exportPipelineExcel(){
  if (!window.ExcelJS){ alert('Excel library not loaded.'); return; }
  var list = buildPipeline();
  if (IS_RESTRICTED) list = list.filter(function(o){ return isSectionAllowed(o.stage); });
  if (activeStageFilter !== 'all') list = list.filter(function(o){ return o.stage === activeStageFilter; });
  if (!list.length){ alert('No orders to export.'); return; }
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet('Stage-2 Pipeline', { pageSetup:{ paperSize:9, orientation:'landscape' } });
  var HEADERS = ['ROOT CARD','ORDER NO.','BRANCH / WORKSHOP','PRODUCT GROUP','ORDER DATE','STOCK RECEIVED','CURRENT STAGE','QTY','WEIGHT (g)','LAST UPDATE'];
  var WIDTHS  = [22, 14, 18, 16, 14, 20, 20, 12, 14, 20];
  ws.columns = HEADERS.map(function(h,i){ return { header:h, width: WIDTHS[i] }; });
  ws.mergeCells('A1:J1'); ws.getCell('A1').value = 'GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD';
  ws.getCell('A1').font = { bold:true, size:16, color:{argb:'FF8C004C'} };
  ws.getCell('A1').alignment = { horizontal:'center', vertical:'middle' };
  ws.getRow(1).height = 28;
  ws.mergeCells('A2:J2'); ws.getCell('A2').value = 'STAGE-2 PROCESS PIPELINE';
  ws.getCell('A2').font = { bold:true, size:13 };
  ws.getCell('A2').alignment = { horizontal:'center', vertical:'middle' };
  ws.getRow(2).height = 22;
  ws.addRow([]);
  var hr = ws.addRow(HEADERS);
  hr.font = { bold:true, color:{argb:'FFFFFFFF'} }; hr.height = 22;
  hr.eachCell(function(c){
    c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF8C004C'} };
    c.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
    c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
  });
  list.forEach(function(o){
    var rcTxt = o.rowType === 'BATCH' ? o.rootCard : '—';
    if (o.rowType === 'BATCH' && o.batchCount > 1) rcTxt += ' (Lot '+o.batchIndex+'/'+o.batchCount+')';
    var row = ws.addRow([
      rcTxt, o.orderNo, o.branch, o.group, formatDate(o.orderDate),
      o.receivedDates.map(function(d){ return formatDateTime(d); }).join(' | ') || '—',
      STAGE_LABELS[o.stage], intQty(o.currentQty), wt2(o.currentWeight),
      o.lastUpdate ? formatDateTime(o.lastUpdate) : '—'
    ]);
    row.eachCell(function(c){
      c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      c.alignment = { horizontal:'center', vertical:'middle' };
    });
  });
  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'Stage2_Pipeline_'+new Date().toISOString().slice(0,10)+'.xlsx'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

async function exportOrderExcel(){
  if (!currentOrder){ alert('No order selected.'); return; }
  if (!window.ExcelJS){ alert('Excel library not loaded.'); return; }
  var o = currentOrder;
  var history = getStage2History();
  var log = Array.isArray(history[o.orderId]) ? history[o.orderId] : [];
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet('Order');
  ws.columns = [{width:6},{width:14},{width:28},{width:10},{width:12},{width:12},{width:12},{width:14}];
  ws.mergeCells('A1:H1'); ws.getCell('A1').value = 'GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD';
  ws.getCell('A1').font = { bold:true, size:15, color:{argb:'FF8C004C'} };
  ws.getCell('A1').alignment = { horizontal:'center', vertical:'middle' };
  ws.getRow(1).height = 26;
  ws.mergeCells('A2:H2'); ws.getCell('A2').value = 'STAGE-2 PROCESS — ORDER '+o.orderNo;
  ws.getCell('A2').font = { bold:true, size:12 };
  ws.getCell('A2').alignment = { horizontal:'center', vertical:'middle' };
  ws.getRow(2).height = 20;
  ws.addRow(['ROOT CARD', o.allRootCards.join(' / ') || '—', '', 'BRANCH / WORKSHOP', o.branch]);
  ws.addRow(['PRODUCT GROUP', o.group, '', 'ORDER DATE', formatDate(o.orderDate)]);
  ws.addRow(['CURRENT STAGE', STAGE_LABELS[o.stage], '', 'TOTAL QTY', formatNumber(o.currentQty)]);
  ws.addRow(['TOTAL WEIGHT (g)', formatNumber(o.currentWeight), '', '', '']);
  ws.addRow([]);
  var hr = ws.addRow(['SL','ART NO.','PRODUCT NAME','TOUCH','ORDER QTY','STOCK QTY','WEIGHT (g)','TOTAL WT (g)']);
  hr.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hr.eachCell(function(c){
    c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF8C004C'} };
    c.alignment = { horizontal:'center', vertical:'middle' };
    c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
  });
  var displayItems = (o.jamaQty > 0)
                   ? o.jamaItems.map(function(it){ return { artNo: it.artNo, name: it.name, touch: it.touch, orderQty: it.orderQty, stockQty: it.jamaQty, weight: it.weight, totalWt: it.jamaWt }; })
                   : (o.editedItems && o.editedItems.length ? o.editedItems : o.items);
  var totQty = 0, totWt = 0;
  displayItems.forEach(function(r, i){
    totQty += intQty(r.stockQty); totWt += wt2(r.totalWt);
    var row = ws.addRow([i+1, r.artNo, r.name, r.touch||'', intQty(r.orderQty), intQty(r.stockQty), wt2(r.weight), wt2(r.totalWt)]);
    row.eachCell(function(c){ c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }; c.alignment = { horizontal:'center', vertical:'middle' }; });
    row.getCell(3).alignment = { horizontal:'left', vertical:'middle' };
  });
  var grand = ws.addRow(['','','','GRAND TOTAL', '', totQty, '', wt2(totWt)]);
  grand.font = { bold:true };
  grand.eachCell(function(c){
    c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEEE6F5'} };
    c.border = { top:{style:'medium'}, left:{style:'thin'}, bottom:{style:'medium'}, right:{style:'thin'} };
    c.alignment = { horizontal:'center', vertical:'middle' };
  });
  var hs = wb.addWorksheet('Stage History');
  hs.columns = [{width:26},{width:22},{width:16},{width:10},{width:14},{width:16},{width:30}];
  var hsh = hs.addRow(['STAGE','DATE & TIME','BY','QTY','WEIGHT (g)','ROOT CARD','NOTE']);
  hsh.font = { bold:true, color:{argb:'FFFFFFFF'} };
  hsh.eachCell(function(c){
    c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF8C004C'} };
    c.alignment = { horizontal:'center' };
  });
  log.forEach(function(e){
    var lbl = e.label || e.stage;
    if (e.kind === 'scrap') lbl = 'Scrapped — ' + lbl;
    else if (e.kind === 'partial') lbl = 'Partial — ' + lbl;
    else if (e.kind === 'cancel') lbl = 'Cancelled — ' + lbl;
    var r = hs.addRow([lbl, formatDateTime(e.at), e.by || '', intQty(e.qty), wt2(e.weight), e.rootCard || '', e.note || '']);
    r.eachCell(function(c){ c.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }; c.alignment = { horizontal:'left', vertical:'middle' }; });
  });
  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'Stage2_Order_'+o.orderNo+'.xlsx'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

/* ============================================================
   BIND EVENTS + ROLE-GATED HEADER BUTTONS
   ============================================================ */
function doLogout(){
  if (!confirm('Log out?')) return;
  try { sessionStorage.removeItem('gp_logged_user'); sessionStorage.clear(); } catch(e){}
  window.location.replace('index.html');
}

document.getElementById('userName').textContent = CURRENT_USER + ' · ' + CURRENT_ROLE;

/* Apply admin-only visibility BEFORE wiring handlers so restricted users
   never even bind listeners to buttons they can't see. */
applyHeaderButtonVisibility();

document.getElementById('koraBtn').addEventListener('click', openKoraStock);
document.getElementById('trackerBtn').addEventListener('click', openTracker);
document.getElementById('reportsBtn').addEventListener('click', openReports);
document.getElementById('diffBtn').addEventListener('click', openDiffReport);
document.getElementById('excelBtn').addEventListener('click', exportPipelineExcel);
document.getElementById('logoutBtn').addEventListener('click', doLogout);

document.getElementById('closeKoraStockModal').addEventListener('click', closeKoraStock);
document.getElementById('koraCloseBtn').addEventListener('click', closeKoraStock);
document.getElementById('koraResetBtn').addEventListener('click', resetKoraFilters);
document.getElementById('koraExcelBtn').addEventListener('click', exportKoraExcel);
document.getElementById('koraSearchArt').addEventListener('input', renderKoraStock);
document.getElementById('koraFilterSection').addEventListener('change', renderKoraStock);
document.getElementById('koraFilterName').addEventListener('change', renderKoraStock);
document.getElementById('koraFilterGroup').addEventListener('change', renderKoraStock);

document.getElementById('closeStepModal').addEventListener('click', closeStepModal);
document.getElementById('advanceStepBtn').addEventListener('click', advanceStep);
document.getElementById('cancelStageBtn').addEventListener('click', cancelCurrentOrder);
document.getElementById('exportOrderExcelBtn').addEventListener('click', exportOrderExcel);

document.getElementById('closeEditItemsModal').addEventListener('click', closeEditItemsModal);
document.getElementById('cancelEditItemsBtn').addEventListener('click', closeEditItemsModal);
document.getElementById('confirmEditItemsBtn').addEventListener('click', confirmEditItems);

document.getElementById('editItemsForwardAllBtn').addEventListener('click', quickForwardAll);
document.getElementById('editItemsScrapAllBtn').addEventListener('click', quickScrapAll);
document.getElementById('editItemsClearBtn').addEventListener('click', quickClear);

document.getElementById('editItemsRootCardSuggestBtn').addEventListener('click', function(){
  var inp = document.getElementById('editItemsRootCardInput');
  var next = suggestRootCard();
  inp.value = next;
  editItemsNewRootCard = next;
  inp.focus();
  inp.select();
});

document.getElementById('closeRootCardModal').addEventListener('click', closeRootCardModal);
document.getElementById('cancelRootCardBtn').addEventListener('click', closeRootCardModal);
document.getElementById('confirmRootCardBtn').addEventListener('click', confirmRootCard);

document.getElementById('closeRootCardPrintModal').addEventListener('click', closeRootCardPrintModal);
document.getElementById('rootCardCloseBtn').addEventListener('click', closeRootCardPrintModal);
document.getElementById('rootCardPrintBtn').addEventListener('click', printRootCard);
document.getElementById('rootCardPdfBtn').addEventListener('click', downloadRootCardPDF);

document.getElementById('closeReportsModal').addEventListener('click', closeReports);
document.getElementById('reportCloseBtn').addEventListener('click', closeReports);
document.getElementById('reportClearBtn').addEventListener('click', clearReportFilters);
document.getElementById('reportApplyBtn').addEventListener('click', applyReportFilters);
document.getElementById('reportPrintBtn').addEventListener('click', printReports);
document.getElementById('reportPdfBtn').addEventListener('click', downloadReportsPDF);
document.getElementById('reportExcelBtn').addEventListener('click', downloadReportsExcel);

document.getElementById('closeDiffModal').addEventListener('click', closeDiffReport);
document.getElementById('diffCloseBtn').addEventListener('click', closeDiffReport);
document.getElementById('diffClearBtn').addEventListener('click', clearDiffFilters);
document.getElementById('diffApplyBtn').addEventListener('click', applyDiffFilters);
document.getElementById('diffPrintBtn').addEventListener('click', printDiffReport);
document.getElementById('diffPdfBtn').addEventListener('click', downloadDiffPDF);
document.getElementById('diffExcelBtn').addEventListener('click', downloadDiffExcel);

document.getElementById('closeTrackerModal').addEventListener('click', closeTracker);
document.getElementById('trackerSearchBtn').addEventListener('click', runTracker);
document.getElementById('trackerInput').addEventListener('keydown', function(e){
  if (e.key === 'Enter'){ e.preventDefault(); runTracker(); }
});

document.querySelectorAll('.tab').forEach(function(t){
  t.addEventListener('click', function(){
    var st = t.dataset.stage;
    if (st !== 'all' && !isSectionAllowed(st)) return;
    document.querySelectorAll('.tab').forEach(function(x){ x.classList.remove('active'); });
    t.classList.add('active');
    activeStageFilter = st;
    renderStats();
    renderPipeline();
  });
});

/* ============================================================
   AUTO REFRESH
   ============================================================ */
function autoRefresh(){
  var modals = ['stepModal','editItemsModal','rootCardModal','trackerModal','reportsModal','rootCardPrintModal','diffModal','koraStockModal'];
  var anyOpen = modals.some(function(id){
    var el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
  if (anyOpen) return;
  renderTotals(); renderStats(); renderPipeline();
}
setInterval(autoRefresh, 20000);
document.addEventListener('visibilitychange', function(){ if (!document.hidden) autoRefresh(); });
window.addEventListener('focus', autoRefresh);
window.addEventListener('storage', function(e){
  if (!e.key) return;
  if (e.key === SENDS_KEY || e.key === ORDERS_KEY ||
      e.key === STAGE2_ORDERS_KEY || e.key === STAGE2_HISTORY_KEY ||
      e.key === COMPLETED_KEY) {
    autoRefresh();
  }
});

/* ============================================================
   INIT
   ============================================================ */
(function initRestrictedView(){
  if (IS_RESTRICTED && ALLOWED_SECTIONS.length){
    activeStageFilter = 'all';
  }
})();

renderTotals();
renderStats();
renderPipeline();