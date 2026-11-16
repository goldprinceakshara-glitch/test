buildNavbar();

/* ============================================================
   STATE
   ============================================================ */
let pendingItems = [];

/* ============================================================
   DATE HELPERS — LOCAL DATE (not UTC)
   ============================================================ */
function todayIso() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function todayDisplay() {
    return isoToDisplay(todayIso());
}

function isoToDisplay(iso) {
    if (!iso) return '-';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(iso)) return iso;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }
    return iso;
}

function toIso(str) {
    if (!str) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
    }
    return str;
}

/* ============================================================
   COLLAPSIBLE DETAILS TOGGLE
   ============================================================ */
function toggleStockInDetails() {
    const panel = document.getElementById('stockInDetails');
    const btn = document.getElementById('detailsToggleBtn');
    const isHidden = panel.style.display === 'none' || panel.style.display === '';

    if (isHidden) {
        const dateInput = document.getElementById('filterDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = todayIso();
        }
    }

    panel.style.display = isHidden ? 'block' : 'none';
    btn.innerHTML = isHidden
        ? '<i class="fas fa-eye-slash"></i> Hide Details'
        : '<i class="fas fa-eye"></i> Details';
    if (isHidden) renderStockIn();
}

function clearFilters() {
    document.getElementById('filterRootCard').value = '';
    document.getElementById('filterName').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterGroup').value = '';
    document.getElementById('filterDate').value = todayIso();
    renderStockIn();
}

/* ============================================================
   FILTERED DATA
   ============================================================ */
function getFilteredStockIn() {
    const data = Store.getStockIn();
    const catalogue = Store.getCatalogue();

    const catMap = {};
    catalogue.forEach(c => {
        catMap[c.art.toLowerCase()] = {
            category: c.category || '',
            image: c.image || ''
        };
    });

    const rootFilter = (document.getElementById('filterRootCard')?.value || '').trim().toLowerCase();
    const nameFilter = (document.getElementById('filterName')?.value || '').toLowerCase().trim();
    const catFilter = document.getElementById('filterCategory')?.value || '';
    const grpFilter = document.getElementById('filterGroup')?.value || '';
    const dateFilter = document.getElementById('filterDate')?.value || '';

    return data
        .map((i, idx) => {
            const meta = catMap[i.art.toLowerCase()] || { category: '', image: '' };
            return {
                ...i,
                _index: idx,
                category: meta.category,
                image: meta.image
            };
        })
        .filter(i => {
            const matchRoot = !rootFilter || (i.rootCardNo || '').toLowerCase().includes(rootFilter);
            const matchName = !nameFilter ||
                i.name.toLowerCase().includes(nameFilter) ||
                i.art.toLowerCase().includes(nameFilter);
            const matchCat = !catFilter || i.category === catFilter;
            const matchGrp = !grpFilter || i.group === grpFilter;
            const rowIso = toIso(i.date);
            const matchDate = !dateFilter || rowIso === dateFilter;
            return matchRoot && matchName && matchCat && matchGrp && matchDate;
        });
}

/* ============================================================
   RENDER TABLE + SUBTOTAL ROWS
   ============================================================ */
