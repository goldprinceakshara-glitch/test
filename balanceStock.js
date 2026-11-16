buildNavbar();

function renderBalance(filter = '') {
    const balance = Store.computeBalance();
    const tbody = document.getElementById('balanceBody');
    tbody.innerHTML = '';
    const lower = filter.toLowerCase();

    const filtered = balance.filter(i => {
        const art = (i.art || '').toLowerCase();
        const name = (i.name || '').toLowerCase();
        const group = (i.group || '').toLowerCase();
        return art.includes(lower) || name.includes(lower) || group.includes(lower);
    });

    let totalQty = 0, totalWeight = 0, totalHeld = 0, totalFree = 0;

    filtered.forEach(item => {
        const heldQty = Number(item.heldQty || 0);
        const freeQty = Number(item.freeQty != null ? item.freeQty : (item.qty - heldQty));

        totalQty    += Number(item.qty || 0);
        totalWeight += Number(item.weight || 0);
        totalHeld   += heldQty;
        totalFree   += freeQty;

        const imgHtml = item.image
            ? `<img src="${item.image}" class="product-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : '';
        const placeholder = `<div class="img-placeholder" style="display:${item.image ? 'none' : 'flex'}"><i class="fas fa-image"></i></div>`;

        const heldBadge = heldQty > 0
            ? `<span class="badge orange">${heldQty}</span>`
            : `<span style="color:#94a3b8;">0</span>`;
        const freeBadge = freeQty > 0
            ? `<span class="badge green">${freeQty}</span>`
            : `<span class="badge red">${freeQty}</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.art}</strong></td>
            <td>${item.name}</td>
            <td>${item.qty}</td>
            <td>${Number(item.weight || 0).toFixed(2)}</td>
            <td>${item.group || '-'}</td>
            <td>${imgHtml}${placeholder}</td>
            <td>${heldBadge}</td>
            <td>${freeBadge}</td>
        `;
        tbody.appendChild(tr);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-message">No stock records found</td></tr>';
    } else {
        // GRAND TOTAL ROW
        const tr = document.createElement('tr');
        tr.style.background = '#ffeff5';
        tr.style.fontWeight = '700';
        tr.innerHTML = `
            <td colspan="2" style="text-align:right; color:#6b0132;">GRAND TOTAL</td>
            <td style="color:#6b0132;">${totalQty}</td>
            <td style="color:#6b0132;">${totalWeight.toFixed(2)}</td>
            <td colspan="2"></td>
            <td style="color:#92400e;">${totalHeld}</td>
            <td style="color:#065f46;">${totalFree}</td>
        `;
        tbody.appendChild(tr);
    }

    document.getElementById('totalQty').innerText = totalQty;
    document.getElementById('totalWeight').innerText = totalWeight.toFixed(2);
    document.getElementById('totalArt').innerText = filtered.length;
}

function exportBalance() {
    const balance = Store.computeBalance();
    const headers = ['Art Number', 'Product Name', 'Quantity', 'Weight', 'Product Group', 'Held Qty', 'Free Qty'];
    const rows = balance.map(b => {
        const held = Number(b.heldQty || 0);
        const free = Number(b.freeQty != null ? b.freeQty : (b.qty - held));
        return [b.art, b.name, b.qty, b.weight, b.group, held, free];
    });

    // Grand total row
    const totalQty    = balance.reduce((s, b) => s + Number(b.qty || 0), 0);
    const totalWeight = balance.reduce((s, b) => s + Number(b.weight || 0), 0);
    const totalHeld   = balance.reduce((s, b) => s + Number(b.heldQty || 0), 0);
    const totalFree   = balance.reduce((s, b) => s + Number(b.freeQty != null ? b.freeQty : (b.qty - (b.heldQty || 0))), 0);
    rows.push(['GRAND TOTAL', '', totalQty, totalWeight.toFixed(2), '', totalHeld, totalFree]);

    exportToCSV('balance_stock.csv', headers, rows);
}

document.getElementById('searchInput').addEventListener('input', e => renderBalance(e.target.value));

renderBalance();