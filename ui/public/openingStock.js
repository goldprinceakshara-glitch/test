buildNavbar();

let editingIndex = -1;

/* ============================================================
   COLLAPSIBLE DETAILS TOGGLE
   ============================================================ */
function toggleOpeningDetails() {
    const panel = document.getElementById('openingDetails');
    const btn = document.getElementById('detailsToggleBtn');
    const isHidden = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = isHidden ? 'block' : 'none';
    btn.innerHTML = isHidden
        ? '<i class="fas fa-eye-slash"></i> Hide Details'
        : '<i class="fas fa-eye"></i> Details';
    if (isHidden) renderOpening();
}

function clearFilters() {
    document.getElementById('filterName').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterGroup').value = '';
    renderOpening();
}

/* ============================================================
   FILTERED DATA HELPER (also resolves image + category from catalogue)
   ============================================================ */
function getFilteredOpening() {
    const data = Store.getOpeningStock();
    const catalogue = Store.getCatalogue();

    const catMap = {};
    catalogue.forEach(c => {
        catMap[c.art.toLowerCase()] = { category: c.category, image: c.image || '' };
    });

    const nameFilter = (document.getElementById('filterName')?.value || '').toLowerCase().trim();
    const catFilter = document.getElementById('filterCategory')?.value || '';
    const grpFilter = document.getElementById('filterGroup')?.value || '';

    return data
        .filter(i => {
            const meta = catMap[i.art.toLowerCase()] || { category: '', image: '' };
            const matchName = !nameFilter ||
                i.name.toLowerCase().includes(nameFilter) ||
                i.art.toLowerCase().includes(nameFilter);
            const matchCat = !catFilter || meta.category === catFilter;
            const matchGrp = !grpFilter || i.group === grpFilter;
            return matchName && matchCat && matchGrp;
        })
        .map(i => {
            const meta = catMap[i.art.toLowerCase()] || { category: '', image: '' };
            return { ...i, category: meta.category, image: meta.image };
        });
}

/* ============================================================
   RENDER TABLE + TOTALS (no image column added here,
   keeps table view compact — image used only in exports)
   ============================================================ */
