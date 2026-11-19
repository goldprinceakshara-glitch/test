// Shared data store using localStorage
const Store = {
    // -------- CATALOGUE --------
    getCatalogue() {
        const data = localStorage.getItem('catalogue');
        if (data) return JSON.parse(data);
        const defaultCatalogue = [
            { art: 'A101', name: 'Krishna 3D Idol', avgWeight: 120, category: '3D Idols', group: 'Antique', size: '6', image: 'https://placehold.co/60x60?text=3D' },
            { art: 'A102', name: 'Lakshmi 2D Frame', avgWeight: 85, category: '2D Idols', group: 'Premium', size: '8', image: 'https://placehold.co/60x60?text=2D' },
            { art: 'B201', name: 'Kundan Necklace', avgWeight: 45, category: 'Jewellery', group: 'Kundan', size: '10', image: 'https://placehold.co/60x60?text=Jew' },
            { art: 'C301', name: 'Antique God Frame', avgWeight: 200, category: 'God frames', group: 'Antique', size: '12', image: 'https://placehold.co/60x60?text=God' },
            { art: 'B202', name: 'Meenakari Earrings', avgWeight: 30, category: 'Jewellery', group: 'Meenakari', size: '2', image: 'https://placehold.co/60x60?text=Meen' },
            { art: 'A103', name: 'Ganesha 3D', avgWeight: 150, category: '3D Idols', group: 'GJ', size: '7', image: 'https://placehold.co/60x60?text=GJ' },
        ];
        localStorage.setItem('catalogue', JSON.stringify(defaultCatalogue));
        gpSaveShared('catalogue', defaultCatalogue);
        return defaultCatalogue;
    },
    setCatalogue(data) { localStorage.setItem('catalogue', JSON.stringify(data)); return gpSaveShared('catalogue', data); },

    // -------- OPENING STOCK --------
    getOpeningStock() {
        const data = localStorage.getItem('openingStock');
        if (data) return JSON.parse(data);
        const defaultOpening = [
            { art: 'A101', name: 'Krishna 3D Idol', qty: 10, weight: 1200, group: 'Antique' },
            { art: 'A102', name: 'Lakshmi 2D Frame', qty: 8, weight: 680, group: 'Premium' },
            { art: 'B201', name: 'Kundan Necklace', qty: 15, weight: 675, group: 'Kundan' },
            { art: 'C301', name: 'Antique God Frame', qty: 5, weight: 1000, group: 'Antique' },
            { art: 'B202', name: 'Meenakari Earrings', qty: 20, weight: 600, group: 'Meenakari' },
        ];
        localStorage.setItem('openingStock', JSON.stringify(defaultOpening));
        gpSaveShared('openingStock', defaultOpening);
        return defaultOpening;
    },
    setOpeningStock(data) { localStorage.setItem('openingStock', JSON.stringify(data)); return gpSaveShared('openingStock', data); },

    // -------- STOCK IN --------
    getStockIn() { return JSON.parse(localStorage.getItem('stockIn') || '[]'); },
    setStockIn(data) { localStorage.setItem('stockIn', JSON.stringify(data)); return gpSaveShared('stockIn', data); },

    // -------- STOCK OUT --------
    getStockOut() { return JSON.parse(localStorage.getItem('stockOut') || '[]'); },
    setStockOut(data) { localStorage.setItem('stockOut', JSON.stringify(data)); return gpSaveShared('stockOut', data); },

    // -------- ESTIMATION (formerly Invoice) NUMBER --------
    getNextInvoiceNo() {
        const counter = parseInt(localStorage.getItem('invoiceCounter') || '0');
        const next = counter + 1;
        const year = new Date().getFullYear();
        const padded = String(next).padStart(4, '0');
        return `EST-${year}-${padded}`;
    },
    commitInvoiceNo() {
        const counter = parseInt(localStorage.getItem('invoiceCounter') || '0');
        localStorage.setItem('invoiceCounter', String(counter + 1));
        gpSaveShared('invoiceCounter', counter + 1);
    },

    getNextReturnNo() {
        const counter = parseInt(localStorage.getItem('returnCounter') || '1000', 10);
        return 'RET-' + (counter + 1);
    },
    commitReturnNo() {
        const counter = parseInt(localStorage.getItem('returnCounter') || '1000', 10);
        localStorage.setItem('returnCounter', String(counter + 1));
        return gpSaveShared('returnCounter', counter + 1);
    },

    // -------- STOCK RETURN --------
    getStockReturn() { return JSON.parse(localStorage.getItem('stockReturn') || '[]'); },
    setStockReturn(data) { localStorage.setItem('stockReturn', JSON.stringify(data)); return gpSaveShared('stockReturn', data); },

    // -------- PARTY MASTER --------
    _normalizeParty(p) {
        if (!p || typeof p !== 'object') return null;
        const id = String(p.partyId ?? p.id ?? p.partyCode ?? p.code ?? '').trim();
        const name = String(p.partyName ?? p.name ?? p['Party Name'] ?? p['party name'] ?? '').trim();
        if (!id && !name) return null;
        return {
            id: id || name,
            name: name || id,
            cell: String(p.cell ?? p.cellNo ?? p.mobile ?? p.phone ?? '').trim(),
            address: String(p.address ?? p.Address ?? '').trim()
        };
    },
    _readPartiesFromKey(key) {
        const out = [];
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return out;
            const data = JSON.parse(raw);
            const add = (rec) => {
                const n = Store._normalizeParty(rec);
                if (n) out.push(n);
            };
            if (Array.isArray(data)) {
                data.forEach(add);
            } else if (data && typeof data === 'object') {
                if (Array.isArray(data.parties)) data.parties.forEach(add);
                else if (Array.isArray(data.partyMaster)) data.partyMaster.forEach(add);
                else {
                    Object.entries(data).forEach(([k, v]) => {
                        if (v && typeof v === 'object') {
                            add({ ...v, name: v.name ?? v.partyName ?? k, id: v.id ?? v.partyId ?? k });
                        }
                    });
                }
            }
        } catch (e) { /* ignore */ }
        return out;
    },
    getParties() {
        const merged = {};
        this._readPartiesFromKey('parties').forEach(p => { merged[p.id] = p; });
        this._readPartiesFromKey('goldprince_parties').forEach(p => { merged[p.id] = p; });
        this._readPartiesFromKey('gp_party_master').forEach(p => { merged[p.id] = p; });

        const list = Object.values(merged);
        if (list.length) return list;

        const defaultParties = [
            { id: 'P001', name: 'Rajesh Jewellers', address: '12 MG Road, Mumbai, MH 400001', cell: '9876543210' },
            { id: 'P002', name: 'Shree Ganesh Traders', address: '45 Anna Salai, Chennai, TN 600002', cell: '9123456789' },
            { id: 'P003', name: 'Krishna Handicrafts', address: '8 Park Street, Kolkata, WB 700016', cell: '9988776655' },
        ];
        localStorage.setItem('parties', JSON.stringify(defaultParties));
        gpSaveShared('parties', defaultParties);
        return defaultParties;
    },
    setParties(data) { localStorage.setItem('parties', JSON.stringify(data)); return gpSaveShared('parties', data); },
    getPartyById(id) { return this.getParties().find(p => p.id === id); },

    // -------- STOCK HOLD --------
    getHolds() {
        try { return JSON.parse(localStorage.getItem('goldprince_stock_holds_v1') || '{}') || {}; }
        catch (e) { return {}; }
    },
    setHolds(obj) { localStorage.setItem('goldprince_stock_holds_v1', JSON.stringify(obj || {})); return gpSaveShared('goldprince_stock_holds_v1', obj || {}); },
    getHoldsForParty(partyId) {
        const all = this.getHolds();
        return Array.isArray(all[partyId]) ? all[partyId] : [];
    },
    setHoldsForParty(partyId, items) {
        const all = this.getHolds();
        all[partyId] = Array.isArray(items) ? items : [];
        this.setHolds(all);
    },
    deleteHoldsForParty(partyId) {
        const all = this.getHolds();
        delete all[partyId];
        this.setHolds(all);
    },
    getHeldQtyForArt(art) {
        const all = this.getHolds();
        const key = String(art).toLowerCase();
        let total = 0;
        Object.values(all).forEach(list => {
            (list || []).forEach(h => {
                if (String(h.art).toLowerCase() === key) total += Number(h.qty || 0);
            });
        });
        return total;
    },
    getHeldTotals() {
        const all = this.getHolds();
        let totalQty = 0, totalWeight = 0;
        Object.values(all).forEach(list => {
            (list || []).forEach(h => {
                totalQty += Number(h.qty || 0);
                totalWeight += Number(h.weight || 0);
            });
        });
        return { totalQty, totalWeight };
    },

    // -------- HELPERS --------
    getCatalogueItem(art) {
        return this.getCatalogue().find(c => c.art.toLowerCase() === art.toLowerCase());
    },

    // Physical balance — does NOT subtract holds.
    computeBalance() {
        const map = new Map();
        const catalogue = this.getCatalogue();

        const touch = (art, defaults) => {
            if (!map.has(art)) {
                const cat = catalogue.find(c => c.art === art) || {};
                map.set(art, {
                    art,
                    name: cat.name || defaults.name || 'Unknown',
                    qty: 0,
                    weight: 0,
                    group: defaults.group || cat.group || '',
                    image: cat.image || ''
                });
            }
            return map.get(art);
        };

        this.getOpeningStock().forEach(item => {
            const e = touch(item.art, { name: item.name, group: item.group });
            e.qty += item.qty;
            e.weight += item.weight;
        });

        this.getStockIn().forEach(item => {
            const e = touch(item.art, { name: item.name, group: item.group });
            e.qty += item.qty;
            e.weight += item.weight;
        });

        this.getStockOut().forEach(txn => {
            // Stock Out transactions are stored per-txn with items[]
            const items = Array.isArray(txn.items) ? txn.items : [txn];
            items.forEach(item => {
                if (!item || !item.art) return;
                const e = touch(item.art, { name: item.name, group: item.group });
                e.qty -= Number(item.qty || 0);
                e.weight -= Number(item.weight || 0);
            });
        });

        // FIXED: Loop through items array for Stock Returns
        this.getStockReturn().forEach(txn => {
            const items = Array.isArray(txn.items) ? txn.items : [txn];
            items.forEach(item => {
                if (!item || !item.art) return;
                const e = touch(item.art, { name: item.name, group: item.group });
                e.qty += Number(item.qty || 0);
                e.weight += Number(item.weight || 0);
            });
        });

        map.forEach((val, key) => {
            const cat = catalogue.find(c => c.art === key);
            if (cat) {
                if (!val.name || val.name === 'Unknown') val.name = cat.name;
                if (!val.group) val.group = cat.group;
                if (!val.image) val.image = cat.image;
            }
        });

        // Attach heldQty + freeQty
        const allHolds = this.getHolds();
        const heldMap = {};
        Object.values(allHolds).forEach(list => {
            (list || []).forEach(h => {
                const k = String(h.art).toLowerCase();
                heldMap[k] = (heldMap[k] || 0) + Number(h.qty || 0);
            });
        });

        return Array.from(map.values()).map(r => {
            const held = heldMap[String(r.art).toLowerCase()] || 0;
            return {
                ...r,
                heldQty: held,
                freeQty: r.qty - held
            };
        });
    },

    // Available = physical balance minus held.
    computeAvailable() {
        return this.computeBalance().map(r => ({
            ...r,
            physicalQty: r.qty,
            qty: r.qty - (r.heldQty || 0)
        }));
    }
};