function renderStockIn() {
    const filtered = getFilteredStockIn();
    const tbody = document.getElementById('stockInBody');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-message">No stock in records</td></tr>';
        setGrandTotals(0, 0, 0);
        return;
    }

    const sorted = filtered.slice().sort((a, b) => {
        const k1 = toIso(a.date) + '|' + (a.rootCardNo || '') + '|' + a.art;
        const k2 = toIso(b.date) + '|' + (b.rootCardNo || '') + '|' + b.art;
        return k1.localeCompare(k2);
    });

    let lastDate = null;
    let lastRoot = null;
    let dateQty = 0, dateWt = 0;
    let rootQty = 0, rootWt = 0;

    const flushRootSub = () => {
        if (lastRoot !== null) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="5" style="text-align:right; font-weight:700; background:#fdf5f8; color:#6b0132;">
                    <i class="fas fa-id-card"></i> Root ${lastRoot} Sub Total
                </td>
                <td style="font-weight:700; text-align:right; background:#fdf5f8; color:#6b0132;">${rootQty}</td>
                <td style="font-weight:700; text-align:right; background:#fdf5f8; color:#6b0132;">${rootWt.toFixed(2)}</td>
                <td colspan="2" style="background:#fdf5f8;"></td>
            `;
            tbody.appendChild(tr);
        }
        rootQty = 0; rootWt = 0;
    };

    const flushDateTotal = () => {
        if (lastDate !== null) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="5" style="text-align:right; font-weight:800; background:#f3e7ee; color:#4d0535;">
                    <i class="fas fa-calendar"></i> ${isoToDisplay(lastDate)} — Date Grand Total
                </td>
                <td style="font-weight:800; text-align:right; background:#f3e7ee; color:#4d0535;">${dateQty}</td>
                <td style="font-weight:800; text-align:right; background:#f3e7ee; color:#4d0535;">${dateWt.toFixed(2)}</td>
                <td colspan="2" style="background:#f3e7ee;"></td>
            `;
            tbody.appendChild(tr);
        }
        dateQty = 0; dateWt = 0;
    };

    sorted.forEach(item => {
        const rowIso = toIso(item.date);

        if (rowIso !== lastDate) {
            flushRootSub();
            flushDateTotal();
            lastDate = rowIso;
            lastRoot = null;
        }

        if (item.rootCardNo !== lastRoot) {
            flushRootSub();
            lastRoot = item.rootCardNo;

            const headRow = document.createElement('tr');
            headRow.innerHTML = `
                <td colspan="9" style="background:#fceef5; color:#8c004c; font-weight:700; padding:8px 10px;">
                    <i class="fas fa-id-card"></i> Root Card: ${item.rootCardNo || '-'} &nbsp;|&nbsp;
                    <i class="fas fa-calendar"></i> ${isoToDisplay(rowIso)}
                </td>
            `;
            tbody.appendChild(headRow);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.rootCardNo || '-'}</td>
            <td>${isoToDisplay(rowIso)}</td>
            <td><strong>${item.art}</strong></td>
            <td>${item.name}</td>
            <td>${item.category ? `<span class="badge">${item.category}</span>` : '-'}</td>
            <td><span class="badge green">+${item.qty}</span></td>
            <td>${Number(item.weight).toFixed(2)}</td>
            <td>${item.group || '-'}</td>
            <td>
                <button class="danger btn-sm" onclick="deleteStockIn(${item._index})"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);

        dateQty += Number(item.qty) || 0;
        dateWt += Number(item.weight) || 0;
        rootQty += Number(item.qty) || 0;
        rootWt += Number(item.weight) || 0;
    });

    flushRootSub();
    flushDateTotal();

    const totalQty = filtered.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const totalWeight = filtered.reduce((s, i) => s + (Number(i.weight) || 0), 0);
    setGrandTotals(filtered.length, totalQty, totalWeight);
}

function setGrandTotals(rows, qty, wt) {
    const $ = id => document.getElementById(id);
    if ($('filteredCount')) $('filteredCount').innerText = rows;
    if ($('grandTotalQty')) $('grandTotalQty').innerText = qty;
    if ($('grandTotalWeight')) $('grandTotalWeight').innerText = wt.toFixed(2);
}

/* ============================================================
   MODAL — ADD STOCK IN
   ============================================================ */
function refreshArtList() {
    const dl = document.getElementById('artList');
    dl.innerHTML = Store.getCatalogue().map(c => `<option value="${c.art}">${c.name}</option>`).join('');
}

function openAddModal() {
    pendingItems = [];
    document.getElementById('fRootCard').value = '';
    document.getElementById('fDate').value = todayIso();
    resetItemEntry();
    refreshArtList();
    renderPendingItems();
    document.getElementById('stockInModal').classList.add('active');
    setTimeout(() => document.getElementById('fRootCard').focus(), 50);
}

function closeModal() {
    document.getElementById('stockInModal').classList.remove('active');
    pendingItems = [];
}

function resetItemEntry() {
    const art = document.getElementById('fArt');
    art.value = '';
    document.getElementById('fName').value = '';
    document.getElementById('fQty').value = 1;
    document.getElementById('fWeight').value = 0;
    const hint = document.getElementById('fArtHint');
    if (hint) { hint.style.display = 'none'; hint.innerHTML = ''; }
    setTimeout(() => art.focus(), 30);
}

