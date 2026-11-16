buildNavbar();

/* ============================================================
   STATE
   ============================================================ */
let cartItems = [];
let holdItems = [];
let currentMode = 'stockout';

/* ============================================================
   DATE HELPERS — LOCAL DATE
   ============================================================ */
function todayIso() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function isoToDisplay(iso) {
    if (!iso) return '-';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(iso)) return iso;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return iso;
}

function toIso(str) {
    if (!str) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return str;
}

/* ============================================================
   MODE SWITCH
   ============================================================ */
function switchMode(mode) {
    currentMode = mode;
    document.getElementById('tabStockOut').classList.toggle('active', mode === 'stockout');
    document.getElementById('tabHoldStock').classList.toggle('active', mode === 'holdstock');
    document.getElementById('tabHeldStock').classList.toggle('active', mode === 'heldstock');
    document.getElementById('panelStockOut').classList.toggle('active', mode === 'stockout');
    document.getElementById('panelHoldStock').classList.toggle('active', mode === 'holdstock');
    document.getElementById('panelHeldStock').classList.toggle('active', mode === 'heldstock');
    if (mode === 'heldstock') renderHeldStockList();
}

/* ============================================================
   INIT
   ============================================================ */
document.getElementById('fDate').value = todayIso();
document.getElementById('fInvoiceNo').value = Store.getNextInvoiceNo();
document.getElementById('txnFilterDate').value = todayIso();
document.getElementById('heldFilterDate').value = '';

function refreshArtList() {
    const dl1 = document.getElementById('artList');
    const dl2 = document.getElementById('artListHold');
    const opts = Store.getCatalogue().map(c => `<option value="${c.art}">${c.name}</option>`).join('');
    if (dl1) dl1.innerHTML = opts;
    if (dl2) dl2.innerHTML = opts;
}

/* ============================================================
   SEARCHABLE PARTY PICKER
   ============================================================ */
function createPartyPicker(cfg) {
    const inputEl   = document.getElementById(cfg.inputId);
    const listEl    = document.getElementById(cfg.listId);
    const clearBtn  = document.getElementById(cfg.clearBtnId);
    if (!inputEl || !listEl) return;

    let highlightIdx = -1;

    const parties = () => Store.getParties().slice().sort((a, b) => {
        return String(a.id || '').toLowerCase().localeCompare(String(b.id || '').toLowerCase());
    });

    function render(query) {
        const q = String(query || '').trim().toLowerCase();
        let names = parties();
        if (q) {
            names = names.filter(p => {
                const hay = (String(p.id || '') + ' ' + String(p.name || '')).toLowerCase();
                return hay.indexOf(q) !== -1;
            });
        }

        if (!names.length) {
            listEl.innerHTML = '<div class="searchable-empty"><i class="fas fa-info-circle"></i> No parties match. Add them in Party Master.</div>';
            listEl.classList.add('show');
            return;
        }

        listEl.innerHTML = names.map((p, i) => {
            const meta = [p.cell || '', p.address || ''].filter(Boolean).join(' · ');
            return '<div class="searchable-option" data-id="' + escapeAttr(p.id) + '" data-idx="' + i + '">'
                 +   '<i class="fas fa-user"></i>'
                 +   '<span class="opt-main">' + escapeHtml(p.id) + ' - ' + escapeHtml(p.name) + '</span>'
                 +   (meta ? '<span class="opt-meta">' + escapeHtml(meta) + '</span>' : '')
                 + '</div>';
        }).join('');

        listEl.querySelectorAll('.searchable-option').forEach(el => {
            el.addEventListener('click', () => select(el.dataset.id));
        });

        listEl.classList.add('show');
    }

    function hide() { listEl.classList.remove('show'); }

    function select(id) {
        const party = Store.getPartyById(id);
        if (!party) return;
        document.getElementById(cfg.hiddenId).value = party.id;
        inputEl.value = party.id + ' - ' + party.name;
        document.getElementById(cfg.nameId).value = party.name;
        document.getElementById(cfg.cellId).value = party.cell || '';
        document.getElementById(cfg.addressId).value = party.address || '';
        hide();
        if (typeof cfg.onSelect === 'function') cfg.onSelect(party);
    }

    function highlight(items) {
        items.forEach((el, i) => el.classList.toggle('highlight', i === highlightIdx));
        if (items[highlightIdx]) items[highlightIdx].scrollIntoView({ block: 'nearest' });
    }

    inputEl.addEventListener('input', function () {
        highlightIdx = -1;
        render(this.value);
    });
    inputEl.addEventListener('focus', function () { render(this.value); });
    inputEl.addEventListener('keydown', function (e) {
        const items = listEl.querySelectorAll('.searchable-option');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightIdx = Math.min(highlightIdx + 1, items.length - 1);
            highlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightIdx = Math.max(highlightIdx - 1, 0);
            highlight(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightIdx >= 0 && items[highlightIdx]) select(items[highlightIdx].dataset.id);
            else if (items.length > 0) select(items[0].dataset.id);
        } else if (e.key === 'Escape') {
            hide(); inputEl.blur();
        }
    });

    clearBtn.addEventListener('click', function () {
        inputEl.value = '';
        document.getElementById(cfg.hiddenId).value = '';
        document.getElementById(cfg.nameId).value = '';
        document.getElementById(cfg.cellId).value = '';
        document.getElementById(cfg.addressId).value = '';
        if (typeof cfg.onClear === 'function') cfg.onClear();
        render('');
        inputEl.focus();
    });

    document.addEventListener('click', function (e) {
        if (!e.target.closest('#' + cfg.wrapId)) hide();
    });
}

function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(v) { return escapeHtml(v); }

/* ============================================================
   AVAILABLE QTY / WEIGHT
   ============================================================ */
function getBalanceEntry(art) {
    const balance = Store.computeBalance();
    return balance.find(b => b.art.toLowerCase() === art.toLowerCase());
}

function getAvailableQty(art) {
    const item = getBalanceEntry(art);
    const base = item && item.qty != null ? Number(item.qty) : 0;
    const held = Store.getHeldQtyForArt(art);
    return Math.max(0, base - held);
}

function getAvailableWeight(art) {
    const item = getBalanceEntry(art);
    let physicalWeight = null;
    if (item && item.weight != null) {
        physicalWeight = Number(item.weight);
    } else {
        try {
            let total = 0;
            const opening = Store.getOpeningStock ? Store.getOpeningStock() : [];
            opening.forEach(o => { if (o.art.toLowerCase() === art.toLowerCase()) total += Number(o.weight || 0); });
            const stockIn = Store.getStockIn ? Store.getStockIn() : [];
            stockIn.forEach(s => { if (s.art.toLowerCase() === art.toLowerCase()) total += Number(s.weight || 0); });
            const stockOut = Store.getStockOut ? Store.getStockOut() : [];
            stockOut.forEach(t => (t.items || []).forEach(i => {
                if (i.art.toLowerCase() === art.toLowerCase()) total -= Number(i.weight || 0);
            }));
            physicalWeight = total;
        } catch (e) {
            physicalWeight = null;
        }
    }

    if (physicalWeight == null) return null;

    let heldWeight = 0;
    try {
        const holds = Store.getHolds();
        Object.values(holds).forEach(list => {
            (list || []).forEach(h => {
                if (String(h.art).toLowerCase() === art.toLowerCase()) {
                    heldWeight += Number(h.weight || 0);
                }
            });
        });
    } catch (e) { /* ignore */ }

    return Math.max(0, physicalWeight - heldWeight);
}

/* ============================================================
   STOCK OUT — Enter flow
   ============================================================ */