/* ---------- RAILWAY SHARED-DATA BRIDGE ---------- */
const GP_SHARED_KEYS = [
    'catalogue', 'openingStock', 'stockIn', 'stockOut', 'stockReturn',
    'parties', 'goldprince_stock_holds_v1', 'invoiceCounter', 'returnCounter'
];
const GP_SHARED_STATE = { versions: {}, pending: {}, queues: {}, errors: {} };
const GP_API_ORIGIN = String(window.GP_API_BASE || 'https://test-production-313c31af.up.railway.app').replace(/\\/+$/, '');

function gpClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}
function gpMergeShared(key, remoteValue, localValue) {
    if (remoteValue === undefined || remoteValue === null) return gpClone(localValue);
    if (localValue === undefined || localValue === null) return gpClone(remoteValue);
    if (key === 'invoiceCounter' || key === 'returnCounter') return Math.max(Number(remoteValue) || 0, Number(localValue) || 0);
    if (key === 'goldprince_stock_holds_v1') {
        const out = gpClone(remoteValue) || {};
        Object.entries(localValue || {}).forEach(([partyId, items]) => {
            const combined = Array.isArray(out[partyId]) ? out[partyId].slice() : [];
            const seen = new Set(combined.map(x => JSON.stringify(x)));
            (Array.isArray(items) ? items : []).forEach(item => {
                const signature = JSON.stringify(item);
                if (!seen.has(signature)) { seen.add(signature); combined.push(gpClone(item)); }
            });
            out[partyId] = combined;
        });
        return out;
    }
    if (Array.isArray(remoteValue) && Array.isArray(localValue)) {
        if (key === 'catalogue' || key === 'parties') {
            const idField = key === 'catalogue' ? 'art' : 'id';
            const map = new Map();
            remoteValue.forEach(item => map.set(String(item && item[idField] || ''), gpClone(item)));
            localValue.forEach(item => {
                const id = String(item && item[idField] || '');
                if (id && !map.has(id)) map.set(id, gpClone(item));
            });
            return Array.from(map.values());
        }
        const out = remoteValue.map(gpClone), seen = new Set(out.map(x => JSON.stringify(x)));
        localValue.forEach(item => { const signature = JSON.stringify(item); if (!seen.has(signature)) { seen.add(signature); out.push(gpClone(item)); } });
        return out;
    }
    return gpClone(remoteValue);
}