function renderOpening() {
    const data = Store.getOpeningStock();
    const filtered = getFilteredOpening();
    const tbody = document.getElementById('openingBody');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-message">No records found</td></tr>';
    } else {
        filtered.forEach(item => {
            const realIndex = data.findIndex(d => d.art.toLowerCase() === item.art.toLowerCase());
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.art}</strong></td>
                <td>${item.name}</td>
                <td>${item.qty}</td>
                <td>${item.weight.toFixed(2)}</td>
                <td>${item.group || '-'}</td>
                <td>
                    <button class="outline btn-sm" onclick="editOpening(${realIndex})"><i class="fas fa-edit"></i></button>
                    <button class="danger btn-sm" onclick="deleteOpening(${realIndex})"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    const totalQty = filtered.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const totalWeight = filtered.reduce((s, i) => s + (Number(i.weight) || 0), 0);

    const $ = id => document.getElementById(id);
    if ($('filteredCount')) $('filteredCount').innerText = filtered.length;
    if ($('totalQty')) $('totalQty').innerText = totalQty;
    if ($('totalWeight')) $('totalWeight').innerText = totalWeight.toFixed(2);
}

/* ============================================================
   IMAGE CACHE + PRELOADER (shared by PDF & Excel)
   ============================================================ */
const imgCache = {};

function preloadImages(items, callback) {
    // collect unique image URLs
    const urls = [...new Set(items.map(i => i.image).filter(Boolean))];
    if (urls.length === 0) { callback(); return; }

    let pending = urls.length;
    let fired = false;
    const done = () => {
        if (fired) return;
        if (--pending <= 0) { fired = true; callback(); }
    };

    urls.forEach(url => {
        if (imgCache[url]) { pending--; if (pending <= 0) { fired = true; callback(); } return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { imgCache[url] = img; done(); };
        img.onerror = () => { done(); };
        img.src = url;
    });

    // safety: if all cached, fire
    if (pending <= 0 && !fired) { fired = true; callback(); }
}

/* ============================================================
   ART DATALIST
   ============================================================ */
function refreshArtList() {
    const dl = document.getElementById('artList');
    dl.innerHTML = Store.getCatalogue().map(c => `<option value="${c.art}">${c.name}</option>`).join('');
}

/* ============================================================
   ADD / EDIT / DELETE
   ============================================================ */
function openAddModal() {
    editingIndex = -1;
    document.getElementById('modalTitle').innerText = 'Add Opening Stock';
    resetFormForNextEntry();
    refreshArtList();
    document.getElementById('openingModal').classList.add('active');
    setTimeout(() => document.getElementById('fArt').focus(), 50);
}

function editOpening(index) {
    editingIndex = index;
    const item = Store.getOpeningStock()[index];
    document.getElementById('modalTitle').innerText = 'Edit Opening Stock';
    document.getElementById('fArt').value = item.art;
    document.getElementById('fQty').value = item.qty;
    document.getElementById('fWeight').value = item.weight;
    document.getElementById('fGroup').value = item.group || '';
    updateExistingHint(item.art);
    refreshArtList();
    document.getElementById('openingModal').classList.add('active');
    setTimeout(() => document.getElementById('fArt').focus(), 50);
}

function closeModal() {
    document.getElementById('openingModal').classList.remove('active');
    editingIndex = -1;
    resetFormForNextEntry();
}

function resetFormForNextEntry() {
    const art = document.getElementById('fArt');
    art.value = '';
    document.getElementById('fQty').value = 1;
    document.getElementById('fWeight').value = 0;
    document.getElementById('fGroup').value = '';
    updateExistingHint('');
    setTimeout(() => art.focus(), 30);
}

function updateExistingHint(art) {
    const hintEl = document.getElementById('fArtHint');
    if (!hintEl) return;
    const key = (art || '').trim().toLowerCase();
    if (!key) { hintEl.style.display = 'none'; hintEl.innerHTML = ''; return; }

    const data = Store.getOpeningStock();
    const existing = data.find(d => d.art.toLowerCase() === key);
    if (!existing) { hintEl.style.display = 'none'; hintEl.innerHTML = ''; return; }

    hintEl.style.display = 'block';
    hintEl.innerHTML = `<i class="fas fa-info-circle"></i> Already in opening stock: ` +
        `<strong>Qty ${existing.qty}</strong>, <strong>Weight ${Number(existing.weight).toFixed(2)} g</strong>` +
        ` — new values will be <strong>added</strong>.`;
}

function saveOpening() {
    const art = document.getElementById('fArt').value.trim();
    const qty = parseInt(document.getElementById('fQty').value);
    const weight = parseFloat(document.getElementById('fWeight').value) || 0;

    if (!art || isNaN(qty) || qty <= 0) {
        showToast('Art Number and Quantity (> 0) are required', 'error');
        return;
    }
    const cat = Store.getCatalogueItem(art);
    if (!cat) {
        showToast('Art Number not in catalogue', 'error');
        return;
    }

    const data = Store.getOpeningStock();

    /* ---------- EDIT MODE ---------- */
    if (editingIndex >= 0) {
        const dupIdx = data.findIndex((d, i) =>
            i !== editingIndex && d.art.toLowerCase() === cat.art.toLowerCase()
        );
        if (dupIdx >= 0) {
            data[dupIdx].qty = Number(data[dupIdx].qty) + qty;
            data[dupIdx].weight = Number(data[dupIdx].weight) + weight;
            data.splice(editingIndex, 1);
            showToast('Merged into existing Art Number', 'success');
        } else {
            data[editingIndex] = {
                art: cat.art,
                name: cat.name,
                qty: qty,
                weight: weight,
                group: cat.group
            };
            showToast('Opening stock updated', 'success');
        }
        Store.setOpeningStock(data);
        renderOpening();
        closeModal();
        return;
    }

    /* ---------- ADD MODE (merge if exists, continuous) ---------- */
    const existingIdx = data.findIndex(d => d.art.toLowerCase() === cat.art.toLowerCase());

    if (existingIdx >= 0) {
        data[existingIdx].qty = Number(data[existingIdx].qty) + qty;
        data[existingIdx].weight = Number(data[existingIdx].weight) + weight;
        showToast(`Added to ${cat.art}: Qty +${qty}, Weight +${weight.toFixed(2)} g`, 'success');
    } else {
        data.push({
            art: cat.art,
            name: cat.name,
            qty: qty,
            weight: weight,
            group: cat.group
        });
        showToast(`Saved ${cat.art}: Qty ${qty}, Weight ${weight.toFixed(2)} g`, 'success');
    }

    Store.setOpeningStock(data);
    renderOpening();
    resetFormForNextEntry();
}

function deleteOpening(index) {
    if (!confirm('Delete this record?')) return;
    const data = Store.getOpeningStock();
    data.splice(index, 1);
    Store.setOpeningStock(data);
    renderOpening();
    showToast('Record deleted', 'success');
}

/* ============================================================
   PROGRESSIVE ENTER FLOW IN MODAL
   ============================================================ */
document.getElementById('openingModal').addEventListener('keydown', function (e) {
    if (!this.classList.contains('active')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Enter') return;

    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea') return;
    e.preventDefault();

    const id = e.target.id;

    if (id === 'fArt') {
        const art = e.target.value.trim();
        if (!art) { showToast('Please enter Art Number', 'error'); return; }
        const cat = Store.getCatalogueItem(art);
        if (!cat) { showToast('Art Number not in catalogue', 'error'); return; }
        document.getElementById('fGroup').value = cat.group;
        updateExistingHint(art);
        document.getElementById('fQty').focus();
        document.getElementById('fQty').select();
        return;
    }

    if (id === 'fQty') {
        const qty = parseInt(e.target.value);
        if (isNaN(qty) || qty <= 0) {
            showToast('Quantity must be greater than 0', 'error');
            return;
        }
        document.getElementById('fWeight').focus();
        document.getElementById('fWeight').select();
        return;
    }

    if (id === 'fWeight') { saveOpening(); return; }

    saveOpening();
});

/* ============================================================
   CSV TEMPLATE + EXPORT
   ============================================================ */
function downloadTemplate() {
    const headers = ['Art Number', 'Quantity', 'Weight'];
    const rows = [['A101', 10, 1200], ['A102', 8, 680]];
    exportToCSV('opening_stock_template.csv', headers, rows);
}

function exportOpening() {
    const data = getFilteredOpening();
    const headers = ['Art Number', 'Product Name', 'Quantity', 'Weight', 'Product Group', 'Image URL'];
    const rows = data.map(d => [d.art, d.name, d.qty, d.weight, d.group, d.image || '']);
    exportToCSV('opening_stock.csv', headers, rows);
}

/* ============================================================
   PDF EXPORT (with product image column from catalogue)
   ============================================================ */
function downloadFilteredPDF() {
    const data = getFilteredOpening();
    if (data.length === 0) {
        showToast('No records to export', 'error');
        return;
    }

    showToast('Preparing PDF...', 'success');

    // Preload all catalogue images first, then draw
    preloadImages(data, () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(16);
        doc.setTextColor(140, 0, 76);
        doc.text('Opening Stock Report', 14, 15);

        const cat = document.getElementById('filterCategory').value || 'All';
        const grp = document.getElementById('filterGroup').value || 'All';
        const nm = document.getElementById('filterName').value || '-';
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(`Filter — Name: ${nm} | Category: ${cat} | Group: ${grp}`, 14, 21);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);

        // Image column appended at end; body row for image is empty (drawn in didDrawCell)
        const body = data.map(item => [
            item.art,
            item.name,
            String(item.qty),
            Number(item.weight).toFixed(2),
            item.group || '-',
            ''
        ]);

        const totalQty = data.reduce((s, i) => s + (Number(i.qty) || 0), 0);
        const totalWeight = data.reduce((s, i) => s + (Number(i.weight) || 0), 0);

        doc.autoTable({
            startY: 30,
            head: [['Art No', 'Product Name', 'Qty', 'Weight (g)', 'Product Group', 'Image']],
            body: body,
            styles: { fontSize: 9, cellPadding: 2.5, valign: 'middle' },
            headStyles: { fillColor: [140, 0, 76], textColor: 255 },
            alternateRowStyles: { fillColor: [250, 242, 246] },
            columnStyles: {
                0: { cellWidth: 26 },
                1: { cellWidth: 65 },
                2: { cellWidth: 18, halign: 'right' },
                3: { cellWidth: 24, halign: 'right' },
                4: { cellWidth: 32 },
                5: { cellWidth: 26, minCellHeight: 20 } // image column
            },
            foot: [[
                { content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
                { content: String(totalQty), styles: { fontStyle: 'bold', halign: 'right' } },
                { content: totalWeight.toFixed(2), styles: { fontStyle: 'bold', halign: 'right' } },
                { content: '' },
                { content: '' }
            ]],
            footStyles: { fillColor: [243, 240, 241], textColor: [107, 1, 50] },
            didDrawCell: function (hook) {
                // Draw images only in the Image column, body rows
                if (hook.section === 'body' && hook.column.index === 5) {
                    const item = data[hook.row.index];
                    if (!item || !item.image || !imgCache[item.image]) return;
                    const img = imgCache[item.image];
                    if (!img.complete || !img.naturalWidth) return;

                    try {
                        const pad = 2;
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
                    } catch (err) { /* skip broken image */ }
                }
            }
        });

        doc.save('opening_stock.pdf');
    });
}

/* ============================================================
   EXCEL EXPORT (with embedded product images from catalogue)
   ============================================================ */
async function downloadFilteredExcel() {
    const data = getFilteredOpening();
    if (data.length === 0) {
        showToast('No records to export', 'error');
        return;
    }

    showToast('Preparing Excel...', 'success');

    // Preload images first
    preloadImages(data, async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Opening Stock');

        sheet.columns = [
            { header: 'Art No', key: 'art', width: 16 },
            { header: 'Product Name', key: 'name', width: 32 },
            { header: 'Quantity', key: 'qty', width: 12 },
            { header: 'Weight (g)', key: 'weight', width: 14 },
            { header: 'Product Group', key: 'group', width: 18 },
            { header: 'Image', key: 'image', width: 16 }
        ];

        // Header styling
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: 'FF8C004C' }
        };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(1).height = 22;

        let rowIndex = 2; // data starts at row 2 (index 1 in 0-based)
        data.forEach(item => {
            const row = sheet.addRow({
                art: item.art,
                name: item.name,
                qty: Number(item.qty) || 0,
                weight: Number(item.weight) || 0,
                group: item.group || '-'
            });
            row.height = 60; // tall enough for image
            row.alignment = { vertical: 'middle' };

            // Embed image if available
            if (item.image && imgCache[item.image] && imgCache[item.image].naturalWidth > 0) {
                try {
                    const img = imgCache[item.image];
                    // ExcelJS accepts base64 or Buffer; use the image's src (works for both data URLs and URLs).
                    const extension = item.image.startsWith('data:image/png') ? 'png' : 'jpeg';
                    const imageId = workbook.addImage({
                        base64: img.src,
                        extension
                    });
                    sheet.addImage(imageId, {
                        // tl uses 0-based row/col coordinates; data row "rowIndex" corresponds to (rowIndex-1)
                        tl: { col: 5.1, row: (rowIndex - 1) + 0.05 },
                        ext: { width: 72, height: 72 },
                        editAs: 'oneCell'
                    });
                } catch (err) { /* skip broken image */ }
            }
            rowIndex++;
        });

        // Grand total row
        const totalQty = data.reduce((s, i) => s + (Number(i.qty) || 0), 0);
        const totalWeight = data.reduce((s, i) => s + (Number(i.weight) || 0), 0);
        const totalRow = sheet.addRow({
            art: 'GRAND TOTAL',
            name: '',
            qty: totalQty,
            weight: totalWeight,
            group: '',
            image: ''
        });
        totalRow.font = { bold: true, color: { argb: 'FF6B0132' } };
        totalRow.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: 'FFF3F0F1' }
        };
        totalRow.alignment = { horizontal: 'right', vertical: 'middle' };
        totalRow.getCell(1).alignment = { horizontal: 'right' };

        sheet.getColumn('weight').numFmt = '0.00';

        // Freeze header + autofilter (excluding totals row)
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.autoFilter = { from: 'A1', to: { row: 1, column: 6 } };

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'opening_stock.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    });
}

