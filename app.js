// ============================================================
// SWARAJ PAYMENTS TRACKER — MASTER v31 (SMART RESET & SORT)
// ============================================================

const DB_KEY = 'sp_master_txs';
const TRASH_KEY = 'sp_master_trash';
const METHODS_KEY = 'sp_master_methods';
const GSHEET_KEY = 'sp_master_gsheet';
const ONLINE_METHODS_KEY = 'sp_master_online_methods';
const DEAL_TOTALS_KEY = 'sp_master_deal_totals';

let allCharts = {};
let pendingImport = [];
let customerDeals = [];

// ── STATE MANAGEMENT ──────────────────────────────────────────
function getTransactions() { return JSON.parse(localStorage.getItem(DB_KEY) || '[]'); }
function saveTransactions(arr) { localStorage.setItem(DB_KEY, JSON.stringify(arr)); }
function getTrash() { return JSON.parse(localStorage.getItem(TRASH_KEY) || '[]'); }
function saveTrash(arr) { localStorage.setItem(TRASH_KEY, JSON.stringify(arr)); }
function getDealTotals() { return JSON.parse(localStorage.getItem(DEAL_TOTALS_KEY) || '{}'); }
function saveDealTotal(name, amt) { const dt = getDealTotals(); dt[name] = amt; localStorage.setItem(DEAL_TOTALS_KEY, JSON.stringify(dt)); }

function getMethods() {
    const def = ['AU Bank', 'SBI CC', 'Ayush', 'Rahil', 'Cash', 'Swaraj', 'ICICI Bank', 'Customer'];
    const custom = JSON.parse(localStorage.getItem(METHODS_KEY) || '[]');
    return [...new Set([...def, ...custom])];
}

function getOnlineMethods() { return JSON.parse(localStorage.getItem(ONLINE_METHODS_KEY) || '[]'); }
function saveOnlineMethods(arr) { localStorage.setItem(ONLINE_METHODS_KEY, JSON.stringify(arr)); }

function getAllActiveNames() {
    const txs = getTransactions();
    const names = new Set(getMethods());
    txs.forEach(t => { if (t.paidBy && t.paidBy.length < 25) names.add(t.paidBy); if (t.paidTo && t.paidTo.length < 25) names.add(t.paidTo); });
    return Array.from(names).sort();
}

function getCategories() { return ['Fuel', 'Salary', 'Travel', 'Petty Cash', 'Sales', 'Refund', 'Showroom', 'Food', 'Maintenance', 'Utilities', 'Office', 'Miscellaneous']; }

// ── DASHBOARD & CHARTS ────────────────────────────────────────
function renderDashboard() {
    const txs = getTransactions();
    const total = txs.reduce((s, t) => s + t.amount, 0);
    const stats = document.getElementById('dash-stats');
    if (stats) {
        stats.innerHTML = `
            <div class="card" style="padding:15px;"><div class="card-label">Volume</div><div class="card-value" style="font-size:1.4rem;">${fmtCurrency(total)}</div></div>
            <div class="card" style="padding:15px;"><div class="card-label">Records</div><div class="card-value" style="font-size:1.4rem;">${txs.length}</div></div>
            <div class="card" style="padding:15px;"><div class="card-label">Trash</div><div class="card-value" style="font-size:1.4rem;">${getTrash().length}</div></div>
        `;
    }
    renderCharts(txs);
}

