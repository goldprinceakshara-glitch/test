buildNavbar();

let currentData = [];

// ---------- RENDER ----------
function renderAvailable() {
    const balance = Store.computeAvailable();
    const catalogue = Store.getCatalogue();
    const tbody = document.getElementById('availableBody');
    tbody.innerHTML = '';

    const search = document.getElementById('searchInput').value.toLowerCase().trim();
    const filterCat = document.getElementById('filterCategory').value;
    const filterGroup = document.getElementById('filterGroup').value;

    const enriched = balance.map(item => {
        const cat = catalogue.find(c => c.art === item.art) || {};
        return { ...item, category: cat.category || 'Uncategorized' };
    });

    const filtered = enriched.filter(i => {
        const matchSearch = !search ||
            i.art.toLowerCase().includes(search) ||
            i.name.toLowerCase().includes(search);
        const matchCat = !filterCat || i.category === filterCat;
        const matchGroup = !filterGroup || i.group === filterGroup;
        return matchSearch && matchCat && matchGroup;
    });

    currentData = filtered;

    let totalQty = 0, totalWeight = 0;
    filtered.forEach(item => { totalQty += item.qty; totalWeight += item.weight; });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-message">No stock found</td></tr>';
    } else {
        filtered.forEach(item => {
            const imgHtml = item.image
                ? `<img src="${item.image}" class="product-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : '';
            const placeholder = `<div class="img-placeholder" style="display:${item.image ? 'none' : 'flex'}"><i class="fas fa-image"></i></div>`;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.art}</strong></td>
                <td>${item.name}</td>
                <td><span class="badge">${item.category}</span></td>
                <td>${item.group || '-'}</td>
                <td>${item.qty}</td>
                <td>${item.weight.toFixed(2)}</td>
                <td>${imgHtml}${placeholder}</td>
            `;
            tbody.appendChild(tr);
        });

        const trTotal = document.createElement('tr');
        trTotal.style.background = '#ffeff7';
        trTotal.style.fontWeight = '700';
        trTotal.innerHTML = `
            <td colspan="4" style="text-align:right; color:#6b0132;">GRAND TOTAL</td>
            <td style="color:#6b0132;">${totalQty}</td>
            <td style="color:#6b0132;">${totalWeight.toFixed(2)}</td>
            <td></td>
        `;
        tbody.appendChild(trTotal);
    }

    document.getElementById('totalQty').innerText = totalQty;
    document.getElementById('totalWeight').innerText = totalWeight.toFixed(2);
    document.getElementById('totalArt').innerText = filtered.length;
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterGroup').value = '';
    renderAvailable();
}

// =================================================================
// IMAGE LOADING HELPER
// =================================================================
function loadImageAsDataURL(src) {
    return new Promise((resolve) => {
        if (!src) { resolve(null); return; }
        if (src.startsWith('data:')) { resolve(src); return; }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (err) {
                console.warn('Canvas tainted by CORS, image skipped:', src);
                resolve(null);
            }
        };
        img.onerror = () => {
            console.warn('Image failed to load:', src);
            resolve(null);
        };
        img.src = src;
    });
}

function getImageType(dataURL) {
    if (!dataURL) return 'png';
    if (dataURL.startsWith('data:image/jpeg') || dataURL.startsWith('data:image/jpg')) return 'jpeg';
    if (dataURL.startsWith('data:image/gif')) return 'gif';
    if (dataURL.startsWith('data:image/webp')) return 'png';
    return 'png';
}