function addItemToList() {
    const art = document.getElementById('fArt').value.trim();
    const qty = parseInt(document.getElementById('fQty').value);
    const weight = parseFloat(document.getElementById('fWeight').value) || 0;

    if (!art) { showToast('Please enter Art Number', 'error'); return false; }
    if (isNaN(qty) || qty <= 0) { showToast('Quantity must be greater than 0', 'error'); return false; }

    const cat = Store.getCatalogueItem(art);
    if (!cat) { showToast('Art Number not in catalogue', 'error'); return false; }

    const existing = pendingItems.find(p => p.art.toLowerCase() === cat.art.toLowerCase());
    if (existing) {
        existing.qty += qty;
        existing.weight += weight;
        showToast(`Merged into ${cat.art}: +${qty} qty, +${weight.toFixed(2)} g`, 'success');
    } else {
        pendingItems.push({
            art: cat.art,
            name: cat.name,
            qty: qty,
            weight: weight,
            group: cat.group
        });
        showToast(`Added ${cat.art}`, 'success');
    }

    renderPendingItems();
    resetItemEntry();
    return true;
}

function removePendingItem(idx) {
    pendingItems.splice(idx, 1);
    renderPendingItems();
    showToast('Item removed', 'success');
}

function renderPendingItems() {
    const tbody = document.getElementById('pendingItemsBody');
    if (pendingItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-message">No items yet — add one above</td></tr>';
    } else {
        tbody.innerHTML = pendingItems.map((p, i) => `
            <tr>
                <td><strong>${p.art}</strong></td>
                <td>${p.name}</td>
                <td>${p.qty}</td>
                <td>${p.weight.toFixed(2)}</td>
                <td><button class="danger btn-sm" onclick="removePendingItem(${i})"><i class="fas fa-times"></i></button></td>
            </tr>
        `).join('');
    }

    const qty = pendingItems.reduce((s, p) => s + p.qty, 0);
    const wt = pendingItems.reduce((s, p) => s + p.weight, 0);
    document.getElementById('itemCountBadge').innerText = pendingItems.length + ' items';
    document.getElementById('pendingTotalQty').innerText = qty;
    document.getElementById('pendingTotalWeight').innerText = wt.toFixed(2);
}

document.getElementById('fArt').addEventListener('input', function () {
    const cat = Store.getCatalogueItem(this.value);
    document.getElementById('fName').value = cat ? cat.name : '';
    const hint = document.getElementById('fArtHint');
    if (!hint) return;
    if (!cat) { hint.style.display = 'none'; hint.innerHTML = ''; return; }
    hint.style.display = 'block';
    hint.innerHTML = `<i class="fas fa-info-circle"></i> ${cat.name} — ${cat.category || ''} · ${cat.group || ''}`;
});

/* ============================================================
   ENTER FLOW in Add modal
   ============================================================ */
