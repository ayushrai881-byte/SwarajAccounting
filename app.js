// ============================================================
// SWARAJ PAYMENTS TRACKER — MASTER v42 (STABLE ENGINE)
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
function saveDealTotal(name, amt) { const dt = getDealTotals(); dt[name] = amt; localStorage.setItem(DEAL_TOTALS_KEY, JSON.stringify(dt)); syncDealToCloud(name, amt); }

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

// ── MASTER CLOUD SYNC ─────────────────────────────────────────
async function syncToCloud(tx) {
    const url = localStorage.getItem(GSHEET_KEY);
    if (!url) return;
    try { await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ type: 'tx', data: tx }) }); } catch (e) { console.error('Sync Error:', e); }
}

async function syncDealToCloud(name, amount) {
    const url = localStorage.getItem(GSHEET_KEY);
    if (!url) return;
    try { await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ type: 'deal', name: name, amount: amount }) }); } catch (e) { console.error('Deal Sync Error:', e); }
}

async function autoLoadFromCloud() {
    const url = localStorage.getItem(GSHEET_KEY);
    if (!url) return;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const txs = (data.txs || []).map(t => ({ ...t, isCustomer: t.isCustomer === true || t.isCustomer === 'true', isDeleted: t.isDeleted === true || t.isDeleted === 'true', amount: parseFloat(t.amount) || 0 }));
        localStorage.setItem(DB_KEY, JSON.stringify(txs));
        if (data.deals) localStorage.setItem(DEAL_TOTALS_KEY, JSON.stringify(data.deals));
        refreshUI();
    } catch (e) { console.error('Auto-Load Error:', e); }
}

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
    const textCol = '#8b949e';
    const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textCol, font: { size: 10 } } } } };
    const COLORS = ['#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f59e0b'];
    const ctx1 = document.getElementById('chart-cat'); if (ctx1) allCharts.cat = new Chart(ctx1, { type: 'doughnut', data: { labels: Object.keys(catD), datasets: [{ data: Object.values(catD), backgroundColor: COLORS }] }, options: chartOpts });
    const ctx2 = document.getElementById('chart-method'); if (ctx2) allCharts.meth = new Chart(ctx2, { type: 'bar', data: { labels: Object.keys(methD), datasets: [{ label: 'Vol', data: Object.values(methD), backgroundColor: '#8b5cf6' }] }, options: { ...chartOpts, scales: { y: { ticks: { color: textCol, font: { size: 9 } } }, x: { ticks: { color: textCol, font: { size: 9 } } } } } });
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
        return `<tr><td style="padding-left:16px; opacity:0.6;">${i + 1}</td><td style="font-weight:600; color:var(--text);">${r.name}</td><td style="color:var(--text2);">₹${target.toLocaleString('en-IN')}</td><td style="font-weight:700; color:var(--accent);">₹${r.total.toLocaleString('en-IN')}</td><td style="font-weight:800; color:${balColor};">₹${balance.toLocaleString('en-IN')}</td><td style="text-align:right; padding-right:16px; display:flex; gap:8px; justify-content:flex-end;"><button class="btn btn-ghost btn-sm" onclick="viewDealDetails('${r.name}')">👁️ View</button><button class="btn btn-ghost btn-sm" onclick="openBulkLinkModal('${r.name}')">🔗 Link</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center; padding:40px; opacity:0.5;">No deals found.</td></tr>';
}

// ── SETTLEMENT HUB LOGIC ──────────────────────────────────────
function renderCalculatorFilters() {
    const allNames = getAllActiveNames();
    const fromList = document.getElementById('calc-from-list');
    const toList = document.getElementById('calc-to-list');
    if (!fromList || !toList) return;

    const generateItems = (prefix) => allNames.map(m => `
        <label class="dropdown-item" style="padding:10px 15px; display:flex; align-items:center; gap:12px; cursor:pointer; background:rgba(255,255,255,0.02); margin-bottom:4px; border-radius:6px;">
            <input type="checkbox" class="calc-cb" data-prefix="${prefix}" value="${m}" onchange="runCalculator()" style="width:16px; height:16px;">
            <span style="font-size:0.85rem; color:var(--text);">${m}</span>
        </label>
    `).join('');

    fromList.innerHTML = generateItems('from');
    toList.innerHTML = generateItems('to');
}

function runCalculator() {
    const fromSel = Array.from(document.querySelectorAll('.calc-cb[data-prefix="from"]:checked')).map(c => c.value);
    const toSel = Array.from(document.querySelectorAll('.calc-cb[data-prefix="to"]:checked')).map(c => c.value);
    const txs = getTransactions();
    const filtered = txs.filter(t => {
        if (fromSel.length > 0 && !fromSel.includes(t.paidBy)) return false;
        if (toSel.length > 0 && !toSel.includes(t.paidTo)) return false;
        return true;
    });
    document.getElementById('calc-total').textContent = fmtCurrency(filtered.reduce((sum, t) => sum + t.amount, 0));
    renderConclusiveTable(filtered);
}

function renderConclusiveTable(txs) {
    const summary = {};
    txs.forEach(t => { const key = `${t.paidBy} → ${t.paidTo}`; if (!summary[key]) summary[key] = { from: t.paidBy, to: t.paidTo, amount: 0 }; summary[key].amount += t.amount; });
    const rows = Object.values(summary).sort((a,b) => b.amount - a.amount);
    document.getElementById('settlement-tbody').innerHTML = rows.map(r => `<tr><td style="padding-left:24px;">${r.from}</td><td>${r.to}</td><td>₹${r.amount.toLocaleString()}</td><td style="text-align:right; padding-right:24px;"><span class="badge">OK</span></td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center; padding:20px; opacity:0.5;">Select filters to view summary</td></tr>';
}