document.getElementById('pArt').addEventListener('input', function () {
    const cat = Store.getCatalogueItem(this.value);
    document.getElementById('pName').value = cat ? cat.name : '';
    document.getElementById('pGroup').value = cat ? cat.group : '';
    if (cat) {
        const aq = getAvailableQty(this.value);
        const aw = getAvailableWeight(this.value);
        document.getElementById('pAvailable').value = aw == null
            ? `${aq} pcs`
            : `${aq} pcs / ${aw.toFixed(2)} g`;
    } else {
        document.getElementById('pAvailable').value = '';
    }
});

document.getElementById('pArt').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const art = this.value.trim();
    if (!art) return;
    const cat = Store.getCatalogueItem(art);
    if (!cat) { showToast('Art Number not in catalogue', 'error'); return; }
    document.getElementById('pQty').focus();
    document.getElementById('pQty').select();
});

document.getElementById('pQty').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const qty = parseInt(this.value);
    if (isNaN(qty) || qty <= 0) { showToast('Quantity must be > 0', 'error'); return; }
    document.getElementById('pWeight').focus();
    document.getElementById('pWeight').select();
});

document.getElementById('pWeight').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addProductToCart();
});

function addProductToCart() {
    const art = document.getElementById('pArt').value.trim();
    const qty = parseInt(document.getElementById('pQty').value);
    const weight = parseFloat(document.getElementById('pWeight').value) || 0;

    if (!art || isNaN(qty) || qty <= 0) {
        showToast('Enter valid Art Number and Quantity', 'error');
        return;
    }
    const cat = Store.getCatalogueItem(art);
    if (!cat) { showToast('Art Number not found in catalogue', 'error'); return; }

    const alreadyInCartQty = cartItems
        .filter(i => i.art.toLowerCase() === art.toLowerCase())
        .reduce((s, i) => s + i.qty, 0);
    const availableQty = getAvailableQty(art);
    if (qty + alreadyInCartQty > availableQty) {
        showToast(`Only ${availableQty} pcs available (${alreadyInCartQty} already in cart)`, 'error');
        return;
    }

    const availableWeight = getAvailableWeight(art);
    if (availableWeight != null) {
        const alreadyInCartWeight = cartItems
            .filter(i => i.art.toLowerCase() === art.toLowerCase())
            .reduce((s, i) => s + i.weight, 0);
        if (weight + alreadyInCartWeight > availableWeight) {
            showToast(
                `Weight exceeds available! Available: ${availableWeight.toFixed(2)} g ` +
                `(${alreadyInCartWeight.toFixed(2)} g already in cart)`,
                'error'
            );
            return;
        }
    }

    const existing = cartItems.find(i => i.art.toLowerCase() === art.toLowerCase());
    if (existing) {
        existing.qty += qty;
        existing.weight += weight;
    } else {
        cartItems.push({ art: cat.art, name: cat.name, qty, weight, group: cat.group });
    }

    resetProductEntry();
    renderCart();
    showToast('Item added to transaction', 'success');
}

function resetProductEntry() {
    document.getElementById('pArt').value = '';
    document.getElementById('pName').value = '';
    document.getElementById('pQty').value = 1;
    document.getElementById('pWeight').value = 0;
    document.getElementById('pGroup').value = '';
    document.getElementById('pAvailable').value = '';
    document.getElementById('pArt').focus();
}

function removeFromCart(index) { cartItems.splice(index, 1); renderCart(); }