document.getElementById('stockInModal').addEventListener('keydown', function (e) {
    if (!this.classList.contains('active')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Enter') return;

    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea') return;
    e.preventDefault();

    const id = e.target.id;

    if (id === 'fRootCard') {
        if (!e.target.value.trim()) { showToast('Enter Root Card No', 'error'); return; }
        document.getElementById('fDate').focus();
        return;
    }
    if (id === 'fDate') {
        if (!e.target.value) { showToast('Pick a Date', 'error'); return; }
        document.getElementById('fArt').focus();
        return;
    }
    if (id === 'fArt') {
        const cat = Store.getCatalogueItem(e.target.value.trim());
        if (!cat) { showToast('Art Number not in catalogue', 'error'); return; }
        document.getElementById('fQty').focus();
        document.getElementById('fQty').select();
        return;
    }
    if (id === 'fQty') {
        const qty = parseInt(e.target.value);
        if (isNaN(qty) || qty <= 0) { showToast('Quantity must be > 0', 'error'); return; }
        document.getElementById('fWeight').focus();
        document.getElementById('fWeight').select();
        return;
    }
    if (id === 'fWeight') {
        addItemToList();
        return;
    }
    addItemToList();
});

/* ============================================================
   CONFIRMATION MODAL
   ============================================================ */
function prepareConfirmation() {
    const rootCard = document.getElementById('fRootCard').value.trim();
    const dateIso = document.getElementById('fDate').value;

    if (!rootCard) { showToast('Root Card No required', 'error'); return; }
    if (!dateIso) { showToast('Date required', 'error'); return; }
    if (pendingItems.length === 0) { showToast('Add at least one item', 'error'); return; }

    document.getElementById('confirmRootCard').innerText = rootCard;
    document.getElementById('confirmDate').innerText = isoToDisplay(dateIso);

    const tbody = document.getElementById('confirmItemsBody');
    tbody.innerHTML = pendingItems.map(p => `
        <tr>
            <td><strong>${p.art}</strong></td>
            <td>${p.name}</td>
            <td>${p.qty}</td>
            <td>${p.weight.toFixed(2)}</td>
        </tr>
    `).join('');

    const tq = pendingItems.reduce((s, p) => s + p.qty, 0);
    const tw = pendingItems.reduce((s, p) => s + p.weight, 0);
    document.getElementById('confirmTotalQty').innerText = tq;
    document.getElementById('confirmTotalWeight').innerText = tw.toFixed(2);

    document.getElementById('confirmModal').classList.add('active');
}

function closeConfirm() {
    document.getElementById('confirmModal').classList.remove('active');
}

function commitStockIn() {
    const rootCard = document.getElementById('fRootCard').value.trim();
    const dateIso = document.getElementById('fDate').value;

    const data = Store.getStockIn();

    const dup = data.some(d =>
        d.rootCardNo === rootCard && toIso(d.date) === dateIso
    );
    if (dup && !confirm(`Root Card ${rootCard} on ${isoToDisplay(dateIso)} already exists. Continue?`)) return;

    pendingItems.forEach(p => {
        data.push({
            rootCardNo: rootCard,
            date: dateIso,
            art: p.art,
            name: p.name,
            qty: p.qty,
            weight: p.weight,
            group: p.group
        });
    });

    Store.setStockIn(data);
    closeConfirm();
    closeModal();
    renderStockIn();
    showToast(`Stock In saved: ${pendingItems.length} items under ${rootCard}`, 'success');
    pendingItems = [];
}

/* ============================================================
   DELETE
   ============================================================ */
function deleteStockIn(index) {
    if (!confirm('Delete this stock in record?')) return;
    const data = Store.getStockIn();
    data.splice(index, 1);
    Store.setStockIn(data);
    renderStockIn();
    showToast('Record deleted', 'success');
}

/* ============================================================
   TEMPLATE / CSV / IMPORT
   ============================================================ */
function downloadTemplate() {
    const headers = ['Root Card No', 'Date', 'Art Number', 'Quantity', 'Weight'];
    const today = todayDisplay();
    const rows = [
        ['RC001', today, 'A101', 5, 600],
        ['RC001', today, 'A102', 3, 255]
    ];
    exportToCSV('stock_in_template.csv', headers, rows);
}

function exportData() {
    const data = getFilteredStockIn();
    const headers = ['Root Card No', 'Date', 'Art Number', 'Product Name', 'Quantity', 'Weight', 'Product Group', 'Category', 'Image URL'];
    const rows = data.map(d => [
        d.rootCardNo || '', isoToDisplay(d.date), d.art, d.name,
        d.qty, d.weight, d.group, d.category, d.image || ''
    ]);
    exportToCSV('stock_in.csv', headers, rows);
}

document.getElementById('excelInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const rows = parseCSV(ev.target.result);
        if (!rows.length) { showToast('No data in file', 'error'); return; }
        const data = Store.getStockIn();
        const catalogue = Store.getCatalogue();
        let added = 0, skipped = 0;

        rows.forEach(row => {
            const rcKey = Object.keys(row).find(k => k.toLowerCase().includes('root'));
            const dateKey = Object.keys(row).find(k => k.toLowerCase() === 'date' || k.toLowerCase().includes('date'));
            const artKey = Object.keys(row).find(k => k.toLowerCase().includes('art'));
            const qtyKey = Object.keys(row).find(k => k.toLowerCase().includes('quantity') || k.toLowerCase() === 'qty');
            const weightKey = Object.keys(row).find(k => k.toLowerCase().includes('weight'));

            const rootCardNo = rcKey ? String(row[rcKey]).trim() : 'RC-IMPORT';
            const rawDate = dateKey ? String(row[dateKey]).trim() : todayIso();
            const dateIso = toIso(rawDate);
            const art = artKey ? String(row[artKey]).trim() : '';
            const qty = qtyKey ? parseInt(row[qtyKey]) : 0;
            const weight = weightKey ? parseFloat(row[weightKey]) : 0;

            if (!art || isNaN(qty) || qty <= 0) { skipped++; return; }
            const cat = catalogue.find(c => c.art.toLowerCase() === art.toLowerCase());
            if (!cat) { skipped++; return; }

            data.push({
                rootCardNo: rootCardNo,
                date: dateIso,
                art: cat.art,
                name: cat.name,
                qty: qty,
                weight: weight || 0,
                group: cat.group
            });
            added++;
        });
        Store.setStockIn(data);
        renderStockIn();
        showToast(`Imported ${added} records (${skipped} skipped)`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
});

/* ============================================================
   IMAGE CACHE + PRELOADER
   ============================================================ */
const imgCache = {};

function preloadImages(items, callback) {
    const urls = [...new Set(items.map(i => i.image).filter(Boolean))];
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
   PDF EXPORT
   ============================================================ */
function downloadFilteredPDF() {
    const data = getFilteredStockIn();
    if (data.length === 0) { showToast('No records to export', 'error'); return; }

    showToast('Preparing PDF...', 'success');

    preloadImages(data, () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(16);
        doc.setTextColor(140, 0, 76);
        doc.text('Stock In Report', 14, 15);

        const rc = document.getElementById('filterRootCard').value || 'All';
        const cat = document.getElementById('filterCategory').value || 'All';
        const grp = document.getElementById('filterGroup').value || 'All';
        const nm = document.getElementById('filterName').value || '-';
        const dtIso = document.getElementById('filterDate').value || '';
        const dt = dtIso ? isoToDisplay(dtIso) : 'All';

        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(`Filters — Root: ${rc} | Name: ${nm} | Category: ${cat} | Group: ${grp} | Date: ${dt}`, 14, 21);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);

        const sorted = data.slice().sort((a, b) => {
            const k1 = toIso(a.date) + '|' + (a.rootCardNo || '') + '|' + a.art;
            const k2 = toIso(b.date) + '|' + (b.rootCardNo || '') + '|' + b.art;
            return k1.localeCompare(k2);
        });

        const body = [];
        const meta = [];
        let lastDate = null, lastRoot = null;
        let dateQty = 0, dateWt = 0;
        let rootQty = 0, rootWt = 0;

        const flushRoot = () => {
            if (lastRoot !== null) {
                body.push([
                    { content: `Root ${lastRoot} Sub Total`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [253, 245, 248] } },
                    { content: String(rootQty), styles: { fontStyle: 'bold', halign: 'right', fillColor: [253, 245, 248] } },
                    { content: rootWt.toFixed(2), styles: { fontStyle: 'bold', halign: 'right', fillColor: [253, 245, 248] } },
                    { content: '', styles: { fillColor: [253, 245, 248] } }
                ]);
                meta.push({ type: 'sub' });
            }
            rootQty = 0; rootWt = 0;
        };

        const flushDate = () => {
            if (lastDate !== null) {
                body.push([
                    { content: `${isoToDisplay(lastDate)} — Date Grand Total`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 231, 238] } },
                    { content: String(dateQty), styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 231, 238] } },
                    { content: dateWt.toFixed(2), styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 231, 238] } },
                    { content: '', styles: { fillColor: [243, 231, 238] } }
                ]);
                meta.push({ type: 'dateSub' });
            }
            dateQty = 0; dateWt = 0;
        };

        sorted.forEach(item => {
            const rowIso = toIso(item.date);

            if (rowIso !== lastDate) {
                flushRoot();
                flushDate();
                lastDate = rowIso;
                lastRoot = null;
            }
            if (item.rootCardNo !== lastRoot) {
                flushRoot();
                lastRoot = item.rootCardNo;
                body.push([
                    { content: `Root Card: ${item.rootCardNo || '-'}   (Date: ${isoToDisplay(rowIso)})`, colSpan: 8, styles: { fontStyle: 'bold', fillColor: [252, 238, 245], textColor: [140, 0, 76] } },
                    { content: '' }
                ]);
                meta.push({ type: 'rootHead' });
            }

            body.push([
                item.art,
                item.name,
                isoToDisplay(rowIso),
                item.rootCardNo || '-',
                item.category || '-',
                String(item.qty),
                Number(item.weight).toFixed(2),
                item.group || '-',
                ''
            ]);
            meta.push({ type: 'data', item });

            dateQty += Number(item.qty) || 0;
            dateWt += Number(item.weight) || 0;
            rootQty += Number(item.qty) || 0;
            rootWt += Number(item.weight) || 0;
        });
        flushRoot();
        flushDate();

        const grandQty = data.reduce((s, i) => s + (Number(i.qty) || 0), 0);
        const grandWt = data.reduce((s, i) => s + (Number(i.weight) || 0), 0);

        doc.autoTable({
            startY: 30,
            head: [['Art No', 'Product Name', 'Date', 'Root Card', 'Category', 'Qty', 'Weight (g)', 'Group', 'Image']],
            body: body,
            styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
            headStyles: { fillColor: [140, 0, 76], textColor: 255 },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 45 },
                2: { cellWidth: 22 },
                3: { cellWidth: 20 },
                4: { cellWidth: 26 },
                5: { cellWidth: 14, halign: 'right' },
                6: { cellWidth: 20, halign: 'right' },
                7: { cellWidth: 22 },
                8: { cellWidth: 22, minCellHeight: 16 }
            },
            foot: [[
                { content: 'GRAND TOTAL', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
                { content: String(grandQty), styles: { fontStyle: 'bold', halign: 'right' } },
                { content: grandWt.toFixed(2), styles: { fontStyle: 'bold', halign: 'right' } },
                { content: '' },
                { content: '' }
            ]],
            footStyles: { fillColor: [243, 240, 241], textColor: [107, 1, 50] },
            didDrawCell: function (hook) {
                if (hook.section !== 'body') return;
                const m = meta[hook.row.index];
                if (!m || m.type !== 'data') return;
                if (hook.column.index !== 8) return;

                const item = m.item;
                if (!item.image || !imgCache[item.image]) return;
                const img = imgCache[item.image];
                if (!img.complete || !img.naturalWidth) return;

                try {
                    const pad = 1.5;
                    const maxW = hook.cell.width - pad * 2;
                    const maxH = hook.cell.height - pad * 2;
                    let w = img.naturalWidth;
                    let h = img.naturalHeight;
                    const ratio = Math.min(maxW / w, maxH / h);
                    w *= ratio; h *= ratio;
                    const x = hook.cell.x + (hook.cell.width - w) / 2;
                    const y = hook.cell.y + (hook.cell.height - h) / 2;
                    const fmt = item.image.startsWith('data:image/png') ? 'PNG' : 'JPEG';
                    doc.addImage(img, fmt, x, y, w, h);
                } catch (err) { /* skip */ }
            }
        });

        doc.save('stock_in.pdf');
    });
}