function renderCharts(txs) {
    Object.values(allCharts).forEach(c => { if(c && c.destroy) c.destroy(); });
    const catD = {}, methD = {}, trendD = {}, flowD = { out: 0, in: 0 };
    txs.forEach(t => { catD[t.category] = (catD[t.category] || 0) + t.amount; methD[t.paidBy] = (methD[t.paidBy] || 0) + t.amount; const mo = t.date.slice(0, 7); trendD[mo] = (trendD[mo] || 0) + t.amount; if(['Ayush','Rahil'].includes(t.paidBy)) flowD.out += t.amount; if(['Ayush','Rahil'].includes(t.paidTo)) flowD.in += t.amount; });
    const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#8b949e', font: { size: 10 } } } } };
    const COLORS = ['#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f59e0b'];
    const ctx1 = document.getElementById('chart-cat'); if (ctx1) allCharts.cat = new Chart(ctx1, { type: 'doughnut', data: { labels: Object.keys(catD), datasets: [{ data: Object.values(catD), backgroundColor: COLORS }] }, options: chartOpts });
    const ctx2 = document.getElementById('chart-method'); if (ctx2) allCharts.meth = new Chart(ctx2, { type: 'bar', data: { labels: Object.keys(methD), datasets: [{ label: 'Vol', data: Object.values(methD), backgroundColor: '#8b5cf6' }] }, options: { ...chartOpts, scales: { y: { ticks: { color: '#8b949e', font: { size: 9 } } }, x: { ticks: { color: '#8b949e', font: { size: 9 } } } } } });
    const ctx3 = document.getElementById('chart-trend'); if (ctx3) { const months = Object.keys(trendD).sort(); allCharts.trend = new Chart(ctx3, { type: 'line', data: { labels: months, datasets: [{ label: 'Vol', data: months.map(m => trendD[m]), borderColor: '#8b5cf6', fill: true, backgroundColor: 'rgba(139,92,246,0.1)' }] }, options: chartOpts }); }
    const ctx4 = document.getElementById('chart-ei'); if (ctx4) allCharts.ei = new Chart(ctx4, { type: 'pie', data: { labels: ['Out', 'In'], datasets: [{ data: [flowD.out, flowD.in], backgroundColor: ['#ef4444', '#3fb950'] }] }, options: chartOpts });
}