async function gpPutShared(key, value) {
    let nextValue = gpClone(value);
    for (let attempt = 0; attempt < 5; attempt++) {
        const token = localStorage.getItem('gp_jwt') || '';
        const response = await fetch(GP_API_ORIGIN + '/api/inventory/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ value: nextValue, expectedVersion: Number(GP_SHARED_STATE.versions[key] || 0) })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 409) {
            GP_SHARED_STATE.versions[key] = Number(data.version || 0);
            nextValue = gpMergeShared(key, data.value, nextValue);
            localStorage.setItem(key, JSON.stringify(nextValue));
            continue;
        }
        if (!response.ok) throw new Error(data.error || ('Shared data save failed (' + response.status + ')'));
        GP_SHARED_STATE.versions[key] = Number(data.version || 0);
        GP_SHARED_STATE.errors[key] = null;
        return data;
    }
    throw new Error('Shared data kept changing in other browsers. Please retry this save.');
}

function gpSaveShared(key, value) {
    if (!GP_SHARED_KEYS.includes(key)) return Promise.resolve();
    localStorage.setItem(key, JSON.stringify(value));
    GP_SHARED_STATE.pending[key] = gpClone(value);
    if (!GP_SHARED_STATE.queues[key]) {
        GP_SHARED_STATE.queues[key] = (async function () {
            while (Object.prototype.hasOwnProperty.call(GP_SHARED_STATE.pending, key)) {
                const next = GP_SHARED_STATE.pending[key];
                delete GP_SHARED_STATE.pending[key];
                await gpPutShared(key, next);
            }
        })().catch(function (error) {
            GP_SHARED_STATE.errors[key] = error;
            console.error('[GP Portal] shared data save failed for ' + key, error);
            if (typeof showToast === 'function') showToast('Could not save ' + key + ' to shared database. Check connection and retry.', 'error');
            throw error;
        }).finally(function () { delete GP_SHARED_STATE.queues[key]; });
        GP_SHARED_STATE.queues[key].catch(function () {});
    }
    return GP_SHARED_STATE.queues[key];
}

