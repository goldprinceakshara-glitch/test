buildNavbar();

function renderCategorySummary() {
    const balance = Store.computeBalance();
    const catalogue = Store.getCatalogue();
    const catMap = new Map();

    balance.forEach(item => {
        const cat = catalogue.find(c => c.art === item.art);
        const category = cat ? cat.category : 'Uncategorized';
        if (!catMap.has(category)) catMap.set(category, { qty: 0, weight: 0, arts: new Set() });
        const entry = catMap.get(category);
        entry.qty += item.qty;
        entry.weight += item.weight;
        entry.arts.add(item.art);
    });

    const tbody = document.getElementById('categoryBody');
    tbody.innerHTML = '';
    if (catMap.size === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-message">No data</td></tr>';
        return;
    }

    let grandQty = 0, grandWeight = 0, grandArts = 0;

    catMap.forEach((val, key) => {
        grandQty += val.qty;
        grandWeight += val.weight;
        grandArts += val.arts.size;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${key}</strong></td>
            <td><span class="badge green">${val.qty}</span></td>
            <td>${val.weight.toFixed(2)}</td>
            <td>${val.arts.size}</td>
        `;
        tbody.appendChild(tr);
    });

    // GRAND TOTAL ROW
    const trTotal = document.createElement('tr');
    trTotal.style.background = '#ffeffa';
    trTotal.style.fontWeight = '700';
    trTotal.innerHTML = `
        <td style="color:#6b0132;">GRAND TOTAL</td>
        <td style="color:#6b0132;">${grandQty}</td>
        <td style="color:#6b0132;">${grandWeight.toFixed(2)}</td>
        <td style="color:#6b0132;">${grandArts}</td>
    `;
    tbody.appendChild(trTotal);
}

function exportSummary() {
    const balance = Store.computeBalance();
    const catalogue = Store.getCatalogue();
    const catMap = new Map();
    balance.forEach(item => {
        const cat = catalogue.find(c => c.art === item.art);
        const category = cat ? cat.category : 'Uncategorized';
        if (!catMap.has(category)) catMap.set(category, { qty: 0, weight: 0, arts: new Set() });
        const e = catMap.get(category);
        e.qty += item.qty;
        e.weight += item.weight;
        e.arts.add(item.art);
    });

    const headers = ['Category', 'Total Quantity', 'Total Weight', 'Art Numbers'];
    const rows = [];
    let grandQty = 0, grandWeight = 0, grandArts = 0;
    catMap.forEach((v, k) => {
        rows.push([k, v.qty, v.weight.toFixed(2), v.arts.size]);
        grandQty += v.qty;
        grandWeight += v.weight;
        grandArts += v.arts.size;
    });
    rows.push(['GRAND TOTAL', grandQty, grandWeight.toFixed(2), grandArts]);

    exportToCSV('category_summary.csv', headers, rows);
}

renderCategorySummary();