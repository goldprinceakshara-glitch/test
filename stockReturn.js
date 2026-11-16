buildNavbar();

/* ============================================================
   STATE
   ============================================================ */
let cartItems = [];

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
   RETURN REFERENCE GENERATOR
   ============================================================ */
function getNextReturnNo() {
    const counter = parseInt(localStorage.getItem('returnCounter') || '1000');
    const next = counter + 1;
    return `RET-${next}`;
}

function commitReturnNo() {
    const counter = parseInt(localStorage.getItem('returnCounter') || '1000');
    localStorage.setItem('returnCounter', String(counter + 1));
}

/* ============================================================
   MODE SWITCH
   ============================================================ */
function switchMode(mode) {
    document.getElementById('tabStockReturn').classList.toggle('active', mode === 'stockreturn');
    document.getElementById('panelStockReturn').classList.toggle('active', mode === 'stockreturn');
}

/* ============================================================
   INIT
   ============================================================ */
document.getElementById('fDate').value = todayIso();
document.getElementById('fInvoiceNo').value = getNextReturnNo();
document.getElementById('txnFilterDate').value = todayIso();

function refreshArtList() {
    const dl1 = document.getElementById('artList');
    const opts = Store.getCatalogue().map(c => `<option value="${c.art}">${c.name}</option>`).join('');
    if (dl1) dl1.innerHTML = opts;
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
   STOCK RETURN — Enter flow
   ============================================================ */
document.getElementById('pArt').addEventListener('input', function () {
    const cat = Store.getCatalogueItem(this.value);
    document.getElementById('pName').value = cat ? cat.name : '';
    document.getElementById('pGroup').value = cat ? cat.group : '';
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

    const existing = cartItems.find(i => i.art.toLowerCase() === art.toLowerCase());
    if (existing) {
        existing.qty += qty;
        existing.weight += weight;
    } else {
        cartItems.push({ art: cat.art, name: cat.name, qty, weight, group: cat.group });
    }

    resetProductEntry();
    renderCart();
    showToast('Item added to return', 'success');
}

function resetProductEntry() {
    document.getElementById('pArt').value = '';
    document.getElementById('pName').value = '';
    document.getElementById('pQty').value = 1;
    document.getElementById('pWeight').value = 0;
    document.getElementById('pGroup').value = '';
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
   SAVE TRANSACTION
   ============================================================ */
function saveTransaction() {
    const partyId = document.getElementById('fParty').value;
    if (!partyId) { showToast('Please select a Party first', 'error'); return; }
    if (cartItems.length === 0) { showToast('Add at least one product to the return', 'error'); return; }
    
    const party = Store.getPartyById(partyId);
    if (!party) { showToast('Party not found', 'error'); return; }

    const invoiceNo = document.getElementById('fInvoiceNo').value.trim();
    if (!invoiceNo) { showToast('Return reference is required', 'error'); return; }

    const dateIso = document.getElementById('fDate').value || todayIso();
    const txnId = 'RET-TXN-' + Date.now();

    const data = Store.getStockReturn();
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
    Store.setStockReturn(data);
    commitReturnNo(); // Increment the counter

    resetStockReturnForm();
    if (document.getElementById('returnDetailsModal').classList.contains('active')) {
        renderTransactions();
    }
    showToast('Stock Return saved successfully', 'success');
}

function resetStockReturnForm() {
    cartItems = [];
    document.getElementById('fParty').value = '';
    document.getElementById('fPartySearch').value = '';
    document.getElementById('fPartyName').value = '';
    document.getElementById('fPartyCell').value = '';
    document.getElementById('fPartyAddress').value = '';
    document.getElementById('fInvoiceNo').value = getNextReturnNo();
    document.getElementById('fDate').value = todayIso();
    resetProductEntry();
    renderCart();
}

/* ============================================================
   STOCK RETURN TRANSACTIONS — Details toggle + filters
   ============================================================ */
function toggleReturnDetails() {
    document.getElementById('returnDetailsModal').classList.add('active');
    renderTransactions();
}

function closeReturnDetails() {
    document.getElementById('returnDetailsModal').classList.remove('active');
}

function clearTxnFilters() {
    document.getElementById('txnFilterEst').value = '';
    document.getElementById('txnFilterDate').value = todayIso();
    document.getElementById('txnFilterParty').value = '';
    document.getElementById('txnFilterName').value = '';
    document.getElementById('txnFilterCategory').value = '';
    renderTransactions();
}

/* ============================================================
   FILTERED TRANSACTIONS
   ============================================================ */
function getFilteredTransactions() {
    const data = Store.getStockReturn();
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

    const itemMatches = (i) => {
        const meta = catMap[i.art.toLowerCase()] || { category: '', image: '' };
        const matchName = !nameFilter ||
            (i.name || '').toLowerCase().includes(nameFilter) ||
            (i.art || '').toLowerCase().includes(nameFilter);
        const matchCat = !catFilter || meta.category === catFilter;
        return matchName && matchCat;
    };

    const itemFilterActive = !!(nameFilter || catFilter);

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
        container.innerHTML = '<div class="empty-message">No stock return records found</div>';
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
                    <strong style="color:#1e40af;"><i class="fas fa-undo-alt"></i> ${txn.invoiceNo || 'No Ref'}</strong>
                    <span style="margin-left:12px; color:#64748b; font-size:0.85rem;">
                        <i class="fas fa-user"></i> ${txn.partyName}
                    </span>
                    <span style="margin-left:12px; color:#64748b; font-size:0.85rem;">
                        <i class="fas fa-calendar"></i> ${isoToDisplay(txn.date)}
                    </span>
                    ${entry.partiallyFiltered ? `<span class="badge" style="margin-left:8px;">Filtered: ${items.length}/${(txn.items||[]).length} items</span>` : ''}
                </div>
                <div>
                    <span class="badge green">Qty: ${displayQty}</span>
                    <span class="badge orange">Wt: ${(displayWt || 0).toFixed(2)}g</span>
                    <button class="danger btn-sm" onclick="deleteTransaction(${origIdx})" style="margin-left:8px;">
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
                            <td colspan="3" style="text-align:right;">Return Grand Total:</td>
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
    if (!confirm('Delete this entire Stock Return transaction?')) return;
    const data = Store.getStockReturn();
    data.splice(index, 1);
    Store.setStockReturn(data);
    renderTransactions();
    showToast('Return record deleted', 'success');
}

/* ============================================================
   IMPORT / EXPORT
   ============================================================ */
function downloadTemplate() {
    const headers = ['Return Ref', 'Date', 'Party ID', 'Art Number', 'Quantity', 'Weight'];
    const parties = Store.getParties();
    const p1 = parties[0] ? parties[0].id : 'P001';
    const rows = [
        ['RET-1001', todayIso(), p1, 'A101', 2, 240],
        ['RET-1001', todayIso(), p1, 'B201', 1, 45],
    ];
    exportToCSV('stock_return_import_template.csv', headers, rows);
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
            const invoiceNo = getVal(['returnref', 'refno', 'estimation', 'invoice']);
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

        const returnData = Store.getStockReturn();
        const catalogue = Store.getCatalogue();
        let addedTxns = 0, addedItems = 0, skippedItems = 0;

        grouped.forEach(txn => {
            const party = Store.getPartyById(txn.partyId);
            if (!party) { skippedItems += txn.items.length; return; }
            const validItems = [];
            txn.items.forEach(item => {
                const cat = catalogue.find(c => c.art.toLowerCase() === item.art.toLowerCase());
                if (!cat) { skippedItems++; return; }
                validItems.push({ art: cat.art, name: cat.name, qty: item.qty, weight: item.weight, group: cat.group });
            });
            if (validItems.length === 0) return;

            returnData.push({
                txnId: 'RET-TXN-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
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

        Store.setStockReturn(returnData);
        renderTransactions();
        const msg = `Imported ${addedTxns} transaction(s), ${addedItems} item(s). Skipped: ${skippedItems + skipped}.`;
        showToast(msg, addedTxns > 0 ? 'success' : 'error');
    };
    reader.readAsText(file);
    e.target.value = '';
});

async function downloadTxnsExcel() {
    const filtered = getFilteredTransactions();
    if (filtered.length === 0) { showToast('No transactions to export', 'error'); return; }

    showToast('Preparing Excel...', 'success');

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Stock Return');

    sheet.columns = [
        { header: 'Return Ref', width: 16 },
        { header: 'Date', width: 14 },
        { header: 'Party', width: 24 },
        { header: 'Cell', width: 16 },
        { header: 'Address', width: 28 },
        { header: 'Art No', width: 14 },
        { header: 'Product', width: 28 },
        { header: 'Qty', width: 10 },
        { header: 'Weight (g)', width: 12 },
        { header: 'Group', width: 14 }
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8C004C' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 22;

    let r = 2;
    filtered.forEach(entry => {
        const { txn, items } = entry;
        const head = sheet.getRow(r++);
        head.values = [`Ref: ${txn.invoiceNo || '-'} | Party: ${txn.partyName} | Date: ${isoToDisplay(txn.date)}`];
        head.font = { bold: true, color: { argb: 'FF8C004C' } };
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCEEDF5' } };
        head.mergeCells(`A${head.number}:J${head.number}`);

        items.forEach(item => {
            const row = sheet.getRow(r++);
            row.values = [
                txn.invoiceNo || '', isoToDisplay(txn.date), txn.partyName, txn.partyCell || '',
                txn.partyAddress || '', item.art, item.name,
                Number(item.qty) || 0, Number(item.weight) || 0, item.group || '-'
            ];
            row.alignment = { vertical: 'middle' };
            row.getCell(8).alignment = { horizontal: 'right' };
            row.getCell(9).alignment = { horizontal: 'right' };
            row.getCell(9).numFmt = '0.00';
        });

        const displayQty = entry.partiallyFiltered ? entry.totalQty : txn.totalQty;
        const displayWt = entry.partiallyFiltered ? entry.totalWeight : (txn.totalWeight || 0);

        const tr = sheet.getRow(r++);
        tr.values = ['', '', '', '', 'RETURN GRAND TOTAL', '', '',
                     Number(displayQty) || 0, Number(displayWt) || 0, ''];
        tr.font = { bold: true, color: { argb: 'FF6B0132' } };
        tr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F0F1' } };
        tr.mergeCells(`A${tr.number}:E${tr.number}`);
        tr.getCell(1).alignment = { horizontal: 'right' };
        tr.getCell(8).alignment = { horizontal: 'right' };
        tr.getCell(9).alignment = { horizontal: 'right' };
        tr.getCell(9).numFmt = '0.00';

        r++; // spacer
    });

    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock_return_transactions.xlsx';
    a.click();
    URL.revokeObjectURL(url);
}

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

document.getElementById('txnFilterEst').addEventListener('input', renderTransactions);
document.getElementById('txnFilterDate').addEventListener('change', renderTransactions);
document.getElementById('txnFilterParty').addEventListener('input', renderTransactions);
document.getElementById('txnFilterName').addEventListener('input', renderTransactions);
document.getElementById('txnFilterCategory').addEventListener('change', renderTransactions);

renderCart();