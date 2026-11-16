/* ============================================================
   order-form.js — SINGLE WORKING FILE (image-fix build)
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
  function saveJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
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

  /* Safe <img> template — clears broken src so no icon flashes */
  function safeImg(src, cls, fallbackHtml) {
    if (!src) return fallbackHtml || '—';
    return '<img src="' + escapeAttr(src) + '" class="' + (cls || '') + '" '
         + 'onerror="this.onerror=null;this.removeAttribute(\'src\');this.style.display=\'none\'">';
  }

  /* ============================================================
     STORAGE KEYS
     ============================================================ */
  var PARTIES_KEY        = 'goldprince_parties';
  var PARTIES_LEGACY_KEY = 'gp_party_master';
  var ESTIMATIONS_KEY    = 'goldprince_estimations';
  var ORDERS_KEY         = 'goldprince_orders_v3';

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
    if (orderId && stage2OrderLeavingJama(orderId)) return { done: true, at: null, by: null };
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
        return { artNo: x.artNo, name: x.name, heightInch: x.heightInch, image: x.image,
                 orderQty: Number(x.quantity || 0), sentQty: 0,
                 weight: Number(x.weight || 0), sentTotal: 0 };
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
        return { order: o, info: info, merged: merged, sentQty: sentQty, sentWt: sentWt,
                 jamaDone: j.done, jamaAt: j.at, jamaBy: j.by };
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
      ? '<span class="rcv-status-badge full" title="Fully dispatched to HO"><i class="fas fa-check-circle"></i> RECEIVED</span>'
      : '<span class="rcv-status-badge partial" title="Some quantity is still pending at the branch"><i class="fas fa-hourglass-half"></i> PARTIALLY RECEIVED</span>';
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
     DOM — deferred
     ============================================================ */
  function $id(id) { return document.getElementById(id); }

  var partyInput, partyHidden, partyList, partyClearBtn, partyHelp,
      addressInput, cellInput, partySearchWrap,
      partyStep, orderStep, nextBtn, backBtn, previewBtn,
      orderDateInput, deliveryDateInput, estimateNoInput, groupSelect, touchSelect, noteInput,
      artNoInput, artList, qtyInput, addItemBtn, clearItemBtn,
      itemImageEl, imageMissing, previewBox,
      itemNameEl, itemGroupEl, itemInchEl, itemMmEl, itemWeightEl, itemTotalEl,
      orderBody, totalQtyEl, totalWeightEl,
      previewModal, previewContent, closePreview, editPreviewBtn,
      downloadPdfBtn, downloadExcelBtn, saveEstimationBtn, newEstimationBtn, submitStatus,
      estimationsModal, closeEstimations, estimationsList, estimationsTopBtn,
      estimationDetailModal, closeEstimationDetail, estimationDetailContent,
      estimationPdfBtn, estimationExcelBtn, newEstimationDetailBtn,
      estimationDetailStatus, backToEstListBtn, detailWorkshopSelect,
      detailForwardBtn, estimationForwardBar,
      detailSplitCount, splitConfigPanel, splitPartsWrap, splitValidationMsg,
      splitConfigHint, splitAutoByQtyBtn, splitAutoByArtBtn, splitAutoByNameBtn, splitResetBtn,
      pendingTopBtn, pendingModal, closePending, pendingList,
      newEstimationTopBtn,
      receivedTopBtnEl, receivedStockDot, receivedModal, closeReceivedBtn,
      receivedList, receivedCountLabel, receivedPrintBtn, receivedExcelBtn,
      receivedDetailModal, closeReceivedDetail, receivedDetailContent,
      receivedDetailPdfBtn, receivedDetailExcelBtn, backToReceivedBtn,
      activeReceived = null;

  function cacheDom() {
    partyInput      = $id('partySearchInput');
    partyHidden     = $id('partyName');
    partyList       = $id('partyList');
    partyClearBtn   = $id('partyClearBtn');
    partyHelp       = $id('partyHelp');
    addressInput    = $id('address');
    cellInput       = $id('cellNo');
    partySearchWrap = $id('partySearchWrap');

    partyStep       = $id('partyStep');
    orderStep       = $id('orderStep');
    nextBtn         = $id('nextBtn');
    backBtn         = $id('backBtn');
    previewBtn      = $id('previewBtn');

    orderDateInput    = $id('orderDate');
    deliveryDateInput = $id('deliveryDate');
    estimateNoInput   = $id('estimateNo');
    groupSelect       = $id('productGroup');
    touchSelect       = $id('touch');
    noteInput         = $id('note');

    artNoInput   = $id('artNo');
    artList      = $id('artList');
    qtyInput     = $id('orderQty');
    addItemBtn   = $id('addItemBtn');
    clearItemBtn = $id('clearItemBtn');
    itemImageEl  = $id('itemImage');
    imageMissing = $id('imageMissing');
    previewBox   = $id('productPreview');
    itemNameEl   = $id('itemName');
    itemGroupEl  = $id('itemGroup');
    itemInchEl   = $id('itemInch');
    itemMmEl     = $id('itemMm');
    itemWeightEl = $id('itemWeight');
    itemTotalEl  = $id('itemTotalWeight');

    orderBody     = $id('orderBody');
    totalQtyEl    = $id('totalQty');
    totalWeightEl = $id('totalWeight');

    previewModal      = $id('previewModal');
    previewContent    = $id('previewContent');
    closePreview      = $id('closePreview');
    editPreviewBtn    = $id('editPreviewBtn');
    downloadPdfBtn    = $id('downloadPdfBtn');
    downloadExcelBtn  = $id('downloadExcelBtn');
    saveEstimationBtn = $id('saveEstimationBtn');
    newEstimationBtn  = $id('newEstimationBtn');
    submitStatus      = $id('submitStatus');

    estimationsModal  = $id('estimationsModal');
    closeEstimations  = $id('closeEstimations');
    estimationsList   = $id('estimationsList');
    estimationsTopBtn = $id('estimationsTopBtn');

    estimationDetailModal   = $id('estimationDetailModal');
    closeEstimationDetail   = $id('closeEstimationDetail');
    estimationDetailContent = $id('estimationDetailContent');
    estimationPdfBtn        = $id('estimationPdfBtn');
    estimationExcelBtn      = $id('estimationExcelBtn');
    newEstimationDetailBtn  = $id('newEstimationDetailBtn');
    estimationDetailStatus  = $id('estimationDetailStatus');
    backToEstListBtn        = $id('backToEstListBtn');
    detailWorkshopSelect    = $id('detailWorkshopSelect');
    detailForwardBtn        = $id('detailForwardBtn');
    estimationForwardBar    = $id('estimationForwardBar');

    detailSplitCount   = $id('detailSplitCount');
    splitConfigPanel   = $id('splitConfigPanel');
    splitPartsWrap     = $id('splitPartsWrap');
    splitValidationMsg = $id('splitValidationMsg');
    splitConfigHint    = $id('splitConfigHint');
    splitAutoByQtyBtn  = $id('splitAutoByQtyBtn');
    splitAutoByArtBtn  = $id('splitAutoByArtBtn');
    splitAutoByNameBtn = $id('splitAutoByNameBtn');
    splitResetBtn      = $id('splitResetBtn');

    pendingTopBtn = $id('pendingTopBtn');
    pendingModal  = $id('pendingModal');
    closePending  = $id('closePending');
    pendingList   = $id('pendingList');

    newEstimationTopBtn = $id('newEstimationTopBtn');

    receivedTopBtnEl       = $id('receivedTopBtn');
    receivedStockDot       = $id('receivedStockDot');
    receivedModal          = $id('receivedModal');
    closeReceivedBtn       = $id('closeReceived');
    receivedList           = $id('receivedList');
    receivedCountLabel     = $id('receivedCountLabel');
    receivedPrintBtn       = $id('receivedPrintBtn');
    receivedExcelBtn       = $id('receivedExcelBtn');
    receivedDetailModal    = $id('receivedDetailModal');
    closeReceivedDetail    = $id('closeReceivedDetail');
    receivedDetailContent  = $id('receivedDetailContent');
    receivedDetailPdfBtn   = $id('receivedDetailPdfBtn');
    receivedDetailExcelBtn = $id('receivedDetailExcelBtn');
    backToReceivedBtn      = $id('backToReceivedBtn');
  }

  /* ============================================================
     RECEIVED ORDERS — indicator / render / detail
     ============================================================ */
  function refreshReceivedIndicator() {
    if (!receivedStockDot || !receivedTopBtnEl) return;
    var seen = getSeenReceivedIds();
    var received = getReceivedOrders();
    var unseen = received.filter(function (r) { return seen.indexOf(r.order.id) === -1; });
    if (unseen.length > 0) {
      receivedStockDot.textContent = unseen.length > 99 ? '99+' : String(unseen.length);
      receivedStockDot.classList.remove('hidden');
    } else {
      receivedStockDot.classList.add('hidden');
    }
    if (received.length > 0) {
      receivedTopBtnEl.classList.add('has-new-stock');
      receivedTopBtnEl.setAttribute('title', received.length + ' order(s) awaiting Jama completion in Post Production');
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
    if (receivedCountLabel) receivedCountLabel.innerHTML = received.length + ' received order(s) awaiting Jama';
    if (!received.length) {
      receivedList.innerHTML = '<div class="empty-list">No received orders awaiting Jama. Orders appear here after a branch clicks <b>Send Ready Stock to HO</b>, and disappear once their Jama is completed in <b>Post Production → Stage-2</b>.</div>';
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
      html += '<div class="branch-section"><h3>' + escapeHtml(branch)
           +  ' <span class="bs-stats">'
           +    '<span><b>' + list.length + '</b> orders</span>'
           +    '<span><b>' + formatNumber(totQty) + '</b> pcs</span>'
           +    '<span><b>' + formatNumber2(totWt) + '</b> g</span>'
           +    (branchAwaiting ? '<span class="bs-jama"><b>' + branchAwaiting + '</b> awaiting Jama</span>' : '')
           +  '</span></h3>'
           +  '<div class="list-table"><table><thead><tr>'
           +    '<th>ORDER NO.</th><th>EST. NO.</th><th>GROUP</th>'
           +    '<th>ORDER QTY</th><th>SENT QTY</th>'
           +    '<th>ORDER WT</th><th>SENT WT</th>'
           +    '<th>RECEIVED</th><th>JAMA</th><th>ACTION</th>'
           +  '</tr></thead><tbody>';
      list.forEach(function (r) {
        var o = r.order, info = r.info;
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
      b.addEventListener('click', function (e) { e.stopPropagation(); openReceivedDetail(b.dataset.viewRid); });
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
    var html = '<h2 class="preview-title">RECEIVED ORDER — ' + escapeHtml(o.orderNo || '—') + ' ' + status.badgeHtml + '</h2>';
    html += '<div class="preview-meta">'
         +  '<div><span>BRANCH / WORKSHOP</span><b>' + escapeHtml(o.workshop || '—') + '</b></div>'
         +  '<div><span>ESTIMATION NO.</span><b>' + escapeHtml(o.estimateNo || '—') + '</b></div>'
         +  '<div><span>PRODUCT GROUP</span><b>' + escapeHtml(o.productGroup || '—') + '</b></div>'
         +  '<div><span>TOUCH</span><b>' + escapeHtml(o.touch || '—') + '</b></div>'
         +  '<div><span>ORDER DATE</span><b>' + formatDate(o.orderDate) + '</b></div>'
         +  '<div><span>DELIVERY</span><b>' + formatDate(o.deliveryDate) + '</b></div>'
         +  '<div><span>ORDER QTY</span><b>' + formatNumber(o.totalQty) + '</b></div>'
         +  '<div><span>ORDER WEIGHT</span><b>' + formatNumber2(o.totalWeight) + ' g</b></div>'
         +  '<div><span>SENT QTY</span><b style="color:#8c004c">' + formatNumber(rec.sentQty) + '</b></div>'
         +  '<div><span>SENT WEIGHT</span><b style="color:#8c004c">' + formatNumber2(rec.sentWt) + ' g</b></div>'
         +  '</div>';
    html += '<div class="preview-party">'
         +  '<div><span>RECEIVED AT</span><b>' + (info.completedAt ? formatDate(String(info.completedAt).slice(0,10)) + ' ' + new Date(info.completedAt).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}) : '—') + '</b></div>'
         +  '<div><span>NOTE</span><b>' + escapeHtml(o.note || '—') + '</b></div>'
         +  '</div>';
    html += '<div class="table-wrap"><table class="preview-table"><thead><tr>'
         +  '<th>SL</th><th>ART NO.</th><th>NAME</th><th>SIZE</th>'
         +  '<th>ORDER QTY</th><th>SENT QTY</th>'
         +  '<th>WEIGHT (g)</th><th>SENT TOTAL (g)</th><th>IMAGE</th>'
         +  '</tr></thead><tbody>';
    rec.merged.forEach(function (x, i) {
      var qtyDiff = Number(x.sentQty) - Number(x.orderQty);
      var qtyCls  = qtyDiff === 0 ? 'diff-same' : (qtyDiff > 0 ? 'diff-up' : 'diff-down');
      html += '<tr>'
           +  '<td>' + (i + 1) + '</td>'
           +  '<td>' + escapeHtml(x.artNo) + '</td>'
           +  '<td>' + escapeHtml(x.name) + '</td>'
           +  '<td>' + escapeHtml(x.heightInch || '—') + '</td>'
           +  '<td>' + formatNumber(x.orderQty) + '</td>'
           +  '<td class="' + qtyCls + '"><b>' + formatNumber(x.sentQty) + '</b></td>'
           +  '<td>' + formatNumber2(x.weight) + '</td>'
           +  '<td><b>' + formatNumber2(x.sentTotal) + '</b></td>'
           +  '<td>' + safeImg(x.image, 'preview-product-image', '—') + '</td>'
           +  '</tr>';
    });
    html += '</tbody><tfoot>'
         +  '<tr class="preview-total">'
         +    '<td colspan="4" class="total-label">ORDER TOTAL</td>'
         +    '<td>' + formatNumber(o.totalQty) + '</td><td></td><td></td>'
         +    '<td>' + formatNumber2(o.totalWeight) + '</td><td></td>'
         +  '</tr>'
         +  '<tr class="preview-total" style="background:#e0c7c7">'
         +    '<td colspan="4" class="total-label">DISPATCHED TOTAL</td>'
         +    '<td></td><td>' + formatNumber(rec.sentQty) + '</td><td></td>'
         +    '<td>' + formatNumber2(rec.sentWt) + '</td><td></td>'
         +  '</tr>'
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
      html += '<div class="jama-confirmed-banner"><i class="fas fa-check-circle"></i>'
           +  '<div><b>Jama completed</b>'
           +  (j.at ? ' on ' + new Date(j.at).toLocaleString('en-IN') : '')
           +  (j.by ? ' by ' + escapeHtml(j.by) : '')
           +  '</div></div>';
    } else {
      html += '<div class="jama-confirmed-banner awaiting"><i class="fas fa-hourglass-half"></i>'
           +  '<div><b>Awaiting Jama completion</b> in Post Production</div></div>';
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
      if (!!fresh.jamaDone !== !!rec.jamaDone) openReceivedDetail(orderId);
    }, 4000);
  }

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
    var filtered = q
      ? names.filter(function (n) {
          var p = normParty(parties[n]);
          return n.toLowerCase().indexOf(q) !== -1
              || String(p.cell || '').toLowerCase().indexOf(q) !== -1
              || String(p.city || '').toLowerCase().indexOf(q) !== -1;
        })
      : names;
    if (!filtered.length) {
      partyList.innerHTML = '<div class="searchable-empty"><i class="fas fa-search"></i> No matching parties. Add one in PARTY MASTER.</div>';
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
    partyList.querySelectorAll('.searchable-option').forEach(function (opt) {
      opt.addEventListener('mousedown', function (e) { e.preventDefault(); selectParty(opt.dataset.name); });
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
            artNo: artNo, name: p.name || artNo, group: group, sheet: sheetName,
            heightInch: p.heightInch || '', sizeMm: p.sizeMm || '',
            weight: Number(p.weight || 0), image: p.image || ''
          };
          flat[artNo + '::' + group] = norm;
          (byGroup[group] = byGroup[group] || []).push(artNo);
          (global[artNo] = global[artNo] || []).push(norm);
        });
      });
    });
    return { flat: flat, byGroup: byGroup, global: global };
  }

  function normaliseEditorGroup(grp) {
    if (!grp || typeof grp !== 'object') return grp;
    if (grp.sheetImages && grp.sheets) {
      Object.keys(grp.sheetImages).forEach(function (sheetName) {
        var img = grp.sheetImages[sheetName];
        if (!img) return;
        (grp.sheets[sheetName] || []).forEach(function (p) { if (!p.image) p.image = img; });
      });
    }
    return grp;
  }

  function loadProductCatalog() {
    var raw = {};
    var stored = _readJSON(CATALOGUE_KEY, null);
    if (stored && typeof stored === 'object' && Object.keys(stored).length) {
      Object.keys(stored).forEach(function (g) { raw[g] = stored[g]; });
    }
    var updates = _readJSON(CATALOGUE_UPDATES_KEY, null);
    if (updates && typeof updates === 'object' && Object.keys(updates).length) {
      Object.keys(updates).forEach(function (g) {
        var grp = updates[g];
        if (grp && typeof grp === 'object' && (grp.sheets || Array.isArray(grp))) raw[g] = normaliseEditorGroup(grp);
      });
    }
    CATALOGUE_EXTRA_KEYS.forEach(function (k) {
      var extra = _readJSON(k, null);
      if (!extra || typeof extra !== 'object' || !Object.keys(extra).length) return;
      var keys = Object.keys(extra);
      var wrapped = keys.some(function (kk) {
        var v = extra[kk];
        return v && typeof v === 'object' && (v.sheets || Array.isArray(v));
      });
      if (wrapped) {
        keys.forEach(function (g) { if (!raw[g]) raw[g] = extra[g]; });
      } else if (extra.sheets) {
        var derived = k.toUpperCase().replace('GOLDPRINCE_CATALOGUE_', '').replace(/_/g, ' ');
        if (!raw[derived]) raw[derived] = extra;
      }
    });
    Object.keys(EMBEDDED_CATALOGUE).forEach(function (g) {
      if (!raw[g] || !raw[g].sheets || !Object.keys(raw[g].sheets).length) raw[g] = EMBEDDED_CATALOGUE[g];
    });
    var parsed = flattenCatalogue(raw);
    productCatalog        = parsed.flat;
    productCatalogByGroup = parsed.byGroup;
    productCatalogGlobal  = parsed.global;
    rebuildArtDatalist();
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

  var PRODUCT_FALLBACK_ORDER = ['JEWELLERY', 'GOD FRAMES', '3D PREMIUM IDOLS', '3D IDOLS', '2D IDOLS'];

  function getProduct(artNo) {
    if (!artNo) return null;
    var key = String(artNo).trim();
    var hit = productCatalog[key + '::' + currentGroupFilter];
    if (hit) return hit;
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
    var lower = key.toLowerCase();
    var allKeys = Object.keys(productCatalogGlobal);
    for (var i = 0; i < allKeys.length; i++) {
      if (allKeys[i].toLowerCase() === lower) return productCatalogGlobal[allKeys[i]][0];
    }
    return null;
  }

  /* ---- IMAGE FIX: attach onerror BEFORE assigning src ---- */
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

    if (itemImageEl && imageMissing) {
      itemImageEl.onerror = function () {
        itemImageEl.onerror = null;
        itemImageEl.removeAttribute('src');
        itemImageEl.style.display = 'none';
        imageMissing.style.display = 'block';
      };
      if (p.image) {
        itemImageEl.style.display = '';
        imageMissing.style.display = 'none';
        itemImageEl.src = p.image;
      } else {
        itemImageEl.removeAttribute('src');
        itemImageEl.style.display = 'none';
        imageMissing.style.display = 'block';
      }
    }
    previewBox.classList.remove('hidden');
  }

  function autoFocusQtyIfValid() {
    var artNo = artNoInput.value.trim();
    if (!artNo) return;
    if (getProduct(artNo)) {
      updatePreviewFromArt();
      if (document.activeElement !== qtyInput) { qtyInput.focus(); qtyInput.select(); }
    }
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
      var img = it.image
        ? safeImg(it.image, 'table-product-image', '<span style="color:#999;font-size:11px">No image</span>')
        : '<span style="color:#999;font-size:11px">No image</span>';
      return '<tr data-idx="' + idx + '">'
           +   '<td>' + (idx + 1) + '</td>'
           +   '<td>' + escapeHtml(it.artNo) + '</td>'
           +   '<td>' + escapeHtml(it.name) + '</td>'
           +   '<td>' + escapeHtml(it.heightInch || '—') + '</td>'
           +   '<td>' + formatNumber2(it.weight) + '</td>'
           +   '<td>' + formatNumber(it.quantity) + '</td>'
           +   '<td>' + formatNumber2(it.totalWeight) + '</td>'
           +   '<td>' + img + '</td>'
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
         +  '<div><span>PARTY</span><b>' + escapeHtml(order.partyName) + '</b></div>'
         +  '<div><span>ORDER DATE</span><b>' + formatDate(order.orderDate) + '</b></div>'
         +  '<div><span>DELIVERY</span><b>' + formatDate(order.deliveryDate) + '</b></div>'
         +  '<div><span>ESTIMATION NO.</span><b>' + escapeHtml(order.estimateNo) + '</b></div>'
         +  '<div><span>PRODUCT GROUP</span><b>' + escapeHtml(order.productGroup) + '</b></div>'
         +  '<div><span>TOUCH</span><b>' + escapeHtml(order.touch) + '</b></div>'
         +  '<div><span>TOTAL QTY</span><b>' + formatNumber(order.totalQty) + '</b></div>'
         +  '<div><span>TOTAL WEIGHT</span><b>' + formatNumber2(order.totalWeight) + ' g</b></div>'
         +  '</div>';
    html += '<div class="preview-party">'
         +  '<div><span>ADDRESS</span><b>' + escapeHtml(order.address || '—') + '</b></div>'
         +  '<div><span>CELL NO.</span><b>' + escapeHtml(order.cellNo || '—') + '</b></div>'
         +  '</div>';
    html += '<div class="table-wrap"><table class="preview-table"><thead><tr>'
         +  '<th>SL</th><th>ART NO.</th><th>NAME</th><th>SIZE</th><th>WT(g)</th><th>QTY</th><th>TOTAL WT</th><th>IMAGE</th>'
         +  '</tr></thead><tbody>';
    order.items.forEach(function (it, i) {
      html += '<tr>'
           +  '<td>' + (i + 1) + '</td>'
           +  '<td>' + escapeHtml(it.artNo) + '</td>'
           +  '<td>' + escapeHtml(it.name) + '</td>'
           +  '<td>' + escapeHtml(it.heightInch || '—') + '</td>'
           +  '<td>' + formatNumber2(it.weight) + '</td>'
           +  '<td>' + formatNumber(it.quantity) + '</td>'
           +  '<td>' + formatNumber2(it.totalWeight) + '</td>'
           +  '<td>' + safeImg(it.image, 'preview-product-image', '—') + '</td>'
           +  '</tr>';
    });
    html += '</tbody><tfoot><tr class="preview-total">'
         +  '<td colspan="5" class="total-label">TOTAL</td>'
         +  '<td>' + formatNumber(order.totalQty) + '</td>'
         +  '<td>' + formatNumber2(order.totalWeight) + '</td><td></td></tr></tfoot></table></div>';
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

  /* ============================================================
     RESET / SAVE
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

  function openPendingEstimationsModal() {
    if (!estimationsModal) { console.warn('[order-form.js] estimationsModal missing'); return; }
    renderEstimations();
    estimationsModal.classList.remove('hidden');
  }

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
             +   '<th>EST. NO.</th><th>EST. DATE</th><th>PARTY</th><th>GROUP</th>'
             +   '<th>TOUCH</th><th>QTY</th><th>WT (g)</th><th>ACTION</th>'
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

  function openEstimationDetail(estNo) {
    var list = _readJSON(ESTIMATIONS_KEY, []);
    activeEstimation = (list || []).find(function (e) { return e.estimateNo === estNo; }) || null;
    if (!activeEstimation) { alert('Estimation not found.'); return; }
    var e = activeEstimation;
    var estDate = e.estimationDate || e.orderDate || e.savedAt || e.createdAt;
    var html = '<h2 class="preview-title">ESTIMATION ' + escapeHtml(e.estimateNo) + '</h2>';
    html += '<div class="preview-meta">'
         +  '<div><span>PARTY</span><b>' + escapeHtml(e.partyName || '—') + '</b></div>'
         +  '<div><span>EST. DATE</span><b>' + formatDate(estDate) + '</b></div>'
         +  '<div><span>ORDER DATE</span><b>' + formatDate(e.orderDate) + '</b></div>'
         +  '<div><span>DELIVERY</span><b>' + formatDate(e.deliveryDate) + '</b></div>'
         +  '<div><span>PRODUCT GROUP</span><b>' + escapeHtml(e.productGroup || '—') + '</b></div>'
         +  '<div><span>TOUCH</span><b>' + escapeHtml(e.touch || '—') + '</b></div>'
         +  '<div><span>TOTAL QTY</span><b>' + formatNumber(e.totalQty) + '</b></div>'
         +  '<div><span>TOTAL WEIGHT</span><b>' + formatNumber2(e.totalWeight) + ' g</b></div>'
         +  '</div>';
    html += '<div class="preview-party">'
         +  '<div><span>ADDRESS</span><b>' + escapeHtml(e.address || '—') + '</b></div>'
         +  '<div><span>CELL NO.</span><b>' + escapeHtml(e.cellNo || '—') + '</b></div>'
         +  '</div>';
    html += '<div class="table-wrap"><table class="preview-table"><thead><tr>'
         +  '<th>SL</th><th>ART NO.</th><th>NAME</th><th>SIZE</th><th>WT(g)</th><th>QTY</th><th>TOTAL WT</th><th>IMAGE</th>'
         +  '</tr></thead><tbody>';
    (e.items || []).forEach(function (it, i) {
      html += '<tr>'
           +  '<td>' + (i + 1) + '</td>'
           +  '<td>' + escapeHtml(it.artNo) + '</td>'
           +  '<td>' + escapeHtml(it.name) + '</td>'
           +  '<td>' + escapeHtml(it.heightInch || '—') + '</td>'
           +  '<td>' + formatNumber2(it.weight) + '</td>'
           +  '<td>' + formatNumber(it.quantity) + '</td>'
           +  '<td>' + formatNumber2(it.totalWeight) + '</td>'
           +  '<td>' + safeImg(it.image, 'preview-product-image', '—') + '</td>'
           +  '</tr>';
    });
    html += '</tbody><tfoot><tr class="preview-total">'
         +  '<td colspan="5" class="total-label">TOTAL</td>'
         +  '<td>' + formatNumber(e.totalQty) + '</td>'
         +  '<td>' + formatNumber2(e.totalWeight) + '</td><td></td>'
         +  '</tr></tfoot></table></div>';
    if (e.note) html += '<p style="margin-top:12px;font-size:12px"><b>Note:</b> ' + escapeHtml(e.note) + '</p>';
    estimationDetailContent.innerHTML = html;
    if (estimationDetailStatus) estimationDetailStatus.textContent = '';
    if (detailWorkshopSelect) detailWorkshopSelect.value = '';
    if (detailSplitCount) detailSplitCount.value = '1';
    resetSplitState();
    renderSplitUI();
    estimationDetailModal.classList.remove('hidden');
  }
