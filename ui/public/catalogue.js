buildNavbar();

let editingIndex = -1;

/* ============================================================
   COLLAPSIBLE DETAILS TOGGLE
   ============================================================ */
function toggleCatalogueDetails() {
    const panel = document.getElementById('catalogueDetails');
    const btn = document.getElementById('detailsToggleBtn');
    const isHidden = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = isHidden ? 'block' : 'none';
    btn.innerHTML = isHidden
        ? '<i class="fas fa-eye-slash"></i> Hide Details'
        : '<i class="fas fa-eye"></i> Details';
    if (isHidden) renderCatalogue();
}

function clearFilters() {
    document.getElementById('filterName').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterGroup').value = '';
    renderCatalogue();
}

/* ============================================================
   FILTERED DATA HELPER
   ============================================================ */
function getFilteredCatalogue() {
    const catalogue = Store.getCatalogue();
    const nameFilter = (document.getElementById('filterName')?.value || '').toLowerCase().trim();
    const catFilter = document.getElementById('filterCategory')?.value || '';
    const grpFilter = document.getElementById('filterGroup')?.value || '';

    return catalogue.filter(c => {
        const matchName = !nameFilter ||
            c.name.toLowerCase().includes(nameFilter) ||
            c.art.toLowerCase().includes(nameFilter);
        const matchCat = !catFilter || c.category === catFilter;
        const matchGrp = !grpFilter || c.group === grpFilter;
        return matchName && matchCat && matchGrp;
    });
}

/* ============================================================
   RENDER TABLE
   ============================================================ */