// =================================================================
// PDF EXPORT WITH IMAGES (LIGHT PINK THEME)
// =================================================================
async function exportPDF() {
    if (currentData.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    showToast('Loading images for PDF...', '');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Title in brand pink
    doc.setFontSize(16);
    doc.setTextColor(140, 0, 76); 
    doc.text('Available Stock Report', 14, 15);

    doc.setFontSize(9);
    doc.setTextColor(100);
    const filterInfo = [];
    const search = document.getElementById('searchInput').value.trim();
    const cat = document.getElementById('filterCategory').value;
    const grp = document.getElementById('filterGroup').value;
    if (search) filterInfo.push('Search: "' + search + '"');
    if (cat) filterInfo.push('Category: ' + cat);
    if (grp) filterInfo.push('Group: ' + grp);
    filterInfo.push('Generated: ' + new Date().toLocaleString());
    doc.text(filterInfo.join('  |  '), 14, 22);

    const imageCache = {};
    for (let i = 0; i < currentData.length; i++) {
        const item = currentData[i];
        if (item.image) {
            imageCache[item.art] = await loadImageAsDataURL(item.image);
        }
    }

    const body = currentData.map(item => [
        item.art,
        item.name,
        item.category,
        item.group || '-',
        item.qty,
        item.weight.toFixed(2),
        ''
    ]);

    const totalQty = currentData.reduce((s, i) => s + i.qty, 0);
    const totalWeight = currentData.reduce((s, i) => s + i.weight, 0);

    doc.autoTable({
        startY: 28,
        head: [['Art No', 'Product Name', 'Category', 'Group', 'Qty', 'Weight (g)', 'Image']],
        body: body,
        foot: [['GRAND TOTAL', '', '', '', totalQty, totalWeight.toFixed(2), '']],
        theme: 'grid',
        // Header in brand pink
        headStyles: { 
            fillColor: [140, 0, 76], // #8c004c
            textColor: 255, 
            fontStyle: 'bold' 
        },
        // Footer with slightly deeper pink background and white text for clear visibility
        footStyles: { 
            fillColor: [184, 0, 90], // #b8005a (brand-light)
            textColor: [255, 255, 255], // White text
            fontStyle: 'bold',
            lineColor: [224, 199, 199], // matching border
            lineWidth: 0.1
        },
        // Table styles with pink borders
        styles: { 
            fontSize: 8, 
            cellPadding: 2, 
            minCellHeight: 16, 
            valign: 'middle',
            lineColor: [243, 228, 236], // very light pink border
            lineWidth: 0.1
        },
        // Alternating row background for readability
        alternateRowStyles: {
            fillColor: [250, 246, 248] 
        },
        columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 55 },
            2: { cellWidth: 30 },
            3: { cellWidth: 25 },
            4: { cellWidth: 15, halign: 'right' },
            5: { cellWidth: 22, halign: 'right' },
            6: { cellWidth: 25, halign: 'center' }
        },
        didDrawCell: function (data) {
            if (data.section !== 'body') return;
            if (data.column.index !== 6) return;
            const item = currentData[data.row.index];
            if (!item) return;
            const imgData = imageCache[item.art];
            if (!imgData) return;

            const padding = 1;
            const size = Math.min(data.cell.width, data.cell.height) - padding * 2;
            try {
                const type = getImageType(imgData);
                doc.addImage(
                    imgData,
                    type.toUpperCase(),
                    data.cell.x + padding,
                    data.cell.y + padding,
                    size,
                    size,
                    undefined,
                    'FAST'
                );
            } catch (e) {
                console.warn('Failed to add image for', item.art, e);
            }
        }
    });

    doc.save('available_stock.pdf');
    showToast('PDF downloaded with images', 'success');
}

// =================================================================
// EXCEL EXPORT WITH EMBEDDED IMAGES
// =================================================================
async function exportExcel() {
    if (currentData.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    showToast('Building Excel with images...', '');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Stock Inventory';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Available Stock', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    sheet.columns = [
        { header: 'Art No', key: 'art', width: 12 },
        { header: 'Product Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Product Group', key: 'group', width: 16 },
        { header: 'Quantity', key: 'qty', width: 10 },
        { header: 'Weight (g)', key: 'weight', width: 12 },
        { header: 'Image', key: 'image', width: 12 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 22;
    headerRow.eachCell(cell => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF8C004C' } // Light Pink/Magenta Theme
        };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF900143' } },
            left: { style: 'thin', color: { argb: 'FF900143' } },
            bottom: { style: 'thin', color: { argb: 'FF900143' } },
            right: { style: 'thin', color: { argb: 'FF900143' } }
        };
    });

    currentData.forEach(item => {
        const row = sheet.addRow({
            art: item.art,
            name: item.name,
            category: item.category,
            group: item.group || '-',
            qty: item.qty,
            weight: parseFloat(item.weight.toFixed(2)),
            image: ''
        });
        row.height = 60;
        row.alignment = { vertical: 'middle' };
        row.eachCell(cell => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
        });
    });

    const totalQty = currentData.reduce((s, i) => s + i.qty, 0);
    const totalWeight = currentData.reduce((s, i) => s + i.weight, 0);
    const totalRow = sheet.addRow({
        art: 'GRAND TOTAL',
        name: '',
        category: '',
        group: '',
        qty: totalQty,
        weight: parseFloat(totalWeight.toFixed(2)),
        image: ''
    });
    totalRow.font = { bold: true, color: { argb: 'FF6B0132' } };
    totalRow.eachCell(cell => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFCEEDF5' }
        };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0C7C7' } },
            left: { style: 'thin', color: { argb: 'FFE0C7C7' } },
            bottom: { style: 'thin', color: { argb: 'FFE0C7C7' } },
            right: { style: 'thin', color: { argb: 'FFE0C7C7' } }
        };
    });

    for (let i = 0; i < currentData.length; i++) {
        const item = currentData[i];
        if (!item.image) continue;

        const dataURL = await loadImageAsDataURL(item.image);
        if (!dataURL) continue;

        const base64 = dataURL.split(',')[1];
        if (!base64) continue;

        const ext = getImageType(dataURL);
        const imageId = workbook.addImage({
            base64: base64,
            extension: ext
        });

        const rowNumber = i + 2;
        const colIndex = 6;

        sheet.addImage(imageId, {
            tl: { col: colIndex + 0.1, row: rowNumber - 1 + 0.1 },
            ext: { width: 55, height: 55 },
            editAs: 'oneCell'
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    saveAs(blob, 'available_stock.xlsx');
    showToast('Excel downloaded with images', 'success');
}

// ---------- EVENTS ----------
document.getElementById('searchInput').addEventListener('input', renderAvailable);
document.getElementById('filterCategory').addEventListener('change', renderAvailable);
document.getElementById('filterGroup').addEventListener('change', renderAvailable);

renderAvailable();