async function gpLoadSharedData() {
    const token = localStorage.getItem('gp_jwt') || '';
    if (!token) { const error = new Error('Your login session is missing. Please log in again.'); error.status = 401; throw error; }
    const response = await fetch(GP_API_ORIGIN + '/api/inventory', {
        headers: { 'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.error || ('Could not load shared data (' + response.status + ')')); error.status = response.status; throw error; }

    const remote = payload.data || {};
    GP_SHARED_STATE.versions = payload.versions || {};
    const local = {};
    GP_SHARED_KEYS.forEach(key => {
        const raw = localStorage.getItem(key);
        if (raw !== null) { try { local[key] = JSON.parse(raw); } catch (e) {} }
    });
    const legacyParties = [].concat(Store._readPartiesFromKey('goldprince_parties'), Store._readPartiesFromKey('gp_party_master'));
    if (legacyParties.length) local.parties = gpMergeShared('parties', local.parties || [], legacyParties);

    const writes = [];
    GP_SHARED_KEYS.forEach(key => {
        const hasRemote = Object.prototype.hasOwnProperty.call(remote, key), hasLocal = Object.prototype.hasOwnProperty.call(local, key);
        if (!hasRemote && !hasLocal) return;
        const merged = hasRemote && hasLocal ? gpMergeShared(key, remote[key], local[key]) : gpClone(hasRemote ? remote[key] : local[key]);
        localStorage.setItem(key, JSON.stringify(merged));
        if (!hasRemote || JSON.stringify(merged) !== JSON.stringify(remote[key])) writes.push([key, merged]);
    });
    for (const [key, value] of writes) await gpPutShared(key, value);
    return { ok: true, migratedKeys: writes.map(x => x[0]) };
}

Store.ready = gpLoadSharedData().catch(function (error) {
    console.error('[GP Portal] shared data initialization failed', error);
    if (error && error.status === 401) {
        try { sessionStorage.clear(); } catch (e) {}
        try { localStorage.removeItem('gp_jwt'); } catch (e) {}
        window.location.replace('index.html?session=expired&t=' + Date.now());
    }
    throw error;
});
Store.flush = async function () {
    const queues = Object.values(GP_SHARED_STATE.queues);
    if (queues.length) await Promise.all(queues);
    const failed = Object.values(GP_SHARED_STATE.errors).find(Boolean);
    if (failed) throw failed;
    return true;
};

// ---------- HELPERS ----------
function showToast(msg, type = '') {
    let toast = document.getElementById('toastMsg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastMsg';
        toast.className = 'toast-msg';
        document.body.appendChild(toast);
    }
    toast.className = 'toast-msg ' + type;
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function exportToCSV(filename, headers, rows) {
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported successfully', 'success');
}

function parseCSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const firstLine = lines[0].replace(/^\uFEFF/, '');
    const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
        const clean = values.map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        const row = {};
        headers.forEach((h, idx) => { row[h] = clean[idx] || ''; });
        rows.push(row);
    }
    return rows;
}

function buildNavbar() {
    const currentPage = window.location.pathname.split('/').pop() || 'stock index.html';
    const links = [
        { href: 'stock index.html', label: 'Dashboard', icon: 'fa-home' },
        { href: 'catalogue.html', label: 'Catalogue', icon: 'fa-book' },
        { href: 'opening-stock.html', label: 'Opening Stock', icon: 'fa-archive' },
        { href: 'stock-in.html', label: 'Stock In', icon: 'fa-arrow-down' },
        { href: 'stock-out.html', label: 'Stock Out', icon: 'fa-arrow-up' },
        { href: 'stock-return.html', label: 'Stock Return', icon: 'fa-undo-alt' },
        { href: 'balance-stock.html', label: 'Balance Stock', icon: 'fa-calculator' },
        { href: 'category-summary.html', label: 'Category Summary', icon: 'fa-chart-pie' },
        { href: 'available-stock.html', label: 'Available Stock', icon: 'fa-search' },
        { href: 'gpadmin.html', label: 'Go Admin Panel', icon: 'fa-arrow-left' },
    ];
    const nav = document.createElement('div');
    nav.className = 'navbar';
    nav.innerHTML = `
        <div class="brand"><i class="fas fa-boxes"></i> Stock Inventory</div>
        <div class="nav-links">
            ${links.map(l => `
                <a href="${l.href}" class="${currentPage === l.href ? 'active' : ''}">
                    <i class="fas ${l.icon}"></i> ${l.label}
                </a>
            `).join('')}
        </div>
    `;
    document.body.insertBefore(nav, document.body.firstChild);
}