function renderCatalogue() {
    const catalogue = Store.getCatalogue();
    const filtered = getFilteredCatalogue();
    const tbody = document.getElementById('catalogueBody');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-message">No products found</td></tr>';
    } else {
        filtered.forEach(item => {
            const realIndex = catalogue.indexOf(item);
            const imgHtml = item.image
                ? `<img src="${item.image}" class="product-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : '';
            const placeholder = `<div class="img-placeholder" style="display:${item.image ? 'none' : 'flex'}"><i class="fas fa-image"></i></div>`;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.art}</strong></td>
                <td>${item.name}</td>
                <td>${item.avgWeight}</td>
                <td><span class="badge">${item.category}</span></td>
                <td>${item.group}</td>
                <td>${item.size}"</td>
                <td>${imgHtml}${placeholder}</td>
                <td>
                    <button class="outline btn-sm" onclick="editProduct(${realIndex})"><i class="fas fa-edit"></i></button>
                    <button class="danger btn-sm" onclick="deleteProduct(${realIndex})"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('totalProducts').innerText = catalogue.length;
    const fEl = document.getElementById('filteredProducts');
    if (fEl) fEl.innerText = filtered.length;
}

/* ============================================================
   ADD / EDIT / DELETE
   ============================================================ */
function openAddModal() {
    editingIndex = -1;
    document.getElementById('modalTitle').innerText = 'Add Product';
    document.getElementById('fArt').value = '';
    document.getElementById('fName').value = '';
    document.getElementById('fAvgWeight').value = 0;
    document.getElementById('fCategory').value = '3D Idols';
    document.getElementById('fGroup').value = 'Antique';
    document.getElementById('fSize').value = '';
    document.getElementById('fImage').value = '';
    document.getElementById('fImageFile').value = '';
    document.getElementById('catalogueModal').classList.add('active');
    
    // Auto focus on Art Number when modal opens
    setTimeout(() => document.getElementById('fArt').focus(), 100);
}

function editProduct(index) {
    editingIndex = index;
    const item = Store.getCatalogue()[index];
    document.getElementById('modalTitle').innerText = 'Edit Product';
    document.getElementById('fArt').value = item.art;
    document.getElementById('fName').value = item.name;
    document.getElementById('fAvgWeight').value = item.avgWeight;
    document.getElementById('fCategory').value = item.category;
    document.getElementById('fGroup').value = item.group;
    document.getElementById('fSize').value = item.size;
    document.getElementById('fImage').value = item.image || '';
    document.getElementById('fImageFile').value = '';
    document.getElementById('catalogueModal').classList.add('active');
}

function closeModal() {
    document.getElementById('catalogueModal').classList.remove('active');
}

function saveProduct() {
    const art = document.getElementById('fArt').value.trim();
    const name = document.getElementById('fName').value.trim();
    if (!art || !name) {
        showToast('Art Number and Product Name are required', 'error');
        return;
    }
    const product = {
        art: art,
        name: name,
        avgWeight: parseFloat(document.getElementById('fAvgWeight').value) || 0,
        category: document.getElementById('fCategory').value,
        group: document.getElementById('fGroup').value,
        size: document.getElementById('fSize').value,
        image: document.getElementById('fImage').value.trim()
    };

    const fileInput = document.getElementById('fImageFile');
    const catalogue = Store.getCatalogue();

    const finishSave = (imgData) => {
        if (imgData) product.image = imgData;
        if (editingIndex >= 0) {
            catalogue[editingIndex] = product;
            showToast('Product updated', 'success');
            closeModal(); // Close on edit
        } else {
            if (catalogue.some(c => c.art.toLowerCase() === product.art.toLowerCase())) {
                showToast('Art Number already exists', 'error');
                document.getElementById('fArt').focus();
                document.getElementById('fArt').select();
                return;
            }
            catalogue.push(product);
            showToast('Product added. Ready for next.', 'success');
            
            // --- CONTINUOUS FORM LOGIC ---
            // Clear the form fields and keep modal open for next entry
            document.getElementById('fArt').value = '';
            document.getElementById('fName').value = '';
            document.getElementById('fAvgWeight').value = 0;
            document.getElementById('fCategory').value = '3D Idols';
            document.getElementById('fGroup').value = 'Antique';
            document.getElementById('fSize').value = '';
            document.getElementById('fImage').value = '';
            document.getElementById('fImageFile').value = '';
            
            // Focus back to Art Number for the next product
            setTimeout(() => document.getElementById('fArt').focus(), 50);
        }
        
        Store.setCatalogue(catalogue);
        renderCatalogue();
    };

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = e => finishSave(e.target.result);
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        finishSave(null);
    }
}

function deleteProduct(index) {
    if (!confirm('Delete this product from catalogue?')) return;
    const catalogue = Store.getCatalogue();
    catalogue.splice(index, 1);
    Store.setCatalogue(catalogue);
    renderCatalogue();
    showToast('Product deleted', 'success');
}

/* ============================================================
   CSV EXPORT (existing behaviour)
   ============================================================ */
function exportCatalogue() {
    const catalogue = getFilteredCatalogue();
    const headers = ['Art Number', 'Product Name', 'Average Weight', 'Category', 'Product Group', 'Size (inch)', 'Image URL'];
    const rows = catalogue.map(c => [c.art, c.name, c.avgWeight, c.category, c.group, c.size, c.image || '']);
    exportToCSV('catalogue.csv', headers, rows);
}

function downloadCatalogueTemplate() {
    const headers = ['Art Number', 'Product Name', 'Average Weight', 'Category', 'Product Group', 'Size (inch)', 'Image URL'];
    const rows = [
        ['A201', 'Sample Product 1', '100', '3D Idols', 'Antique', '6', 'https://placehold.co/60x60?text=Sample'],
        ['A202', 'Sample Product 2', '50', 'Jewellery', 'Kundan', '3', ''],
    ];
    exportToCSV('catalogue_template.csv', headers, rows);
}

/* ============================================================
   PDF EXPORT (with images)
   ============================================================ */
async function downloadFilteredPDF() {
    const data = getFilteredCatalogue();
    if (data.length === 0) {
        showToast('No products to export', 'error');
        return;
    }

    showToast('Preparing PDF...', 'success');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(16);
    doc.setTextColor(140, 0, 76);
    doc.text('Product Catalogue', 14, 15);

    // Build body with image placeholders
    const body = data.map(item => [
        item.art,
        item.name,
        String(item.avgWeight),
        item.category,
        item.group,
        item.size + '"',
        '' // image cell — filled after table render
    ]);

    doc.autoTable({
        startY: 22,
        head: [['Art No', 'Product Name', 'Avg Wt (g)', 'Category', 'Group', 'Size', 'Image']],
        body: body,
        styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
        headStyles: { fillColor: [140, 0, 76], textColor: 255 },
        alternateRowStyles: { fillColor: [250, 242, 246] },
        columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 55 },
            2: { cellWidth: 20 },
            3: { cellWidth: 30 },
            4: { cellWidth: 24 },
            5: { cellWidth: 16 },
            6: { cellWidth: 26, minCellHeight: 18 }
        },
        didDrawCell: function (hook) {
            // Only draw images in the Image column (index 6) and body rows
            if (hook.section === 'body' && hook.column.index === 6) {
                const item = data[hook.row.index];
                if (!item || !item.image) return;
                try {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = item.image;
                    // jsPDF addImage works synchronously for data URLs; for remote URLs it needs preloading.
                    // We handle preloaded images via a cache below.
                    if (imgCache[item.image] && imgCache[item.image].complete) {
                        const pad = 2;
                        const maxW = hook.cell.width - pad * 2;
                        const maxH = hook.cell.height - pad * 2;
                        let w = imgCache[item.image].naturalWidth;
                        let h = imgCache[item.image].naturalHeight;
                        const ratio = Math.min(maxW / w, maxH / h);
                        w = w * ratio; h = h * ratio;
                        const x = hook.cell.x + (hook.cell.width - w) / 2;
                        const y = hook.cell.y + (hook.cell.height - h) / 2;
                        const fmt = item.image.startsWith('data:image/png') ? 'PNG' : 'JPEG';
                        doc.addImage(imgCache[item.image], fmt, x, y, w, h);
                    }
                } catch (e) { /* ignore broken images */ }
            }
        }
    });

    doc.save('catalogue.pdf');
}

/* image cache used by PDF/Excel exports */
const imgCache = {};

/* Preload all images used in filtered dataset, then run callback */
function preloadImages(items, callback) {
    let pending = 0;
    let done = false;
    const finish = () => {
        if (!done && pending === 0) { done = true; callback(); }
    };
    items.forEach(item => {
        if (!item.image || imgCache[item.image]) { finish(); return; }
        pending++;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { imgCache[item.image] = img; pending--; finish(); };
        img.onerror = () => { pending--; finish(); };
        img.src = item.image;
    });
    if (items.length === 0) finish();
    else finish(); // in case all were cached
}

/* Wrap PDF export with image preloading */
async function downloadFilteredPDF() {
    const data = getFilteredCatalogue();
    if (data.length === 0) { showToast('No products to export', 'error'); return; }

    showToast('Preparing PDF...', 'success');
    preloadImages(data, () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(16);
        doc.setTextColor(140, 0, 76);
        doc.text('Product Catalogue', 14, 15);

        const body = data.map(item => [
            item.art, item.name, String(item.avgWeight),
            item.category, item.group, item.size + '"', ''
        ]);

        doc.autoTable({
            startY: 22,
            head: [['Art No', 'Product Name', 'Avg Wt (g)', 'Category', 'Group', 'Size', 'Image']],
            body: body,
            styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
            headStyles: { fillColor: [140, 0, 76], textColor: 255 },
            alternateRowStyles: { fillColor: [250, 242, 246] },
            columnStyles: {
                0: { cellWidth: 22 },
                1: { cellWidth: 55 },
                2: { cellWidth: 20 },
                3: { cellWidth: 30 },
                4: { cellWidth: 24 },
                5: { cellWidth: 16 },
                6: { cellWidth: 26, minCellHeight: 18 }
            },
            didDrawCell: function (hook) {
                if (hook.section === 'body' && hook.column.index === 6) {
                    const item = data[hook.row.index];
                    if (!item || !item.image || !imgCache[item.image]) return;
                    const pad = 2;
                    const maxW = hook.cell.width - pad * 2;
                    const maxH = hook.cell.height - pad * 2;
                    let w = imgCache[item.image].naturalWidth;
                    let h = imgCache[item.image].naturalHeight;
                    const ratio = Math.min(maxW / w, maxH / h);
                    w *= ratio; h *= ratio;
                    const x = hook.cell.x + (hook.cell.width - w) / 2;
                    const y = hook.cell.y + (hook.cell.height - h) / 2;
                    const fmt = item.image.startsWith('data:image/png') ? 'PNG' : 'JPEG';
                    try { doc.addImage(imgCache[item.image], fmt, x, y, w, h); } catch (e) {}
                }
            }
        });

        doc.save('catalogue.pdf');
    });
}

/* ============================================================
   EXCEL EXPORT (with embedded images) using ExcelJS
   ============================================================ */
async function downloadFilteredExcel() {
    const data = getFilteredCatalogue();
    if (data.length === 0) { showToast('No products to export', 'error'); return; }

    showToast('Preparing Excel...', 'success');

    preloadImages(data, async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Catalogue');

        sheet.columns = [
            { header: 'Art No', key: 'art', width: 14 },
            { header: 'Product Name', key: 'name', width: 30 },
            { header: 'Avg Weight (g)', key: 'avgWeight', width: 14 },
            { header: 'Category', key: 'category', width: 18 },
            { header: 'Product Group', key: 'group', width: 16 },
            { header: 'Size (inch)', key: 'size', width: 12 },
            { header: 'Image', key: 'image', width: 18 }
        ];

        // Style header
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: 'FF8C004C' }
        };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        data.forEach((item, idx) => {
            const row = sheet.addRow({
                art: item.art,
                name: item.name,
                avgWeight: item.avgWeight,
                category: item.category,
                group: item.group,
                size: item.size
            });
            row.height = 60;

            // Embed image if available
            const img = imgCache[item.image];
            if (img && img.complete && img.naturalWidth > 0) {
                try {
                    const imageId = workbook.addImage({
                        base64: img.src,
                        extension: img.src.startsWith('data:image/png') ? 'png' : 'jpeg'
                    });
                    // ExcelJS uses zero-based row/col for images; data starts at row 2 (index 1)
                    sheet.addImage(imageId, {
                        tl: { col: 6.1, row: 1 + idx + 0.1 },
                        ext: { width: 70, height: 70 }
                    });
                } catch (e) { /* skip broken image */ }
            }
        });

        // Freeze header + add autofilter
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.autoFilter = { from: 'A1', to: 'G1' };

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'catalogue.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    });
}

/* ============================================================
   BULK IMPORT FROM EXCEL/CSV
   ============================================================ */
document.getElementById('catalogueExcelInput').addEventListener('change', function (e) {
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
        let added = 0, updated = 0, skipped = 0;

        rows.forEach(row => {
            const getVal = (keywords) => {
                const key = Object.keys(row).find(k => {
                    const lk = k.toLowerCase().replace(/\s+/g, '');
                    return keywords.some(kw => lk.includes(kw));
                });
                return key ? String(row[key]).trim() : '';
            };

            const art = getVal(['artnumber', 'artno', 'art']);
            const name = getVal(['productname', 'name', 'product']);
            const avgWeight = parseFloat(getVal(['averageweight', 'avgweight', 'weight'])) || 0;
            const category = getVal(['category']);
            const group = getVal(['productgroup', 'group']);
            const size = getVal(['size']);
            const image = getVal(['imageurl', 'image', 'img']);

            if (!art || !name) { skipped++; return; }

            const validCategories = ['3D Idols', '3D Premium Idols', '2D Idols', 'Jewellery', 'God frames'];
            const validGroups = ['Antique', 'Premium', 'GJ', 'Kundan', 'Gatti', 'Meenakari'];
            const finalCategory = validCategories.includes(category) ? category : '3D Idols';
            const finalGroup = validGroups.includes(group) ? group : 'Antique';

            const existingIdx = catalogue.findIndex(c => c.art.toLowerCase() === art.toLowerCase());
            const product = { art, name, avgWeight, category: finalCategory, group: finalGroup, size, image };

            if (existingIdx >= 0) {
                catalogue[existingIdx] = product;
                updated++;
            } else {
                catalogue.push(product);
                added++;
            }
        });

        Store.setCatalogue(catalogue);
        renderCatalogue();
        showToast(`Import done: ${added} added, ${updated} updated, ${skipped} skipped`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
});

/* ============================================================
   KEYBOARD NAVIGATION (ENTER KEY)
   ============================================================ */
document.getElementById('catalogueModal').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault(); // Prevent default form submission behavior
        
        const inputs = [
            'fArt', 'fName', 'fAvgWeight', 'fCategory', 'fGroup', 'fSize', 'fImage'
        ];
        
        const currentIndex = inputs.indexOf(e.target.id);
        
        if (currentIndex > -1 && currentIndex < inputs.length - 1) {
            // Move to next field
            document.getElementById(inputs[currentIndex + 1]).focus();
        } else if (currentIndex === inputs.length - 1 || e.target.type === 'file') {
            // On last field (fImage) or file input, trigger save
            saveProduct();
        }
    }
});

// Also trigger save on file input change if it's the last step
document.getElementById('fImageFile').addEventListener('change', function() {
    // Optional: Auto-focus the URL image text field or trigger save
    document.getElementById('fImage').focus();
});

/* ============================================================
   FILTER EVENT LISTENERS
   ============================================================ */
document.getElementById('filterName').addEventListener('input', renderCatalogue);
document.getElementById('filterCategory').addEventListener('change', renderCatalogue);
document.getElementById('filterGroup').addEventListener('change', renderCatalogue);

/* Initial render (hidden until Details is clicked) */
renderCatalogue();