// ── CUSTOMER LEDGER ───────────────────────────────────────────
function renderCustomerLedger() {
    const txs = getTransactions();
    const dealTotals = getDealTotals();
    const deals = {};
    txs.filter(t => t.isCustomer).forEach(t => {
        const dealName = t.description || 'Unnamed Deal';
        if (!deals[dealName]) deals[dealName] = { name: dealName, total: 0, latestDate: t.date };
        deals[dealName].total += t.amount;
        if (t.date > deals[dealName].latestDate) deals[dealName].latestDate = t.date;
    });
    const rows = Object.values(deals).sort((a,b) => b.latestDate.localeCompare(a.latestDate));
    document.getElementById('customer-tbody').innerHTML = rows.map((r, i) => {
        const target = dealTotals[r.name] || 0;
        const balance = target - r.total;
        const balColor = balance > 0 ? 'var(--danger)' : 'var(--success)';
        return `
            <tr>
                <td style="padding-left:16px; opacity:0.6;">${i + 1}</td>
                <td style="font-weight:600; color:var(--text);">${r.name}</td>
                <td style="color:var(--text2);">₹${target.toLocaleString('en-IN')}</td>
                <td style="font-weight:700; color:var(--accent);">₹${r.total.toLocaleString('en-IN')}</td>
                <td style="font-weight:800; color:${balColor};">₹${balance.toLocaleString('en-IN')}</td>
                <td style="text-align:right; padding-right:16px; display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn btn-ghost btn-sm" onclick="viewDealDetails('${r.name}')">👁️ View</button>
                    <button class="btn btn-ghost btn-sm" onclick="openBulkLinkModal('${r.name}')">🔗 Link</button>
                </td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="6" style="text-align:center; padding:40px; opacity:0.5;">No deals found.</td></tr>';
}

function viewDealDetails(dealName) {
    const txs = getTransactions().filter(t => t.isCustomer && t.description === dealName).sort((a,b) => b.date.localeCompare(a.date));
    const onlineMethods = getOnlineMethods();
    const modalHtml = `
        <div id="modal-overlay-audit" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; display:flex; align-items:center; justify-content:center;">
            <div class="card" style="width:90%; max-width:850px; max-height:85vh; overflow:hidden; display:flex; flex-direction:column;">
                <div class="page-header" style="padding:20px; border-bottom:1px solid rgba(255,255,255,0.1);">
                    <h3>🔍 Deal Audit: ${dealName}</h3>
                    <button class="btn btn-ghost" onclick="document.getElementById('modal-overlay-audit').remove()">✕</button>
                </div>
                <div style="flex:1; overflow-y:auto; padding:20px;">
                    <table style="font-size:0.75rem;">
                        <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Mode</th><th>Description</th><th style="text-align:right;">Action</th></tr></thead>
                        <tbody id="audit-tbody">
                            ${txs.map(t => {
                                const isOnline = onlineMethods.includes(t.paidBy) || onlineMethods.includes(t.paidTo);
                                return `<tr id="audit-row-${t.id}"><td>${fmtDate(t.date)}</td><td style="font-weight:700;">₹${t.amount.toLocaleString()}</td><td>${t.paidBy}</td><td><span class="badge" style="background:${isOnline?'rgba(139,92,246,0.1)':'rgba(255,255,255,0.05)'}; color:${isOnline?'var(--accent)':'var(--text2)'};">${isOnline?'Online':'Cash'}</span></td><td style="opacity:0.7;">${t.description}</td><td style="text-align:right;"><button class="btn btn-danger btn-sm" onclick="unlinkFromDeal('${t.id}', '${dealName}')" style="padding:4px 8px;" title="Unlink from Deal">🔗 Remove</button></td></tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="padding:20px; text-align:right; border-top:1px solid rgba(255,255,255,0.1);">
                    <button class="btn btn-primary" onclick="document.getElementById('modal-overlay-audit').remove()">Close Audit</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function unlinkFromDeal(id, dealName) {
    if (!confirm('Remove this transaction from this deal?')) return;
    const txs = getTransactions();
    const idx = txs.findIndex(t => t.id === id);
    if (idx !== -1) {
        txs[idx].isCustomer = false;
        saveTransactions(txs);
        showToast('Transaction unlinked!');
        document.getElementById(`audit-row-${id}`).remove();
        renderCustomerLedger();
        if (document.querySelectorAll('#audit-tbody tr').length === 0) {
            document.getElementById('modal-overlay-audit').remove();
        }
    }
}

function openBulkLinkModal(dealName = '') {
    const txs = getTransactions().filter(t => !t.isCustomer).sort((a,b) => b.date.localeCompare(a.date));
    const modalHtml = `
        <div id="modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; display:flex; align-items:center; justify-content:center;">
            <div class="card" style="width:95%; max-width:900px; max-height:90vh; overflow:hidden; display:flex; flex-direction:column;">
                <div class="page-header" style="padding:20px; border-bottom:1px solid rgba(255,255,255,0.1);">
                    <h3>🔗 Link Transactions to Deal</h3>
                    <button class="btn btn-ghost" onclick="document.getElementById('modal-overlay').remove()">✕</button>
                </div>
                <div style="padding:20px; background:rgba(0,0,0,0.2); border-bottom:1px solid rgba(255,255,255,0.05);">
                    <label class="nav-label">Assign to Deal Name</label>
                    <div class="flex gap-12" style="margin-top:8px;">
                        <input type="text" id="link-deal-name" value="${dealName}" placeholder="Enter Deal Name..." style="flex:1; font-size:1rem;" />
                        <button class="btn btn-ghost" onclick="autoLinkMatches()" title="Select all that match current Deal Name">✨ Auto-Select Match</button>
                    </div>
                </div>
                <div style="flex:1; overflow-y:auto; padding:0;">
                    <table style="font-size:0.75rem;">
                        <thead style="position:sticky; top:0; background:var(--surface); z-index:10;">
                            <tr><th style="width:50px; padding-left:20px;">Select</th><th>Date</th><th>Amount</th><th>Method</th><th>Current Description</th></tr>
                        </thead>
                        <tbody>
                            ${txs.map(t => `
                                <tr onclick="this.querySelector('input').click()" style="cursor:pointer;">
                                    <td style="padding-left:20px;"><input type="checkbox" class="link-cb" value="${t.id}" data-desc="${t.description}" onclick="event.stopPropagation(); setDealNameFromRow('${t.description}')" style="width:18px; height:18px;"></td>
                                    <td>${fmtDate(t.date)}</td>
                                    <td style="font-weight:700; color:var(--accent);">₹${t.amount}</td>
                                    <td>${t.paidBy} → ${t.paidTo}</td>
                                    <td style="opacity:0.7;">${t.description}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="padding:20px; text-align:right; border-top:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
                    <p id="bulk-selection-count" style="font-size:0.8rem; opacity:0.6;">0 items selected</p>
                    <button class="btn btn-primary" onclick="confirmBulkLink()">✅ Link Selected Entries</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.querySelectorAll('.link-cb').forEach(cb => cb.addEventListener('change', () => {
        const count = document.querySelectorAll('.link-cb:checked').length;
        document.getElementById('bulk-selection-count').textContent = `${count} items selected`;
    }));
}

function setDealNameFromRow(desc) {
    const input = document.getElementById('link-deal-name');
    if (!input.value.trim()) input.value = desc;
}

function autoLinkMatches() {
    const name = document.getElementById('link-deal-name').value.trim();
    if (!name) return showToast('Enter Deal Name first!', 'error');
    document.querySelectorAll('.link-cb').forEach(cb => {
        if (cb.dataset.desc === name) cb.checked = true;
    });
    const count = document.querySelectorAll('.link-cb:checked').length;
    document.getElementById('bulk-selection-count').textContent = `${count} items selected`;
}

function confirmBulkLink() {
    const dealName = document.getElementById('link-deal-name').value.trim();
    if (!dealName) return showToast('Enter Deal Name!', 'error');
    const selectedIds = Array.from(document.querySelectorAll('.link-cb:checked')).map(cb => cb.value);
    if (selectedIds.length === 0) return showToast('Select at least one!', 'error');
    const txs = getTransactions();
    txs.forEach(t => { if (selectedIds.includes(t.id)) { t.isCustomer = true; t.description = dealName; } });
    saveTransactions(txs);
    document.getElementById('modal-overlay').remove();
    showToast(`Linked ${selectedIds.length} entries!`);
    refreshUI();
}

// ── CUSTOM AUTOCOMPLETE ──────────────────────────────────────
function showAutocomplete() {
    const res = document.getElementById('m-desc-results');
    const input = document.getElementById('m-desc');
    if (!input.getAttribute('list')) return; 
    filterAutocomplete();
    res.style.display = 'block';
}

function filterAutocomplete() {
    const res = document.getElementById('m-desc-results');
    const val = document.getElementById('m-desc').value.toLowerCase();
    const matches = customerDeals.filter(d => d.toLowerCase().includes(val));
    res.innerHTML = matches.map(m => `<div class="autocomplete-item" onclick="selectAutocomplete('${m}')">${m}</div>`).join('');
    if (matches.length === 0) res.style.display = 'none'; else res.style.display = 'block';
}

function selectAutocomplete(val) {
    document.getElementById('m-desc').value = val;
    document.getElementById('m-desc-results').style.display = 'none';
    const dealTotals = getDealTotals();
    if (dealTotals[val]) {
        document.getElementById('m-deal-total').value = dealTotals[val];
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-container')) {
        const res = document.getElementById('m-desc-results');
        if (res) res.style.display = 'none';
    }
});

// ── SETTLEMENT & CALCULATOR ───────────────────────────────────
function renderCalculatorFilters() {
    const allNames = getAllActiveNames();
    const mkList = (id, prefix) => {
        document.getElementById(id).innerHTML = allNames.map(m => `
            <label class="dropdown-item" style="padding:6px 10px; border-radius:6px; display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" class="calc-cb" data-prefix="${prefix}" value="${m}" onchange="runCalculator()" style="width:14px; height:14px;">
                <span style="font-size:0.75rem;">${m}</span>
            </label>
        `).join('');
    };
    mkList('calc-from-list', 'from'); mkList('calc-to-list', 'to');
}

function runCalculator() {
    const fromSel = Array.from(document.querySelectorAll('.calc-cb[data-prefix="from"]:checked')).map(c => c.value);
    const toSel = Array.from(document.querySelectorAll('.calc-cb[data-prefix="to"]:checked')).map(c => c.value);
    const filtered = getTransactions().filter(t => { if (fromSel.length > 0 && !fromSel.includes(t.paidBy)) return false; if (toSel.length > 0 && !toSel.includes(t.paidTo)) return false; return true; });
    document.getElementById('calc-total').textContent = fmtCurrency(filtered.reduce((sum, t) => sum + t.amount, 0));
    renderConclusiveTable(filtered);
}

function renderConclusiveTable(txs) {
    const summary = {};
    txs.forEach(t => { const key = `${t.paidBy} → ${t.paidTo}`; if (!summary[key]) summary[key] = { from: t.paidBy, to: t.paidTo, amount: 0 }; summary[key].amount += t.amount; });
    const rows = Object.values(summary).sort((a,b) => b.amount - a.amount);
    document.getElementById('settlement-tbody').innerHTML = rows.map(r => `<tr><td style="padding-left:24px;">${r.from}</td><td><span style="color:var(--accent); font-weight:700;">${r.to}</span></td><td><span style="font-weight:800; color:var(--success);">₹${r.amount.toLocaleString('en-IN')}</span></td><td style="text-align:right; padding-right:24px;"><span style="font-size:0.6rem; opacity:0.5; padding:2px 8px; border:1px solid rgba(255,255,255,0.1); border-radius:10px;">OK</span></td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center; padding:40px; opacity:0.5;">No data found.</td></tr>';
}

function resetCalculator() { document.querySelectorAll('.calc-cb').forEach(c => c.checked = false); runCalculator(); }

// ── NAVIGATION & UI UTILS ─────────────────────────────────────
function switchTab(tabId) { document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); const target = document.getElementById('tab-' + tabId); const nav = document.querySelector(`.nav-item[data-tab="${tabId}"]`); if (target) target.classList.add('active'); if (nav) nav.classList.add('active'); refreshUI(); }
function refreshUI() { const active = document.querySelector('.section.active').id; if (active === 'tab-dashboard') renderDashboard(); if (active === 'tab-transactions') renderTransactions(); if (active === 'tab-settlement') { renderCalculatorFilters(); runCalculator(); } if (active === 'tab-customer') renderCustomerLedger(); if (active === 'tab-trash') renderTrash(); if (active === 'tab-settings') renderSettings(); updateDataLists(); }

function renderTransactions() {
    const txs = getTransactions();
    const s = document.getElementById('f-search').value.toLowerCase(); 
    const df = document.getElementById('f-date-from').value;
    const dt = document.getElementById('f-date-to').value;
    const pb = document.getElementById('f-paid-by').value; const pt = document.getElementById('f-paid-to').value; const cat = document.getElementById('f-cat').value;
    const filtered = txs.filter(t => { 
        if (s && !t.description.toLowerCase().includes(s)) return false; 
        if (df && t.date < df) return false;
        if (dt && t.date > dt) return false;
        if (pb && t.paidBy !== pb) return false; if (pt && t.paidTo !== pt) return false; if (cat && t.category !== cat) return false; return true; 
    }).sort((a,b) => b.date.localeCompare(a.date));
    const head = document.querySelector('#tab-transactions h2');
    if (head) head.innerHTML = `📋 Transactions <span style="font-size:0.8rem; opacity:0.5; font-weight:400; margin-left:10px;">(Total: ${txs.length})</span>`;
    document.getElementById('tx-tbody').innerHTML = filtered.map((t, idx) => `<tr style="font-size:0.75rem;"><td style="padding-left:16px; font-weight:600; color:var(--text2);">${idx + 1}</td><td>${fmtDate(t.date)}</td><td style="font-weight:700; color:var(--accent);">₹${t.amount}</td><td>${t.paidBy}</td><td>${t.paidTo}</td><td style="opacity:0.8;">${t.description}</td><td><span class="badge" style="background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">${t.category}</span></td><td style="text-align:right; padding-right:16px;"><button class="btn btn-danger btn-sm" onclick="deleteTx('${t.id}')" style="padding:4px 8px;">🗑️</button></td></tr>`).join('');
    updateFilterOptions();
}

function updateFilterOptions() { const allNames = getAllActiveNames(); const cats = getCategories(); const setOpts = (id, items) => { const el = document.getElementById(id); const cur = el.value; el.innerHTML = '<option value="">All</option>' + items.map(i => `<option ${i===cur?'selected':''} value="${i}">${i}</option>`).join(''); }; setOpts('f-paid-by', allNames); setOpts('f-paid-to', allNames); setOpts('f-cat', cats); }
function clearFilters() { ['f-search','f-date-from','f-date-to','f-paid-by','f-paid-to','f-cat'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; }); renderTransactions(); }

function parseAndPreview() { 
    const raw = document.getElementById('wa-paste').value; 
    if (!raw) return showToast('Paste first!', 'error'); 
    pendingImport = SP_Parser.parseWhatsAppText(raw); 
    if (pendingImport.length > 0) { 
        document.getElementById('preview-section').style.display = 'block'; 
        document.getElementById('preview-count').textContent = pendingImport.length; 
        document.getElementById('preview-tbody').innerHTML = pendingImport.map((t, i) => {
            const isAutoCust = t.paidBy.toLowerCase().includes('customer') || t.paidTo.toLowerCase().includes('customer');
            return `<tr><td>₹${t.amount}</td><td>${t.paidBy}</td><td>${t.paidTo}</td><td><input type="checkbox" class="preview-cust-cb" value="${i}" ${isAutoCust?'checked':''} style="width:16px; height:16px;"></td><td><button class="btn btn-danger btn-sm" onclick="removePending(${i})">✕</button></td></tr>`;
        }).join(''); 
    } else { showToast('No data found!', 'error'); } 
}

async function confirmImport() { 
    if (pendingImport.length === 0) return; 
    const custIndices = Array.from(document.querySelectorAll('.preview-cust-cb:checked')).map(cb => parseInt(cb.value));
    const toSave = pendingImport.map((t, i) => ({ ...t, isCustomer: custIndices.includes(i) }));
    pendingImport = []; 
    document.getElementById('preview-section').style.display = 'none'; 
    document.getElementById('wa-paste').value = ''; 
    saveTransactions([...getTransactions(), ...toSave]); 
    showToast(`Saving ${toSave.length}...`); 
    for (const t of toSave) { await syncToGSheet(t); } 
    showToast('Imported!'); refreshUI(); 
}

function removePending(i) { pendingImport.splice(i,1); parseAndPreview(); }
function handleFileUpload(input) { const file = input.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { document.getElementById('wa-paste').value = e.target.result; parseAndPreview(); }; reader.readAsText(file); }

function saveManualTx() { 
    const pb = document.getElementById('m-paid-by').value;
    const pt = document.getElementById('m-paid-to').value;
    const isAutoCust = pb.toLowerCase().includes('customer') || pt.toLowerCase().includes('customer');
    const desc = document.getElementById('m-desc').value;
    const dealTotal = parseFloat(document.getElementById('m-deal-total').value) || 0;
    
    if (pb.toLowerCase() === 'customer' && dealTotal > 0) {
        saveDealTotal(desc, dealTotal);
    }

    const tx = { 
        id: SP_Parser.generateId(), 
        date: document.getElementById('m-date').value, 
        amount: parseFloat(document.getElementById('m-amount').value), 
        paidBy: pb, 
        paidTo: pt, 
        description: desc, 
        category: document.getElementById('m-cat').value || 'Miscellaneous',
        isCustomer: isAutoCust || document.getElementById('m-is-customer').checked
    }; 
    saveTransactions([...getTransactions(), tx]); 
    syncToGSheet(tx); 
    showToast('Saved!'); 
    
    // RESET FORM
    document.getElementById('m-date').value = '';
    document.getElementById('m-amount').value = '';
    document.getElementById('m-paid-by').value = '';
    document.getElementById('m-paid-to').value = '';
    document.getElementById('m-desc').value = '';
    document.getElementById('m-deal-total').value = '';
    document.getElementById('m-is-customer').checked = false;
    toggleDescriptionField();

    refreshUI(); 
}

function toggleDescriptionField() {
    const pb = document.getElementById('m-paid-by').value;
    const pt = document.getElementById('m-paid-to').value;
    const desc = document.getElementById('m-desc');
    const dealGroup = document.getElementById('m-deal-total-group');
    
    if (pb && pt) {
        desc.disabled = false;
        desc.placeholder = "Enter description...";
        if (pb.toLowerCase().includes('customer') || pt.toLowerCase().includes('customer')) {
            desc.setAttribute('list', 'deals-dl');
            if (pb.toLowerCase() === 'customer') {
                dealGroup.style.display = 'block';
            } else {
                dealGroup.style.display = 'none';
            }
        } else {
            desc.removeAttribute('list');
            dealGroup.style.display = 'none';
        }
    } else {
        desc.disabled = true;
        desc.value = "";
        desc.placeholder = "Fill From/To first...";
        dealGroup.style.display = 'none';
    }
}

function renderSettings() { 
    const methods = getMethods();
    const online = getOnlineMethods();
    document.getElementById('methods-online-list').innerHTML = methods.map(m => `
        <div class="online-list-item">
            <input type="checkbox" class="online-toggle" value="${m}" ${online.includes(m)?'checked':''} onchange="updateOnlineStatus()">
            <span>${m}</span>
        </div>
    `).join('');
    document.getElementById('gsheet-url').value = localStorage.getItem(GSHEET_KEY) || ''; 
}

function updateOnlineStatus() {
    const selected = Array.from(document.querySelectorAll('.online-toggle:checked')).map(cb => cb.value);
    saveOnlineMethods(selected);
    showToast('Settings Updated!');
}

function addMethodFromInput() { const val = document.getElementById('new-method-input').value.trim(); if (!val) return; const custom = JSON.parse(localStorage.getItem(METHODS_KEY) || '[]'); if (!custom.includes(val)) { custom.push(val); localStorage.setItem(METHODS_KEY, JSON.stringify(custom)); showToast('Added!'); document.getElementById('new-method-input').value = ''; renderSettings(); } }
function clearAllData() { if (confirm('Wipe All?')) { localStorage.removeItem(DB_KEY); localStorage.removeItem(TRASH_KEY); localStorage.removeItem(DEAL_TOTALS_KEY); showToast('Wiped!'); refreshUI(); } }
async function syncToGSheet(tx) { const url = localStorage.getItem(GSHEET_KEY); if (!url) return; try { await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify(tx) }); } catch (e) {} }
async function syncAllToGSheet() { const txs = getTransactions(); const url = localStorage.getItem(GSHEET_KEY); if (!url) return showToast('Set URL!', 'error'); document.getElementById('sync-status').textContent = 'Syncing...'; for(let i=0; i<txs.length; i++) { await syncToGSheet(txs[i]); document.getElementById('sync-status').textContent = `Syncing ${i+1}/${txs.length}`; } document.getElementById('sync-status').textContent = '✅ Synced!'; }
function saveGSheetUrl() { localStorage.setItem(GSHEET_KEY, document.getElementById('gsheet-url').value.trim()); showToast('Saved!'); }
function deleteTx(id) { const txs = getTransactions(); const tx = txs.find(t => t.id === id); if (!tx) return; saveTransactions(txs.filter(t => t.id !== id)); saveTrash([...getTrash(), { ...tx, deletedAt: new Date().toLocaleString() }]); showToast('Deleted'); refreshUI(); }

function renderTrash() { 
    const trash = getTrash().sort((a,b) => b.date.localeCompare(a.date)); 
    document.getElementById('trash-tbody').innerHTML = trash.map((t, idx) => `<tr style="font-size:0.75rem;"><td style="padding-left:16px; opacity:0.6;">${idx + 1}</td><td>${fmtDate(t.date)}</td><td>₹${t.amount}</td><td>${t.paidBy}</td><td>${t.paidTo}</td><td>${t.description}</td><td><button class="btn btn-ghost btn-sm" onclick="restoreTx('${t.id}')">🔄</button></td></tr>`).join(''); 
}

function restoreTx(id) { const trash = getTrash(); const tx = trash.find(t => t.id === id); if (!tx) return; saveTrash(trash.filter(t => t.id !== id)); saveTransactions([...getTransactions(), tx]); showToast('Restored!'); refreshUI(); }
function emptyTrash() { if(confirm('Empty?')) { saveTrash([]); refreshUI(); } }

function injectSampleData() { 
    if (!confirm('Are you sure to add sample data? it may hamper current data.')) return;
    const m = getMethods(); 
    const s = []; 
    for(let i=1; i<=10; i++) { 
        s.push({ id:'s'+Date.now()+i, date:'2024-05-01', amount:Math.floor(Math.random()*5000), paidBy:m[0], paidTo:m[1], description:'Sample '+i, category:'Miscellaneous' }); 
    } 
    saveTransactions([...getTransactions(), ...s]); 
    refreshUI(); 
    showToast('Sample data added!');
}

function updateDataLists() { 
    const txs = getTransactions();
    const allNames = getAllActiveNames(); 
    document.getElementById('methods-dl').innerHTML = allNames.map(m=>`<option value="${m}">`).join(''); 
    document.getElementById('m-cat').innerHTML = getCategories().map(c=>`<option value="${c}">${c}</option>`).join(''); 
    customerDeals = [...new Set(txs.filter(t => t.isCustomer).map(t => t.description))].sort();
}

function fmtDate(d) {
    if(!d) return '-';
    const parts = d.split('-');
    if(parts.length !== 3) return d;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parts[2]}-${months[parseInt(parts[1])-1]}-${parts[0].slice(-2)}`;
}

function fmtCurrency(n) { return '₹' + n.toLocaleString('en-IN'); }
function showToast(m, type='success') { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; if(type==='error') t.style.borderColor = 'var(--danger)'; document.getElementById('toast-container').appendChild(t); setTimeout(() => t.remove(), 3000); }

// ── INITIALIZE ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    switchTab('dashboard');
    document.querySelectorAll('.nav-item').forEach(el => { el.addEventListener('click', () => switchTab(el.dataset.tab)); });
    ['f-search','f-date-from','f-date-to','f-paid-by','f-paid-to','f-cat'].forEach(id => { 
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', renderTransactions); 
    });
});