/* ============================================================
   EXCEL EXPORT
   ============================================================ */
async function downloadFilteredExcel() {
    const data = getFilteredStockIn();
    if (data.length === 0) { showToast('No records to export', 'error'); return; }

    showToast('Preparing Excel...', 'success');

    preloadImages(data, async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Stock In');

        sheet.columns = [
            { header: 'Art No', key: 'art', width: 16 },
            { header: 'Product Name', key: 'name', width: 30 },
            { header: 'Date', key: 'date', width: 14 },
            { header: 'Root Card', key: 'rootCardNo', width: 14 },
            { header: 'Category', key: 'category', width: 18 },
            { header: 'Quantity', key: 'qty', width: 10 },
            { header: 'Weight (g)', key: 'weight', width: 12 },
            { header: 'Product Group', key: 'group', width: 16 },
            { header: 'Image', key: 'image', width: 14 }
        ];

        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8C004C' } };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(1).height = 22;

        const sorted = data.slice().sort((a, b) => {
            const k1 = toIso(a.date) + '|' + (a.rootCardNo || '') + '|' + a.art;
            const k2 = toIso(b.date) + '|' + (b.rootCardNo || '') + '|' + b.art;
            return k1.localeCompare(k2);
        });

        let lastDate = null, lastRoot = null;
        let dateQty = 0, dateWt = 0;
        let rootQty = 0, rootWt = 0;
        let r = 2;

        const addSubRow = (label, qty, wt, color, isDate) => {
            const row = sheet.getRow(r++);
            row.values = [label, '', '', '', '', qty, wt, '', ''];
            row.height = 20;
            row.font = { bold: true, color: { argb: isDate ? 'FFFFFFFF' : 'FF6B0132' } };
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
            row.mergeCells(`A${row.number}:E${row.number}`);
            row.getCell(1).alignment = { horizontal: 'right' };
            row.getCell(6).alignment = { horizontal: 'right' };
            row.getCell(7).alignment = { horizontal: 'right' };
            row.getCell(7).numFmt = '0.00';
        };

        const flushRoot = () => {
            if (lastRoot !== null) addSubRow(`Root ${lastRoot} Sub Total`, rootQty, rootWt, 'FFFDF5F8', false);
            rootQty = 0; rootWt = 0;
        };

        const flushDate = () => {
            if (lastDate !== null) addSubRow(`${isoToDisplay(lastDate)} — Date Grand Total`, dateQty, dateWt, 'FF8C004C', true);
            dateQty = 0; dateWt = 0;
        };

        sorted.forEach(item => {
            const rowIso = toIso(item.date);

            if (rowIso !== lastDate) {
                flushRoot();
                flushDate();
                lastDate = rowIso;
                lastRoot = null;
            }
            if (item.rootCardNo !== lastRoot) {
                flushRoot();
                lastRoot = item.rootCardNo;
                const head = sheet.getRow(r++);
                head.values = [`Root Card: ${item.rootCardNo || '-'}   (Date: ${isoToDisplay(rowIso)})`];
                head.font = { bold: true, color: { argb: 'FF8C004C' } };
                head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCEEDF5' } };
                head.mergeCells(`A${head.number}:I${head.number}`);
            }

            const row = sheet.getRow(r++);
            row.values = [
                item.art, item.name, isoToDisplay(rowIso), item.rootCardNo || '-',
                item.category || '-', Number(item.qty) || 0, Number(item.weight) || 0,
                item.group || '-', ''
            ];
            row.height = 58;
            row.alignment = { vertical: 'middle' };
            row.getCell(6).alignment = { horizontal: 'right' };
            row.getCell(7).alignment = { horizontal: 'right' };
            row.getCell(7).numFmt = '0.00';

            if (item.image && imgCache[item.image] && imgCache[item.image].naturalWidth > 0) {
                try {
                    const img = imgCache[item.image];
                    const extension = item.image.startsWith('data:image/png') ? 'png' : 'jpeg';
                    const imageId = workbook.addImage({ base64: img.src, extension });
                    sheet.addImage(imageId, {
                        tl: { col: 8.1, row: (row.number - 1) + 0.05 },
                        ext: { width: 66, height: 66 },
                        editAs: 'oneCell'
                    });
                } catch (err) { /* skip */ }
            }

            dateQty += Number(item.qty) || 0;
            dateWt += Number(item.weight) || 0;
            rootQty += Number(item.qty) || 0;
            rootWt += Number(item.weight) || 0;
        });
        flushRoot();
        flushDate();

        const grandQty = data.reduce((s, i) => s + (Number(i.qty) || 0), 0);
        const grandWt = data.reduce((s, i) => s + (Number(i.weight) || 0), 0);
        const gtRow = sheet.getRow(r++);
        gtRow.values = ['GRAND TOTAL', '', '', '', '', grandQty, grandWt, '', ''];
        gtRow.height = 24;
        gtRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        gtRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B0132' } };
        gtRow.mergeCells(`A${gtRow.number}:E${gtRow.number}`);
        gtRow.getCell(1).alignment = { horizontal: 'right' };
        gtRow.getCell(6).alignment = { horizontal: 'right' };
        gtRow.getCell(7).alignment = { horizontal: 'right' };
        gtRow.getCell(7).numFmt = '0.00';

        sheet.views = [{ state: 'frozen', ySplit: 1 }];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stock_in.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    });
}

/* ============================================================
   FILTER EVENT LISTENERS
   ============================================================ */
document.getElementById('filterRootCard').addEventListener('input', renderStockIn);
document.getElementById('filterName').addEventListener('input', renderStockIn);
document.getElementById('filterCategory').addEventListener('change', renderStockIn);
document.getElementById('filterGroup').addEventListener('change', renderStockIn);
document.getElementById('filterDate').addEventListener('change', renderStockIn);

/* ============================================================
   INITIALISE DATE FILTER TO TODAY (local time)
   ============================================================ */
(function initDateFilter() {
    const dateInput = document.getElementById('filterDate');
    if (dateInput) dateInput.value = todayIso();
})();

/* Initial render (hidden until Details clicked) */
renderStockIn();