/* ============================================================
   BULK IMPORT — merges duplicates
   ============================================================ */
document.getElementById('excelInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
        const text = ev.target.result;
        const rows = parseCSV(text);
        if (rows.length === 0) {
            showToast('No data found in file', 'error');
            return;
        }
        const data = Store.getOpeningStock();
        const catalogue = Store.getCatalogue();
        let added = 0, merged = 0, skipped = 0;

        rows.forEach(row => {
            const artKey = Object.keys(row).find(k => k.toLowerCase().includes('art'));
            const qtyKey = Object.keys(row).find(k => k.toLowerCase().includes('quantity') || k.toLowerCase() === 'qty');
            const weightKey = Object.keys(row).find(k => k.toLowerCase().includes('weight'));

            const art = artKey ? String(row[artKey]).trim() : '';
            const qty = qtyKey ? parseInt(row[qtyKey]) : 0;
            const weight = weightKey ? parseFloat(row[weightKey]) : 0;

            if (!art || isNaN(qty) || qty <= 0) { skipped++; return; }

            const cat = catalogue.find(c => c.art.toLowerCase() === art.toLowerCase());
            if (!cat) { skipped++; return; }

            const existingIdx = data.findIndex(d => d.art.toLowerCase() === cat.art.toLowerCase());
            if (existingIdx >= 0) {
                data[existingIdx].qty = Number(data[existingIdx].qty) + qty;
                data[existingIdx].weight = Number(data[existingIdx].weight) + (weight || 0);
                merged++;
            } else {
                data.push({
                    art: cat.art,
                    name: cat.name,
                    qty: qty,
                    weight: weight || 0,
                    group: cat.group
                });
                added++;
            }
        });
        Store.setOpeningStock(data);
        renderOpening();
        showToast(`Import done: ${added} added, ${merged} merged, ${skipped} skipped`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
});

/* ============================================================
   AUTO-FILL GROUP + HINT ON ART CHANGE
   ============================================================ */
document.getElementById('fArt').addEventListener('input', function () {
    const cat = Store.getCatalogueItem(this.value);
    document.getElementById('fGroup').value = cat ? cat.group : '';
    updateExistingHint(this.value);
});

/* ============================================================
   FILTER EVENT LISTENERS
   ============================================================ */
document.getElementById('filterName').addEventListener('input', renderOpening);
document.getElementById('filterCategory').addEventListener('change', renderOpening);
document.getElementById('filterGroup').addEventListener('change', renderOpening);

/* Initial render */
renderOpening();