function renderCart() {
    const tbody = document.getElementById('cartBody');
    const tfoot = document.getElementById('cartFooter');
    tbody.innerHTML = '';

    if (cartItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-message">No items added yet. Add products above.</td></tr>';
        tfoot.style.display = 'none';
        document.getElementById('cartCount').innerText = '0 items';
        return;
    }

    let totalQty = 0, totalWeight = 0;
    cartItems.forEach((item, idx) => {
        totalQty += item.qty;
        totalWeight += item.weight;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.art}</strong></td>
            <td>${item.name}</td>
            <td>${item.qty}</td>
            <td>${item.weight.toFixed(2)}</td>
            <td>${item.group || '-'}</td>
            <td><button class="danger btn-sm" onclick="removeFromCart(${idx})"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('cartTotalQty').innerText = totalQty;
    document.getElementById('cartTotalWeight').innerText = totalWeight.toFixed(2);
    document.getElementById('cartCount').innerText = cartItems.length + ' item(s)';
    tfoot.style.display = '';
}

/* ============================================================
   STOCK OUT — PREVIEW MODAL
   ============================================================ */
function openPreview() {
    const partyId = document.getElementById('fParty').value;
    if (!partyId) { showToast('Please select a Party first', 'error'); return; }
    if (cartItems.length === 0) { showToast('Add at least one product', 'error'); return; }

    const party = Store.getPartyById(partyId);
    if (!party) { showToast('Party not found', 'error'); return; }

    const invoiceNo = document.getElementById('fInvoiceNo').value.trim();
    if (!invoiceNo) { showToast('Estimation number is required', 'error'); return; }

    const dateIso = document.getElementById('fDate').value || todayIso();

    document.getElementById('previewEstNo').innerText = invoiceNo;
    document.getElementById('previewDate').innerText = isoToDisplay(dateIso);
    document.getElementById('previewPartyName').innerText = party.name;
    document.getElementById('previewPartyCell').innerText = 'Cell: ' + (party.cell || '-');
    document.getElementById('previewPartyAddress').innerText = party.address || '-';

    const catMap = {};
    Store.getCatalogue().forEach(c => { catMap[c.art.toLowerCase()] = c.image || ''; });

    const tbody = document.getElementById('previewItemsBody');
    tbody.innerHTML = cartItems.map(item => {
        const img = catMap[item.art.toLowerCase()];
        const imgHtml = img
            ? `<img src="${img}" class="product-img" style="width:50px;height:50px;object-fit:cover;border-radius:6px;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="img-placeholder" style="display:none;width:50px;height:50px;"><i class="fas fa-image"></i></div>`
            : `<div class="img-placeholder" style="width:50px;height:50px;"><i class="fas fa-image"></i></div>`;
        return `<tr>
            <td><strong>${item.art}</strong></td>
            <td>${item.name}</td>
            <td>${item.qty}</td>
            <td>${item.weight.toFixed(2)}</td>
            <td>${imgHtml}</td>
        </tr>`;
    }).join('');

    const tq = cartItems.reduce((s, i) => s + i.qty, 0);
    const tw = cartItems.reduce((s, i) => s + i.weight, 0);
    document.getElementById('previewTotalQty').innerText = tq;
    document.getElementById('previewTotalWeight').innerText = tw.toFixed(2);

    document.getElementById('previewModal').classList.add('active');
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('active');
}

function confirmSaveFromPreview() {
    closePreview();
    saveTransaction();
}

function saveTransaction() {
    const partyId = document.getElementById('fParty').value;
    if (!partyId) { showToast('Please select a Party first', 'error'); return; }
    if (cartItems.length === 0) { showToast('Add at least one product to the transaction', 'error'); return; }
    const party = Store.getPartyById(partyId);
    if (!party) { showToast('Party not found', 'error'); return; }

    const invoiceNo = document.getElementById('fInvoiceNo').value.trim();
    if (!invoiceNo) { showToast('Estimation number is required', 'error'); return; }

    const dateIso = document.getElementById('fDate').value || todayIso();
    const txnId = 'TXN-' + Date.now();

    const data = Store.getStockOut();
    data.push({
        txnId, invoiceNo, date: dateIso,
        partyId: party.id,
        partyName: party.name,
        partyAddress: party.address,
        partyCell: party.cell,
        items: JSON.parse(JSON.stringify(cartItems)),
        totalQty: cartItems.reduce((s, i) => s + i.qty, 0),
        totalWeight: cartItems.reduce((s, i) => s + i.weight, 0)
    });
    Store.setStockOut(data);
    Store.commitInvoiceNo();

    resetStockOutForm();
    if (document.getElementById('transactionsDetailsModal').classList.contains('active')) {
        renderTransactions();
    }
    showToast('Stock Out transaction saved', 'success');
}

function resetStockOutForm() {
    cartItems = [];
    document.getElementById('fParty').value = '';
    document.getElementById('fPartySearch').value = '';
    document.getElementById('fPartyName').value = '';
    document.getElementById('fPartyCell').value = '';
    document.getElementById('fPartyAddress').value = '';
    document.getElementById('fInvoiceNo').value = Store.getNextInvoiceNo();
    document.getElementById('fDate').value = todayIso();
    resetProductEntry();
    renderCart();
}

/* ============================================================
   STOCK OUT TRANSACTIONS — Details toggle + filters
   ============================================================ */
function toggleTransactionsDetails() {
    document.getElementById('transactionsDetailsModal').classList.add('active');
    renderTransactions();
}

function closeTransactionsDetails() {
    document.getElementById('transactionsDetailsModal').classList.remove('active');
}

function clearTxnFilters() {
    document.getElementById('txnFilterEst').value = '';
    document.getElementById('txnFilterDate').value = todayIso();
    document.getElementById('txnFilterParty').value = '';
    document.getElementById('txnFilterName').value = '';
    document.getElementById('txnFilterCategory').value = '';
    document.getElementById('txnFilterGroup').value = '';
    renderTransactions();
}

/* ============================================================
   FILTERED TRANSACTIONS — PER-ITEM filtering
   ============================================================ */
function getFilteredTransactions() {
    const data = Store.getStockOut();
    const catalogue = Store.getCatalogue();
    const catMap = {};
    catalogue.forEach(c => {
        catMap[c.art.toLowerCase()] = { category: c.category || '', image: c.image || '' };
    });

    const estFilter = (document.getElementById('txnFilterEst')?.value || '').trim().toLowerCase();
    const dateFilter = document.getElementById('txnFilterDate')?.value || '';
    const partyFilter = (document.getElementById('txnFilterParty')?.value || '').trim().toLowerCase();
    const nameFilter = (document.getElementById('txnFilterName')?.value || '').trim().toLowerCase();
    const catFilter = document.getElementById('txnFilterCategory')?.value || '';
    const grpFilter = document.getElementById('txnFilterGroup')?.value || '';

    const itemMatches = (i) => {
        const meta = catMap[i.art.toLowerCase()] || { category: '', image: '' };
        const matchName = !nameFilter ||
            (i.name || '').toLowerCase().includes(nameFilter) ||
            (i.art || '').toLowerCase().includes(nameFilter);
        const matchCat = !catFilter || meta.category === catFilter;
        const matchGrp = !grpFilter || i.group === grpFilter;
        return matchName && matchCat && matchGrp;
    };

    const itemFilterActive = !!(nameFilter || catFilter || grpFilter);

    const result = [];
    data.forEach((t, origIdx) => {
        const matchEst = !estFilter || (t.invoiceNo || '').toLowerCase().includes(estFilter);
        const matchDate = !dateFilter || toIso(t.date) === dateFilter;
        const matchParty = !partyFilter ||
            (t.partyName || '').toLowerCase().includes(partyFilter) ||
            (t.partyId || '').toLowerCase().includes(partyFilter);

        if (!matchEst || !matchDate || !matchParty) return;

        const items = Array.isArray(t.items) ? t.items : [];

        if (!itemFilterActive) {
            result.push({ txn: t, origIdx, items });
            return;
        }

        const matched = items.filter(itemMatches);
        if (matched.length === 0) return;

        result.push({
            txn: t,
            origIdx,
            items: matched,
            totalQty: matched.reduce((s, i) => s + (Number(i.qty) || 0), 0),
            totalWeight: matched.reduce((s, i) => s + (Number(i.weight) || 0), 0),
            partiallyFiltered: matched.length !== items.length
        });
    });

    return result;
}

/* ============================================================
   RENDER TRANSACTIONS
   ============================================================ */
function renderTransactions() {
    const filtered = getFilteredTransactions();
    const container = document.getElementById('transactionsList');
    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-message">No stock out transactions found</div>';
        return;
    }

    const catMap = {};
    Store.getCatalogue().forEach(c => { catMap[c.art.toLowerCase()] = c.image || ''; });

    filtered.slice().reverse().forEach(entry => {
        const { txn, origIdx, items } = entry;
        const displayQty = entry.partiallyFiltered ? entry.totalQty : txn.totalQty;
        const displayWt = entry.partiallyFiltered ? entry.totalWeight : (txn.totalWeight || 0);

        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid #e2e8f0; border-radius:12px; margin-bottom:15px; overflow:hidden;';
        card.innerHTML = `
            <div style="background:#f8fafc; padding:12px 15px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <strong style="color:#1e40af;"><i class="fas fa-file-invoice"></i> ${txn.invoiceNo || 'No Estimation'}</strong>
                    <span style="margin-left:12px; color:#64748b; font-size:0.85rem;">
                        <i class="fas fa-user"></i> ${txn.partyName}
                    </span>
                    <span style="margin-left:12px; color:#64748b; font-size:0.85rem;">
                        <i class="fas fa-phone"></i> ${txn.partyCell || '-'}
                    </span>
                    <span style="margin-left:12px; color:#64748b; font-size:0.85rem;">
                        <i class="fas fa-calendar"></i> ${isoToDisplay(txn.date)}
                    </span>
                    ${entry.partiallyFiltered ? `<span class="badge" style="margin-left:8px;">Filtered: ${items.length}/${(txn.items||[]).length} items</span>` : ''}
                </div>
                <div>
                    <span class="badge green">Qty: ${displayQty}</span>
                    <span class="badge orange">Wt: ${(displayWt || 0).toFixed(2)}g</span>
                    <button class="outline btn-sm" onclick="printOneEstimation(${origIdx})" style="margin-left:8px;" title="Print this estimation">
                        <i class="fas fa-print"></i>
                    </button>
                    <button class="danger btn-sm" onclick="deleteTransaction(${origIdx})" style="margin-left:4px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div style="padding:0 15px 8px; color:#64748b; font-size:0.82rem;">
                <i class="fas fa-map-marker-alt"></i> ${txn.partyAddress || '-'}
            </div>
            <div class="table-wrap" style="border:none; border-radius:0;">
                <table>
                    <thead>
                        <tr><th>Art No</th><th>Product Name</th><th>Category</th><th>Qty</th><th>Weight (g)</th><th>Group</th><th>Image</th></tr>
                    </thead>
                    <tbody>
                        ${items.map(i => {
                            const meta = catMap[i.art.toLowerCase()] || { category: '', image: '' };
                            const imgHtml = meta.image
                                ? `<img src="${meta.image}" class="product-img" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">`
                                : `<div class="img-placeholder" style="width:40px;height:40px;"><i class="fas fa-image"></i></div>`;
                            return `<tr>
                                <td><strong>${i.art}</strong></td>
                                <td>${i.name}</td>
                                <td>${meta.category ? `<span class="badge">${meta.category}</span>` : '-'}</td>
                                <td>${i.qty}</td>
                                <td>${(i.weight || 0).toFixed(2)}</td>
                                <td>${i.group || '-'}</td>
                                <td>${imgHtml}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background:#f8fafc; font-weight:700;">
                            <td colspan="3" style="text-align:right;">Estimation Grand Total:</td>
                            <td>${displayQty}</td>
                            <td>${(displayWt || 0).toFixed(2)}</td>
                            <td colspan="2"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        container.appendChild(card);
    });
}

function deleteTransaction(index) {
    if (!confirm('Delete this entire Stock Out transaction?')) return;
    const data = Store.getStockOut();
    data.splice(index, 1);
    Store.setStockOut(data);
    renderTransactions();
    showToast('Transaction deleted', 'success');
}

/* ============================================================
   IMAGE CACHE + PRELOADER
   ============================================================ */
const imgCache = {};

function preloadImages(urls, callback) {
    urls = [...new Set(urls.filter(Boolean))];
    if (urls.length === 0) { callback(); return; }

    let pending = urls.length;
    let fired = false;
    const tryFire = () => { if (!fired && pending <= 0) { fired = true; callback(); } };

    urls.forEach(url => {
        if (imgCache[url]) { pending--; tryFire(); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { imgCache[url] = img; pending--; tryFire(); };
        img.onerror = () => { pending--; tryFire(); };
        img.src = url;
    });
    tryFire();
}

/* ============================================================
   PRINT — ALL FILTERED TRANSACTIONS
   ============================================================ */
function printTransactions() {
    const filtered = getFilteredTransactions();
    if (filtered.length === 0) { showToast('No transactions to print', 'error'); return; }
    printEntries(filtered);
}

/* ============================================================
   PRINT — SINGLE ESTIMATION
   ============================================================ */
function printOneEstimation(origIdx) {
    const data = Store.getStockOut();
    const txn = data[origIdx];
    if (!txn) { showToast('Estimation not found', 'error'); return; }
    const items = Array.isArray(txn.items) ? txn.items : [];
    const entry = {
        txn,
        origIdx,
        items,
        totalQty: txn.totalQty,
        totalWeight: txn.totalWeight
    };
    printEntries([entry]);
}

/* ============================================================
   CORE PRINT RENDERER
   ============================================================ */
function printEntries(entries) {
    const catMap = {};
    Store.getCatalogue().forEach(c => { catMap[c.art.toLowerCase()] = c.image || ''; });

    const sections = entries.map(entry => {
        const { txn, items } = entry;
        const displayQty = entry.partiallyFiltered ? entry.totalQty : txn.totalQty;
        const displayWt = entry.partiallyFiltered ? entry.totalWeight : (txn.totalWeight || 0);

        return `
            <div style="margin-bottom:25px; page-break-inside:avoid;">
                <h3 style="margin:0 0 6px; color:#8c004c; font-size:1.05rem;">
                    Estimation: ${txn.invoiceNo || '-'}
                </h3>
                <div style="margin-bottom:6px; font-size:0.9rem;">
                    <strong>Party:</strong> ${txn.partyName} · <strong>Cell:</strong> ${txn.partyCell || '-'} ·
                    <strong>Date:</strong> ${isoToDisplay(txn.date)}
                </div>
                <div style="margin-bottom:8px; font-size:0.85rem; color:#555;">${txn.partyAddress || ''}</div>
                <table border="1" cellspacing="0" cellpadding="6" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                    <thead style="background:#f3f0f1;">
                        <tr>
                            <th>Art No</th><th>Product Name</th><th>Category</th>
                            <th>Qty</th><th>Weight (g)</th><th>Group</th><th>Image</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(i => {
                            const meta = catMap[i.art.toLowerCase()] || { category: '', image: '' };
                            return `<tr>
                                <td>${i.art}</td>
                                <td>${i.name}</td>
                                <td>${meta.category || '-'}</td>
                                <td style="text-align:right;">${i.qty}</td>
                                <td style="text-align:right;">${(i.weight || 0).toFixed(2)}</td>
                                <td>${i.group || '-'}</td>
                                <td>${meta.image ? `<img src="${meta.image}" style="width:36px;height:36px;object-fit:cover;">` : ''}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background:#f3f0f1; font-weight:800; color:#6b0132;">
                            <td colspan="3" style="text-align:right;">ESTIMATION GRAND TOTAL</td>
                            <td style="text-align:right;">${displayQty}</td>
                            <td style="text-align:right;">${(displayWt || 0).toFixed(2)}</td>
                            <td colspan="2"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
    }).join('');

    const overallQty = entries.reduce((s, e) =>
        s + (e.partiallyFiltered ? e.totalQty : (e.txn.totalQty || 0)), 0);
    const overallWt = entries.reduce((s, e) =>
        s + (e.partiallyFiltered ? e.totalWeight : (e.txn.totalWeight || 0)), 0);

    const overall = `
        <div style="margin-top:20px; padding:12px 16px; background:#8c004c; color:#fff; font-weight:800; font-size:1rem; border-radius:8px; display:flex; justify-content:space-between;">
            <span>OVERALL GRAND TOTAL (${entries.length} estimation${entries.length !== 1 ? 's' : ''})</span>
            <span>Qty: ${overallQty} · Weight: ${overallWt.toFixed(2)} g</span>
        </div>`;

    const w = window.open('', '_blank');
    w.document.write(`
        <html><head><title>Stock Out — Estimation Print</title>
        <style>
            body{font-family:'Segoe UI',sans-serif;padding:20px;color:#222;}
            h2{color:#8c004c;margin-bottom:4px;}
            .meta{color:#555;font-size:0.85rem;margin-bottom:18px;}
            table{width:100%;}
        </style>
        </head><body>
        <h2>Stock Out Estimation${entries.length !== 1 ? 's' : ''}</h2>
        <div class="meta">Generated: ${new Date().toLocaleString()}</div>
        ${sections}
        ${overall}
        <script>window.onload=()=>{setTimeout(()=>window.print(),500);}<\/script>
        </body></html>
    `);
    w.document.close();
}

/* ============================================================
   PDF EXPORT
   ============================================================ */
function downloadTxnsPDF() {
    const filtered = getFilteredTransactions();
    if (filtered.length === 0) { showToast('No transactions to export', 'error'); return; }

    const catMap = {};
    Store.getCatalogue().forEach(c => { catMap[c.art.toLowerCase()] = c.image || ''; });
    const urls = [];
    filtered.forEach(e => e.items.forEach(i => {
        const meta = catMap[i.art.toLowerCase()] || {};
        if (meta.image) urls.push(meta.image);
    }));

    showToast('Preparing PDF...', 'success');

    preloadImages(urls, () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        let y = 15;

        doc.setFontSize(16);
        doc.setTextColor(140, 0, 76);
        doc.text('Stock Out Transactions Report', 14, y);
        y += 8;

        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
        y += 6;

        filtered.forEach(entry => {
            const { txn, items } = entry;
            if (y > 175) { doc.addPage(); y = 15; }

            doc.setFontSize(12);
            doc.setTextColor(140, 0, 76);
            doc.text(`Estimation: ${txn.invoiceNo || '-'}`, 14, y);
            y += 5;

            doc.setFontSize(9);
            doc.setTextColor(70, 70, 70);
            doc.text(`Party: ${txn.partyName} | Cell: ${txn.partyCell || '-'} | Date: ${isoToDisplay(txn.date)}`, 14, y);
            y += 4;
            if (txn.partyAddress) {
                doc.text(`Address: ${txn.partyAddress}`, 14, y);
                y += 4;
            }

            const body = items.map(i => {
                const meta = catMap[i.art.toLowerCase()] || { category: '', image: '' };
                return [i.art, i.name, meta.category || '-', String(i.qty),
                        (i.weight || 0).toFixed(2), i.group || '-', ''];
            });
            const metaArr = items.map(i => ({ img: (catMap[i.art.toLowerCase()] || {}).image }));

            const displayQty = entry.partiallyFiltered ? entry.totalQty : txn.totalQty;
            const displayWt = entry.partiallyFiltered ? entry.totalWeight : (txn.totalWeight || 0);

            doc.autoTable({
                startY: y,
                head: [['Art No', 'Product', 'Category', 'Qty', 'Weight (g)', 'Group', 'Image']],
                body,
                styles: { fontSize: 8, cellPadding: 1.5, valign: 'middle' },
                headStyles: { fillColor: [140, 0, 76], textColor: 255 },
                columnStyles: {
                    0: { cellWidth: 22 },
                    1: { cellWidth: 62 },
                    2: { cellWidth: 28 },
                    3: { cellWidth: 14, halign: 'right' },
                    4: { cellWidth: 20, halign: 'right' },
                    5: { cellWidth: 22 },
                    6: { cellWidth: 22, minCellHeight: 14 }
                },
                foot: [[
                    { content: 'ESTIMATION GRAND TOTAL', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
                    { content: String(displayQty), styles: { fontStyle: 'bold', halign: 'right' } },
                    { content: (displayWt || 0).toFixed(2), styles: { fontStyle: 'bold', halign: 'right' } },
                    { content: '' },
                    { content: '' }
                ]],
                footStyles: { fillColor: [243, 240, 241], textColor: [107, 1, 50] },
                didDrawCell: hook => {
                    if (hook.section === 'body' && hook.column.index === 6) {
                        const m = metaArr[hook.row.index];
                        if (!m || !m.img || !imgCache[m.img]) return;
                        const img = imgCache[m.img];
                        if (!img.complete || !img.naturalWidth) return;
                        try {
                            const pad = 1;
                            const mw = hook.cell.width - pad * 2;
                            const mh = hook.cell.height - pad * 2;
                            let w = img.naturalWidth, h = img.naturalHeight;
                            const ratio = Math.min(mw / w, mh / h);
                            w *= ratio; h *= ratio;
                            const x = hook.cell.x + (hook.cell.width - w) / 2;
                            const y2 = hook.cell.y + (hook.cell.height - h) / 2;
                            doc.addImage(img, m.img.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y2, w, h);
                        } catch (err) {}
                    }
                }
            });

            y = doc.lastAutoTable.finalY + 8;
        });

        const overallQty = filtered.reduce((s, e) =>
            s + (e.partiallyFiltered ? e.totalQty : (e.txn.totalQty || 0)), 0);
        const overallWt = filtered.reduce((s, e) =>
            s + (e.partiallyFiltered ? e.totalWeight : (e.txn.totalWeight || 0)), 0);

        if (y > 265) { doc.addPage(); y = 15; }
        doc.setFontSize(11);
        doc.setTextColor(140, 0, 76);
        doc.text(
            `OVERALL GRAND TOTAL — Qty: ${overallQty}   Weight: ${overallWt.toFixed(2)} g`,
            14, y
        );

        doc.save('stock_out_transactions.pdf');
    });
}

/* ============================================================
   EXCEL EXPORT
   ============================================================ */
async function downloadTxnsExcel() {
    const filtered = getFilteredTransactions();
    if (filtered.length === 0) { showToast('No transactions to export', 'error'); return; }

    const catMap = {};
    Store.getCatalogue().forEach(c => { catMap[c.art.toLowerCase()] = c.image || ''; });
    const urls = [];
    filtered.forEach(e => e.items.forEach(i => {
        const meta = catMap[i.art.toLowerCase()] || {};
        if (meta.image) urls.push(meta.image);
    }));

    showToast('Preparing Excel...', 'success');

    preloadImages(urls, async () => {
        const wb = new ExcelJS.Workbook();
        const sheet = wb.addWorksheet('Stock Out');

        sheet.columns = [
            { header: 'Estimation', width: 16 },
            { header: 'Date', width: 14 },
            { header: 'Party', width: 24 },
            { header: 'Cell', width: 16 },
            { header: 'Address', width: 28 },
            { header: 'Art No', width: 14 },
            { header: 'Product', width: 28 },
            { header: 'Category', width: 18 },
            { header: 'Qty', width: 10 },
            { header: 'Weight (g)', width: 12 },
            { header: 'Group', width: 14 },
            { header: 'Image', width: 14 }
        ];

        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8C004C' } };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(1).height = 22;

        let r = 2;
        filtered.forEach(entry => {
            const { txn, items } = entry;
            const head = sheet.getRow(r++);
            head.values = [`Estimation: ${txn.invoiceNo || '-'} | Party: ${txn.partyName} | Date: ${isoToDisplay(txn.date)}`];
            head.font = { bold: true, color: { argb: 'FF8C004C' } };
            head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCEEDF5' } };
            head.mergeCells(`A${head.number}:L${head.number}`);

            items.forEach(item => {
                const meta = catMap[item.art.toLowerCase()] || { category: '', image: '' };
                const row = sheet.getRow(r++);
                row.values = [
                    txn.invoiceNo || '', isoToDisplay(txn.date), txn.partyName, txn.partyCell || '',
                    txn.partyAddress || '', item.art, item.name, meta.category || '-',
                    Number(item.qty) || 0, Number(item.weight) || 0, item.group || '-', ''
                ];
                row.height = 50;
                row.alignment = { vertical: 'middle' };
                row.getCell(9).alignment = { horizontal: 'right' };
                row.getCell(10).alignment = { horizontal: 'right' };
                row.getCell(10).numFmt = '0.00';

                if (meta.image && imgCache[meta.image] && imgCache[meta.image].naturalWidth > 0) {
                    try {
                        const imageId = wb.addImage({
                            base64: imgCache[meta.image].src,
                            extension: meta.image.startsWith('data:image/png') ? 'png' : 'jpeg'
                        });
                        sheet.addImage(imageId, {
                            tl: { col: 11.1, row: (row.number - 1) + 0.05 },
                            ext: { width: 60, height: 60 },
                            editAs: 'oneCell'
                        });
                    } catch (err) {}
                }
            });

            const displayQty = entry.partiallyFiltered ? entry.totalQty : txn.totalQty;
            const displayWt = entry.partiallyFiltered ? entry.totalWeight : (txn.totalWeight || 0);

            const tr = sheet.getRow(r++);
            tr.values = ['', '', '', '', 'ESTIMATION GRAND TOTAL', '', '', '',
                         Number(displayQty) || 0, Number(displayWt) || 0, '', ''];
            tr.font = { bold: true, color: { argb: 'FF6B0132' } };
            tr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0F1' } };
            tr.mergeCells(`A${tr.number}:E${tr.number}`);
            tr.getCell(1).alignment = { horizontal: 'right' };
            tr.getCell(9).alignment = { horizontal: 'right' };
            tr.getCell(10).alignment = { horizontal: 'right' };
            tr.getCell(10).numFmt = '0.00';

            r++; // spacer
        });

        const overallQty = filtered.reduce((s, e) =>
            s + (e.partiallyFiltered ? e.totalQty : (e.txn.totalQty || 0)), 0);
        const overallWt = filtered.reduce((s, e) =>
            s + (e.partiallyFiltered ? e.totalWeight : (e.txn.totalWeight || 0)), 0);

        const gt = sheet.getRow(r++);
        gt.values = ['OVERALL GRAND TOTAL', '', '', '', '', '', '', '',
                     overallQty, overallWt, '', ''];
        gt.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        gt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B0132' } };
        gt.mergeCells(`A${gt.number}:H${gt.number}`);
        gt.getCell(1).alignment = { horizontal: 'right' };
        gt.getCell(9).alignment = { horizontal: 'right' };
        gt.getCell(10).alignment = { horizontal: 'right' };
        gt.getCell(10).numFmt = '0.00';
        gt.height = 24;

        sheet.views = [{ state: 'frozen', ySplit: 1 }];

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stock_out_transactions.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    });
}

/* ============================================================
   STOCK OUT — TEMPLATE + IMPORT
   ============================================================ */
function downloadTemplate() {
    const headers = ['Estimation No', 'Date', 'Party ID', 'Art Number', 'Quantity', 'Weight'];
    const parties = Store.getParties();
    const p1 = parties[0] ? parties[0].id : 'P001';
    const rows = [
        ['EST-0001', todayIso(), p1, 'A101', 2, 240],
        ['EST-0001', todayIso(), p1, 'B201', 1, 45],
    ];
    exportToCSV('stock_out_import_template.csv', headers, rows);
}

document.getElementById('excelImportInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const rows = parseCSV(ev.target.result);
        if (!rows.length) { showToast('No data found in file', 'error'); e.target.value = ''; return; }

        const grouped = new Map();
        let skipped = 0;

        rows.forEach(row => {
            const getVal = (keywords) => {
                const key = Object.keys(row).find(k => {
                    const lk = k.toLowerCase().replace(/\s+/g, '');
                    return keywords.some(kw => lk.includes(kw));
                });
                return key ? String(row[key]).trim() : '';
            };
            const invoiceNo = getVal(['estimationno', 'estimation', 'invoiceno', 'invoice']);
            const date = getVal(['date']);
            const partyId = getVal(['partyid', 'party']);
            const art = getVal(['artnumber', 'artno', 'art']);
            const qty = parseInt(getVal(['quantity', 'qty'])) || 0;
            const weight = parseFloat(getVal(['weight'])) || 0;

            if (!invoiceNo || !partyId || !art || qty <= 0) { skipped++; return; }

            if (!grouped.has(invoiceNo)) {
                grouped.set(invoiceNo, { invoiceNo, date: toIso(date) || todayIso(), partyId, items: [] });
            }
            grouped.get(invoiceNo).items.push({ art, qty, weight });
        });

        const stockOutData = Store.getStockOut();
        const catalogue = Store.getCatalogue();
        let addedTxns = 0, addedItems = 0, skippedItems = 0;

        grouped.forEach(txn => {
            const party = Store.getPartyById(txn.partyId);
            if (!party) { skippedItems += txn.items.length; return; }
            const validItems = [];
            txn.items.forEach(item => {
                const cat = catalogue.find(c => c.art.toLowerCase() === item.art.toLowerCase());
                if (!cat) { skippedItems++; return; }
                const available = getAvailableQty(item.art);
                if (item.qty > available) { skippedItems++; return; }
                validItems.push({ art: cat.art, name: cat.name, qty: item.qty, weight: item.weight, group: cat.group });
            });
            if (validItems.length === 0) return;

            stockOutData.push({
                txnId: 'TXN-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                invoiceNo: txn.invoiceNo,
                date: txn.date,
                partyId: party.id,
                partyName: party.name,
                partyAddress: party.address,
                partyCell: party.cell,
                items: validItems,
                totalQty: validItems.reduce((s, i) => s + i.qty, 0),
                totalWeight: validItems.reduce((s, i) => s + i.weight, 0)
            });
            addedTxns++;
            addedItems += validItems.length;
        });

        Store.setStockOut(stockOutData);
        renderTransactions();
        const msg = `Imported ${addedTxns} transaction(s), ${addedItems} item(s). Skipped: ${skippedItems + skipped}.`;
        showToast(msg, addedTxns > 0 ? 'success' : 'error');
    };
    reader.readAsText(file);
    e.target.value = '';
});

/* ============================================================
   HOLD STOCK — Enter flow + available-weight check
   ============================================================ */
document.getElementById('hArt').addEventListener('input', function () {
    const cat = Store.getCatalogueItem(this.value);
    document.getElementById('hName').value = cat ? cat.name : '';
    document.getElementById('hGroup').value = cat ? cat.group : '';
    if (cat) {
        const aq = getAvailableQty(this.value);
        const aw = getAvailableWeight(this.value);
        document.getElementById('hAvailable').value = aw == null
            ? `${aq} pcs`
            : `${aq} pcs / ${aw.toFixed(2)} g`;
    } else {
        document.getElementById('hAvailable').value = '';
    }
});

document.getElementById('hArt').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const art = this.value.trim();
    if (!art) return;
    const cat = Store.getCatalogueItem(art);
    if (!cat) { showToast('Art Number not in catalogue', 'error'); return; }
    document.getElementById('hQty').focus();
    document.getElementById('hQty').select();
});

document.getElementById('hQty').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const qty = parseInt(this.value);
    if (isNaN(qty) || qty <= 0) { showToast('Quantity must be > 0', 'error'); return; }
    document.getElementById('hWeight').focus();
    document.getElementById('hWeight').select();
});

document.getElementById('hWeight').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addHoldItem();
});

function addHoldItem() {
    const pid = document.getElementById('hParty').value;
    if (!pid) { showToast('Select a party first', 'error'); return; }

    const art = document.getElementById('hArt').value.trim();
    const qty = parseInt(document.getElementById('hQty').value);
    const weight = parseFloat(document.getElementById('hWeight').value) || 0;

    if (!art || isNaN(qty) || qty <= 0) {
        showToast('Enter valid Art Number and Quantity', 'error');
        return;
    }
    const cat = Store.getCatalogueItem(art);
    if (!cat) { showToast('Art Number not found in catalogue', 'error'); return; }

    const alreadyHeldQty = holdItems
        .filter(i => i.art.toLowerCase() === art.toLowerCase())
        .reduce((s, i) => s + i.qty, 0);
    const physical = (getBalanceEntry(art) || {}).qty || 0;
    const heldOtherParties = Store.getHeldQtyForArt(art) - Store.getHoldsForParty(pid)
        .filter(x => x.art.toLowerCase() === art.toLowerCase())
        .reduce((s, x) => s + Number(x.qty || 0), 0);
    const freeQty = Math.max(0, physical - heldOtherParties);
    if (qty + alreadyHeldQty > freeQty) {
        showToast(`Only ${freeQty} units can be held (${alreadyHeldQty} already held here)`, 'error');
        return;
    }

    const availableWeight = getAvailableWeight(art);
    if (availableWeight != null) {
        const alreadyHeldWeight = holdItems
            .filter(i => i.art.toLowerCase() === art.toLowerCase())
            .reduce((s, i) => s + i.weight, 0);
        if (weight + alreadyHeldWeight > availableWeight) {
            showToast(
                `Weight exceeds available! Available: ${availableWeight.toFixed(2)} g ` +
                `(${alreadyHeldWeight.toFixed(2)} g already held here)`,
                'error'
            );
            return;
        }
    }

    const existing = holdItems.find(i => i.art.toLowerCase() === art.toLowerCase());
    if (existing) {
        existing.qty += qty;
        existing.weight += weight;
    } else {
        holdItems.push({ art: cat.art, name: cat.name, qty, weight, group: cat.group });
    }

    resetHoldProductEntry();
    renderHoldCart();
    showToast('Item added to hold (not saved yet)', 'success');
}

function resetHoldProductEntry() {
    document.getElementById('hArt').value = '';
    document.getElementById('hName').value = '';
    document.getElementById('hQty').value = 1;
    document.getElementById('hWeight').value = 0;
    document.getElementById('hGroup').value = '';
    document.getElementById('hAvailable').value = '';
    document.getElementById('hArt').focus();
}

function removeHoldItem(index) { holdItems.splice(index, 1); renderHoldCart(); }

function renderHoldCart() {
    const tbody = document.getElementById('holdBody');
    const tfoot = document.getElementById('holdFooter');
    const totalsEl = document.getElementById('holdTotals');
    tbody.innerHTML = '';

    if (holdItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-message">No items held for this party yet.</td></tr>';
        tfoot.style.display = 'none';
        if (totalsEl) totalsEl.textContent = 'Qty: 0 · Weight: 0.00g';
        return;
    }

    let totalQty = 0, totalWeight = 0;
    holdItems.forEach((item, idx) => {
        totalQty += item.qty;
        totalWeight += item.weight;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.art}</strong></td>
            <td>${item.name}</td>
            <td>${item.qty}</td>
            <td>${item.weight.toFixed(2)}</td>
            <td>${item.group || '-'}</td>
            <td><button class="danger btn-sm" onclick="removeHoldItem(${idx})"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('holdTotalQty').innerText = totalQty;
    document.getElementById('holdTotalWeight').innerText = totalWeight.toFixed(2);
    if (totalsEl) totalsEl.textContent = 'Qty: ' + totalQty + ' · Weight: ' + totalWeight.toFixed(2) + 'g';
    tfoot.style.display = '';
}

function loadHoldForSelectedParty() {
    const pid = document.getElementById('hParty').value;
    if (!pid) { holdItems = []; renderHoldCart(); return; }
    holdItems = (Store.getHoldsForParty(pid) || []).map(h => ({ ...h }));
    renderHoldCart();
}

function saveHoldForParty() {
    const pid = document.getElementById('hParty').value;
    if (!pid) { showToast('Select a party first', 'error'); return; }

    const balance = Store.computeBalance();
    const allHolds = Store.getHolds();

    for (const h of holdItems) {
        const avail = balance.find(b => b.art.toLowerCase() === h.art.toLowerCase())?.qty || 0;
        const otherHeld = Object.entries(allHolds)
            .filter(([k]) => k !== pid)
            .reduce((s, [, list]) => s + (list || [])
                .filter(x => x.art.toLowerCase() === h.art.toLowerCase())
                .reduce((a, x) => a + Number(x.qty || 0), 0), 0);
        if (h.qty > Math.max(0, avail - otherHeld)) {
            showToast(`Cannot hold ${h.qty} of ${h.art} — only ${Math.max(0, avail - otherHeld)} available`, 'error');
            return;
        }
    }

    Store.setHoldsForParty(pid, holdItems.map(h => ({ ...h })));
    holdItems = [];
    renderHoldCart();
    renderHeldStockList();
    showToast('Stock held successfully for this party', 'success');
}

function resetHoldForm() {
    holdItems = [];
    document.getElementById('hParty').value = '';
    document.getElementById('hPartySearch').value = '';
    document.getElementById('hPartyName').value = '';
    document.getElementById('hPartyCell').value = '';
    document.getElementById('hPartyAddress').value = '';
    resetHoldProductEntry();
    renderHoldCart();
}

/* ============================================================
   HELD STOCK — Details toggle + filters + subtotals
   ============================================================ */
function toggleHeldDetails() {
    const panel = document.getElementById('heldStockDetails');
    const btn = document.getElementById('heldDetailsToggleBtn');
    const isHidden = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = isHidden ? 'block' : 'none';
    btn.innerHTML = isHidden
        ? '<i class="fas fa-eye-slash"></i> Hide Details'
        : '<i class="fas fa-eye"></i> Details';
    if (isHidden) renderHeldStockList();
}

function clearHeldFilters() {
    document.getElementById('heldFilterParty').value = '';
    document.getElementById('heldFilterGroup').value = '';
    document.getElementById('heldFilterCategory').value = '';
    document.getElementById('heldFilterDate').value = '';
    renderHeldStockList();
}

function renderHeldStockList() {
    const box = document.getElementById('heldStockList');
    if (!box) return;

    const all = Store.getHolds();
    const catalogue = Store.getCatalogue();
    const catMap = {};
    catalogue.forEach(c => {
        catMap[c.art.toLowerCase()] = { category: c.category || '', image: c.image || '' };
    });

    const partyFilter = (document.getElementById('heldFilterParty')?.value || '').trim().toLowerCase();
    const grpFilter = document.getElementById('heldFilterGroup')?.value || '';
    const catFilter = document.getElementById('heldFilterCategory')?.value || '';
    const dateFilter = document.getElementById('heldFilterDate')?.value || '';

    const rows = [];
    Object.entries(all).forEach(([pid, list]) => {
        if (!Array.isArray(list) || !list.length) return;
        const party = Store.getPartyById(pid) || { name: pid };
        list.forEach(h => {
            const meta = catMap[String(h.art).toLowerCase()] || { category: '', image: '' };
            rows.push({
                pid,
                partyName: party.name,
                art: h.art,
                name: h.name || '',
                group: h.group || '',
                category: meta.category,
                image: meta.image,
                qty: Number(h.qty || 0),
                weight: Number(h.weight || 0),
                date: h.date ? toIso(h.date) : ''
            });
        });
    });

    const filtered = rows.filter(r => {
        const matchParty = !partyFilter ||
            r.partyName.toLowerCase().includes(partyFilter) ||
            r.pid.toLowerCase().includes(partyFilter);
        const matchGrp = !grpFilter || r.group === grpFilter;
        const matchCat = !catFilter || r.category === catFilter;
        const matchDate = !dateFilter || r.date === dateFilter;
        return matchParty && matchGrp && matchCat && matchDate;
    });

    const totalQty = filtered.reduce((s, r) => s + r.qty, 0);
    const totalWt = filtered.reduce((s, r) => s + r.weight, 0);
    const partyCount = new Set(filtered.map(r => r.pid)).size;

    const $ = id => document.getElementById(id);
    if ($('grandHeldQty')) $('grandHeldQty').textContent = totalQty;
    if ($('grandHeldWeight')) $('grandHeldWeight').textContent = totalWt.toFixed(2);
    if ($('grandHeldParties')) $('grandHeldParties').textContent = partyCount;

    const byParty = {};
    filtered.forEach(r => {
        byParty[r.pid] = byParty[r.pid] || { name: r.partyName, qty: 0, weight: 0 };
        byParty[r.pid].qty += r.qty;
        byParty[r.pid].weight += r.weight;
    });
    if ($('heldPartySubtotals')) {
        $('heldPartySubtotals').innerHTML = Object.keys(byParty).length
            ? Object.entries(byParty).map(([pid, v]) => `
                <div class="stat">
                    <span>${v.name} (${pid})</span>
                    <strong>${v.qty} pcs · ${v.weight.toFixed(2)} g</strong>
                </div>
            `).join('')
            : '<div class="stat"><span>No data</span><strong>0</strong></div>';
    }

    if (!filtered.length) {
        box.innerHTML = '<div class="empty-message">No held stock matches the filters.</div>';
        return;
    }

    const byPartyList = {};
    filtered.forEach(r => {
        byPartyList[r.pid] = byPartyList[r.pid] || { name: r.partyName, items: [] };
        byPartyList[r.pid].items.push(r);
    });

    box.innerHTML = Object.entries(byPartyList).map(([pid, grp]) => {
        let pQty = 0, pWt = 0;
        const rowsHtml = grp.items.map(h => {
            pQty += h.qty;
            pWt += h.weight;
            return `<tr>
                <td><strong>${escapeHtml(h.art)}</strong></td>
                <td>${escapeHtml(h.name)}</td>
                <td>${escapeHtml(h.group || '-')}</td>
                <td>${escapeHtml(h.category || '-')}</td>
                <td>${h.qty}</td>
                <td>${h.weight.toFixed(2)}</td>
            </tr>`;
        }).join('');

        return `<div style="border:1px solid #fde68a; border-radius:12px; margin-bottom:15px; overflow:hidden;">
            <div style="background:#fef3c7; padding:12px 15px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <strong style="color:#92400e;"><i class="fas fa-user"></i> ${escapeHtml(grp.name)}</strong>
                    <span style="margin-left:12px; color:#92400e; font-size:0.85rem;">ID: ${escapeHtml(pid)}</span>
                </div>
                <div>
                    <span class="badge orange">Qty: ${pQty}</span>
                    <span class="badge orange">Wt: ${pWt.toFixed(2)}g</span>
                    <button class="danger btn-sm" onclick="deletePartyHold('${escapeAttr(pid)}')" style="margin-left:8px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="table-wrap" style="border:none; border-radius:0;">
                <table>
                    <thead><tr><th>Art No</th><th>Product Name</th><th>Group</th><th>Category</th><th>Qty Held</th><th>Weight (g)</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                    <tfoot><tr style="background:#fef3c7; font-weight:700;">
                        <td colspan="4" style="text-align:right;">PARTY SUB TOTAL:</td>
                        <td>${pQty}</td>
                        <td>${pWt.toFixed(2)}</td>
                    </tr></tfoot>
                </table>
            </div>
        </div>`;
    }).join('');
}

function deletePartyHold(pid) {
    if (!confirm('Remove all held stock for this party?')) return;
    Store.deleteHoldsForParty(pid);
    if (document.getElementById('hParty').value === pid) {
        holdItems = [];
        renderHoldCart();
    }
    renderHeldStockList();
    showToast('Held stock removed for party', 'success');
}

function exportHeldStock() {
    const all = Store.getHolds();
    const headers = ['Party ID', 'Party Name', 'Art No', 'Product Name', 'Group', 'Qty Held', 'Weight (g)'];
    const rows = [];
    Object.entries(all).forEach(([pid, list]) => {
        if (!Array.isArray(list) || !list.length) return;
        const party = Store.getPartyById(pid) || { name: pid };
        list.forEach(h => {
            rows.push([pid, party.name, h.art, h.name || '', h.group || '', h.qty, Number(h.weight || 0).toFixed(2)]);
        });
    });
    if (!rows.length) { showToast('No held stock to export', 'error'); return; }
    exportToCSV('held_stock.csv', headers, rows);
}

/* ============================================================
   HOLD STOCK — TEMPLATE + IMPORT
   ============================================================ */
function downloadHoldTemplate() {
    const headers = ['Party ID', 'Art Number', 'Quantity', 'Weight'];
    const parties = Store.getParties();
    const p1 = parties[0] ? parties[0].id : 'P001';
    const p2 = parties[1] ? parties[1].id : 'P002';
    const rows = [
        [p1, 'A101', 2, 240],
        [p1, 'B201', 1, 45],
        [p2, 'A102', 3, 255],
    ];
    exportToCSV('hold_stock_import_template.csv', headers, rows);
}

document.getElementById('holdExcelImportInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
        const rows = parseCSV(ev.target.result);
        if (!rows.length) {
            showToast('No data found in file', 'error');
            e.target.value = '';
            return;
        }

        const catalogue = Store.getCatalogue();
        const fallbackPartyId = document.getElementById('hParty').value || '';
        const grouped = new Map();
        let skipped = 0;

        rows.forEach(row => {
            const getVal = (keywords) => {
                const key = Object.keys(row).find(k => {
                    const lk = k.toLowerCase().replace(/[\s_]+/g, '');
                    return keywords.some(kw => lk.includes(kw));
                });
                return key ? String(row[key]).trim() : '';
            };

            const partyId = getVal(['partyid', 'partycode', 'party']) || fallbackPartyId;
            const art = getVal(['artnumber', 'artno', 'art']);
            const qty = parseInt(getVal(['quantity', 'qty'])) || 0;
            const weight = parseFloat(getVal(['weight', 'weightg'])) || 0;

            if (!partyId || !art || qty <= 0) { skipped++; return; }
            if (!grouped.has(partyId)) grouped.set(partyId, []);
            grouped.get(partyId).push({ art, qty, weight });
        });

        if (!grouped.size) {
            showToast('No valid rows to import', 'error');
            e.target.value = '';
            return;
        }

        const partySummary = Array.from(grouped.entries()).map(([pid, list]) => {
            const p = Store.getPartyById(pid);
            return `  • ${p ? p.name : pid} (${pid}): ${list.length} item(s)`;
        }).join('\n');
        if (!confirm('Import held stock?\n\n' + partySummary + '\n\nThis REPLACES existing holds for these parties. Continue?')) {
            e.target.value = '';
            return;
        }

        let importedParties = 0, importedItems = 0, skippedItems = 0;

        grouped.forEach((list, pid) => {
            const party = Store.getPartyById(pid);
            if (!party) { skippedItems += list.length; return; }

            const validated = [];
            for (const it of list) {
                const cat = catalogue.find(c => c.art.toLowerCase() === it.art.toLowerCase());
                if (!cat) { skippedItems++; continue; }
                const existing = validated.find(v => v.art.toLowerCase() === cat.art.toLowerCase());
                if (existing) {
                    existing.qty += it.qty;
                    existing.weight += it.weight;
                } else {
                    validated.push({
                        art: cat.art, name: cat.name,
                        qty: it.qty, weight: it.weight, group: cat.group || ''
                    });
                }
            }
            if (!validated.length) return;
            Store.setHoldsForParty(pid, validated);
            importedParties++;
            importedItems += validated.length;
            if (document.getElementById('hParty').value === pid) loadHoldForSelectedParty();
        });

        renderHeldStockList();
        let msg = `Imported ${importedParties} party/parties, ${importedItems} item(s).`;
        if (skippedItems) msg += ` Skipped: ${skippedItems}.`;
        showToast(msg, importedParties > 0 ? 'success' : 'error');
        e.target.value = '';
    };
    reader.readAsText(file);
});

/* ============================================================
   INIT
   ============================================================ */
refreshArtList();

createPartyPicker({
    inputId: 'fPartySearch',
    hiddenId: 'fParty',
    listId: 'partyList',
    wrapId: 'partySearchWrap',
    clearBtnId: 'fPartyClearBtn',
    nameId: 'fPartyName',
    cellId: 'fPartyCell',
    addressId: 'fPartyAddress'
});

createPartyPicker({
    inputId: 'hPartySearch',
    hiddenId: 'hParty',
    listId: 'hPartyList',
    wrapId: 'hPartySearchWrap',
    clearBtnId: 'hPartyClearBtn',
    nameId: 'hPartyName',
    cellId: 'hPartyCell',
    addressId: 'hPartyAddress',
    onSelect: () => loadHoldForSelectedParty(),
    onClear: () => { holdItems = []; renderHoldCart(); }
});

document.getElementById('txnFilterEst').addEventListener('input', renderTransactions);
document.getElementById('txnFilterDate').addEventListener('change', renderTransactions);
document.getElementById('txnFilterParty').addEventListener('input', renderTransactions);
document.getElementById('txnFilterName').addEventListener('input', renderTransactions);
document.getElementById('txnFilterCategory').addEventListener('change', renderTransactions);
document.getElementById('txnFilterGroup').addEventListener('change', renderTransactions);

document.getElementById('heldFilterParty').addEventListener('input', renderHeldStockList);
document.getElementById('heldFilterGroup').addEventListener('change', renderHeldStockList);
document.getElementById('heldFilterCategory').addEventListener('change', renderHeldStockList);
document.getElementById('heldFilterDate').addEventListener('change', renderHeldStockList);

renderCart();
renderHoldCart();
renderHeldStockList();