function resetCalculator() { document.querySelectorAll('.calc-cb').forEach(c => c.checked = false); runCalculator(); }

// ── NAVIGATION & UI UTILS ─────────────────────────────────────
function switchTab(tabId) { document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active')); const target = document.getElementById('tab-' + tabId); const nav = document.querySelector(`.nav-item[data-tab="${tabId}"]`); const bNav = document.querySelector(`.bottom-nav-item[data-tab="${tabId}"]`); if (target) target.classList.add('active'); if (nav) nav.classList.add('active'); if (bNav) bNav.classList.add('active'); refreshUI(); }
function refreshUI() { const active = document.querySelector('.section.active').id; if (active === 'tab-dashboard') renderDashboard(); if (active === 'tab-transactions') renderTransactions(); if (active === 'tab-settlement') { renderCalculatorFilters(); runCalculator(); } if (active === 'tab-customer') renderCustomerLedger(); if (active === 'tab-trash') renderTrash(); if (active === 'tab-settings') renderSettings(); updateDataLists(); }

function renderTransactions() {
    const txs = getTransactions();
    const s = document.getElementById('f-search').value.toLowerCase();
    const filtered = txs.filter(t => { if (s && !t.description.toLowerCase().includes(s)) return false; return true; }).sort((a,b) => b.date.localeCompare(a.date));
    document.getElementById('tx-tbody').innerHTML = filtered.map((t, idx) => `<tr><td style="padding-left:16px;">${idx+1}</td><td>${fmtDate(t.date)}</td><td style="font-weight:700; color:var(--accent);">₹${t.amount}</td><td>${t.paidBy}</td><td>${t.paidTo}</td><td>${t.description}</td><td><span class="badge">${t.category}</span></td><td style="text-align:right; padding-right:16px;"><button class="btn btn-danger btn-sm" onclick="deleteTx('${t.id}')">🗑️</button></td></tr>`).join('');
}

function saveManualTx() { 
    const pb = document.getElementById('m-paid-by').value; const pt = document.getElementById('m-paid-to').value; const desc = document.getElementById('m-desc').value;
    const tx = { id: Date.now().toString(), date: document.getElementById('m-date').value, amount: parseFloat(document.getElementById('m-amount').value), paidBy: pb, paidTo: pt, description: desc, category: document.getElementById('m-cat').value || 'Miscellaneous', isCustomer: pb.toLowerCase().includes('customer') || pt.toLowerCase().includes('customer') || document.getElementById('m-is-customer').checked, isDeleted: false }; 
    saveTransactions([...getTransactions(), tx]); 
    syncToCloud(tx); showToast('Saved!'); ['m-date','m-amount','m-paid-by','m-paid-to','m-desc'].forEach(id => document.getElementById(id).value = ''); refreshUI(); 
}

function injectSampleData() {
    if (!confirm('Add 5 sample entries?')) return;
    const m = getMethods();
    const s = [];
    for(let i=1; i<=5; i++) {
        s.push({ id:'s'+Date.now()+i, date:'2024-05-01', amount:Math.floor(Math.random()*5000) + 1000, paidBy:m[0], paidTo:m[1], description:'Sample Transaction '+i, category:'Showroom', isDeleted: false, isCustomer: false });
    }
    const current = getTransactions();
    saveTransactions([...current, ...s]);
    showToast('Sample Data Injected!');
    refreshUI();
}

function deleteTx(id) { const txs = getTransactions(); const tx = txs.find(t => t.id === id); if (!tx) return; tx.isDeleted = true; syncToCloud(tx); saveTransactions(txs.filter(t => t.id !== id)); saveTrash([...getTrash(), { ...tx, deletedAt: new Date().toLocaleString() }]); refreshUI(); }
function updateDataLists() { const allNames = getAllActiveNames(); document.getElementById('methods-dl').innerHTML = allNames.map(m=>`<option value="${m}">`).join(''); }
function fmtDate(d) { if(!d) return '-'; const p = d.split('-'); return p.length!==3 ? d : `${p[2]}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1]}-${p[0].slice(-2)}`; }
function fmtCurrency(n) { return '₹' + n.toLocaleString('en-IN'); }
function showToast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.getElementById('toast-container').appendChild(t); setTimeout(() => t.remove(), 3000); }
function renderSettings() { document.getElementById('gsheet-url').value = localStorage.getItem(GSHEET_KEY) || ''; }
function saveGSheetUrl() { localStorage.setItem(GSHEET_KEY, document.getElementById('gsheet-url').value.trim()); showToast('URL Saved!'); autoLoadFromCloud(); }

document.addEventListener('DOMContentLoaded', () => { 
    refreshUI();
    autoLoadFromCloud();
    document.querySelectorAll('.nav-item').forEach(el => { el.addEventListener('click', () => switchTab(el.dataset.tab)); });
    document.querySelectorAll('.bottom-nav-item').forEach(el => { el.addEventListener('click', () => switchTab(el.dataset.tab)); });
});
