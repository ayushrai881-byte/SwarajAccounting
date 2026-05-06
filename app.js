// ============================================================
// SWARAJ PAYMENTS TRACKER — MASTER v46 (FULL RESTORATION)
// ============================================================

const GSHEET_MASTER_URL = 'https://script.google.com/macros/s/AKfycbywkkVpHXe95HhupFSKwOxLjnXNm0Un6zJMClYhX30wl94STFFTxmu5wvrJiQ0n42m3lQ/exec';

const DB_KEY = 'sp_master_txs';
const TRASH_KEY = 'sp_master_trash';
const METHODS_KEY = 'sp_master_methods';
const GSHEET_KEY = 'sp_master_gsheet';
const ONLINE_METHODS_KEY = 'sp_master_online_methods';
const DEAL_TOTALS_KEY = 'sp_master_deal_totals';

let allCharts = {};

// ── STATE MANAGEMENT ──────────────────────────────────────────
function getTransactions() { return JSON.parse(localStorage.getItem(DB_KEY) || '[]'); }
function saveTransactions(arr) { localStorage.setItem(DB_KEY, JSON.stringify(arr)); }
function getTrash() { return JSON.parse(localStorage.getItem(TRASH_KEY) || '[]'); }
function saveTrash(arr) { localStorage.setItem(TRASH_KEY, JSON.stringify(arr)); }
function getDealTotals() { return JSON.parse(localStorage.getItem(DEAL_TOTALS_KEY) || '{}'); }
function saveDealTotal(name, amt) { 
    const dt = getDealTotals(); dt[name] = amt; 
    localStorage.setItem(DEAL_TOTALS_KEY, JSON.stringify(dt)); 
    syncDealToCloud(name, amt); 
}

function getMethods() {
    const def = ['AU Bank', 'SBI CC', 'Ayush', 'Rahil', 'Cash', 'Swaraj', 'ICICI Bank', 'Customer'];
    const custom = JSON.parse(localStorage.getItem(METHODS_KEY) || '[]');
    return [...new Set([...def, ...custom])];
}

function getCategories() { return ['Fuel', 'Salary', 'Travel', 'Petty Cash', 'Sales', 'Refund', 'Showroom', 'Food', 'Maintenance', 'Utilities', 'Office', 'Miscellaneous']; }

function getAllActiveNames() {
    const txs = getTransactions();
    const names = new Set(getMethods());
    txs.forEach(t => { if (t.paidBy && t.paidBy.length < 25) names.add(t.paidBy); if (t.paidTo && t.paidTo.length < 25) names.add(t.paidTo); });
    return Array.from(names).sort();
}

// ── CLOUD SYNC ENGINE ─────────────────────────────────────────
async function syncToCloud(tx) {
    try { await fetch(GSHEET_MASTER_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ type: 'tx', data: tx }) }); } catch (e) { console.error('Cloud Sync Failed'); }
}

async function syncDealToCloud(name, amount) {
    try { await fetch(GSHEET_MASTER_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ type: 'deal', name: name, amount: amount }) }); } catch (e) { console.error('Deal Sync Failed'); }
}

async function autoLoadFromCloud() {
    try {
        const res = await fetch(GSHEET_MASTER_URL);
        const data = await res.json();
        const txs = (data.txs || []).map(t => ({ ...t, isCustomer: t.isCustomer === true || t.isCustomer === 'true', isDeleted: t.isDeleted === true || t.isDeleted === 'true', amount: parseFloat(t.amount) || 0 }));
        localStorage.setItem(DB_KEY, JSON.stringify(txs));
        if (data.deals) localStorage.setItem(DEAL_TOTALS_KEY, JSON.stringify(data.deals));
        refreshUI();
    } catch (e) { console.error('Auto-Load Error'); }
}

// ── DASHBOARD ─────────────────────────────────────────────────
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
    const catD = {}, methD = {};
    txs.forEach(t => { catD[t.category] = (catD[t.category] || 0) + t.amount; methD[t.paidBy] = (methD[t.paidBy] || 0) + t.amount; });
    const textCol = '#8b949e';
    const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textCol, font: { size: 10 } } } } };
    const ctx1 = document.getElementById('chart-cat'); if (ctx1) allCharts.cat = new Chart(ctx1, { type: 'doughnut', data: { labels: Object.keys(catD), datasets: [{ data: Object.values(catD), backgroundColor: ['#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f59e0b'] }] }, options: chartOpts });
    const ctx2 = document.getElementById('chart-method'); if (ctx2) allCharts.meth = new Chart(ctx2, { type: 'bar', data: { labels: Object.keys(methD), datasets: [{ label: 'Vol', data: Object.values(methD), backgroundColor: '#8b5cf6' }] }, options: chartOpts });
}

// ── SETTLEMENT HUB (CALCULATOR) ───────────────────────────────
function renderCalculatorFilters() {
    const allNames = getAllActiveNames();
    const fromList = document.getElementById('calc-from-list');
    const toList = document.getElementById('calc-to-list');
    if (!fromList || !toList) return;
    const generateItems = (p) => allNames.map(m => `
        <label class="dropdown-item">
            <input type="checkbox" class="calc-cb" data-prefix="${p}" value="${m}" onchange="runCalculator()">
            <span>${m}</span>
        </label>
    `).join('');
    fromList.innerHTML = generateItems('from');
    toList.innerHTML = generateItems('to');
}

function runCalculator() {
    const fromSel = Array.from(document.querySelectorAll('.calc-cb[data-prefix="from"]:checked')).map(c => c.value);
    const toSel = Array.from(document.querySelectorAll('.calc-cb[data-prefix="to"]:checked')).map(c => c.value);
    const filtered = getTransactions().filter(t => { if (fromSel.length > 0 && !fromSel.includes(t.paidBy)) return false; if (toSel.length > 0 && !toSel.includes(t.paidTo)) return false; return true; });
    document.getElementById('calc-total').textContent = fmtCurrency(filtered.reduce((sum, t) => sum + t.amount, 0));
    renderConclusiveTable(filtered);
}

function renderConclusiveTable(txs) {
    const summary = {}; txs.forEach(t => { const key = `${t.paidBy} → ${t.paidTo}`; if (!summary[key]) summary[key] = { from: t.paidBy, to: t.paidTo, amount: 0 }; summary[key].amount += t.amount; });
    const rows = Object.values(summary).sort((a,b) => b.amount - a.amount);
    document.getElementById('settlement-tbody').innerHTML = rows.map(r => `<tr><td style="padding-left:24px;">${r.from}</td><td>${r.to}</td><td>₹${r.amount.toLocaleString()}</td><td style="text-align:right; padding-right:24px;"><span class="badge">OK</span></td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center; padding:20px; opacity:0.5;">Select filters</td></tr>';
}

function resetCalculator() { document.querySelectorAll('.calc-cb').forEach(c => c.checked = false); runCalculator(); }

// ── CUSTOMER LEDGER ───────────────────────────────────────────
function renderCustomerLedger() {
    const txs = getTransactions(); const dt = getDealTotals(); const deals = {};
    txs.filter(t => t.isCustomer).forEach(t => { const name = t.description || 'Unnamed Deal'; if (!deals[name]) deals[name] = { name, total: 0, latestDate: t.date }; deals[name].total += t.amount; if (t.date > deals[name].latestDate) deals[name].latestDate = t.date; });
    const rows = Object.values(deals).sort((a,b) => b.latestDate.localeCompare(a.latestDate));
    document.getElementById('customer-tbody').innerHTML = rows.map((r, i) => { const target = dt[r.name] || 0; const bal = target - r.total; const balCol = bal > 0 ? 'var(--danger)' : 'var(--success)'; return `<tr><td style="padding-left:16px; opacity:0.6;">${i + 1}</td><td style="font-weight:600;">${r.name}</td><td style="color:var(--text2);">₹${target.toLocaleString()}</td><td style="font-weight:700; color:var(--accent);">₹${r.total.toLocaleString()}</td><td style="font-weight:800; color:${balCol};">₹${bal.toLocaleString()}</td><td style="text-align:right; padding-right:16px;"><button class="btn btn-ghost btn-sm" onclick="unlinkFromDeal('${r.name}')">🔗</button></td></tr>`; }).join('') || '<tr><td colspan="6" style="text-align:center; padding:40px; opacity:0.5;">No deals found.</td></tr>';
}

function unlinkFromDeal(dealName) { if (!confirm('Unlink all from this deal?')) return; const txs = getTransactions(); txs.forEach(t => { if (t.isCustomer && t.description === dealName) { t.isCustomer = false; syncToCloud(t); } }); saveTransactions(txs); renderCustomerLedger(); }

// ── TRANSACTION FORM (FIXED) ──────────────────────────────────
function toggleDescriptionField() {
    const pb = document.getElementById('m-paid-by').value;
    const pt = document.getElementById('m-paid-to').value;
    const desc = document.getElementById('m-desc');
    const dealGroup = document.getElementById('m-deal-total-group');
    if (pb && pt) {
        desc.disabled = false;
        desc.placeholder = "Payment details...";
        if (pb.toLowerCase().includes('customer') || pt.toLowerCase().includes('customer')) {
            dealGroup.style.display = pb.toLowerCase() === 'customer' ? 'block' : 'none';
        } else { dealGroup.style.display = 'none'; }
    } else {
        desc.disabled = true;
        desc.placeholder = "Fill From/To first...";
    }
}

function saveManualTx() {
    const pb = document.getElementById('m-paid-by').value; const pt = document.getElementById('m-paid-to').value; const desc = document.getElementById('m-desc').value; const date = document.getElementById('m-date').value; const amt = parseFloat(document.getElementById('m-amount').value);
    if (!date || isNaN(amt) || !pb || !pt) return showToast('Fill all fields');
    if (pb.toLowerCase() === 'customer' && parseFloat(document.getElementById('m-deal-total').value) > 0) {
        saveDealTotal(desc, parseFloat(document.getElementById('m-deal-total').value));
    }
    const tx = { id: Date.now().toString(), date, amount: amt, paidBy: pb, paidTo: pt, description: desc, category: document.getElementById('m-cat').value || 'Miscellaneous', isCustomer: pb.toLowerCase().includes('customer') || pt.toLowerCase().includes('customer') || document.getElementById('m-is-customer').checked, isDeleted: false };
    const current = getTransactions(); saveTransactions([...current, tx]); syncToCloud(tx);
    showToast('Saved!'); ['m-date','m-amount','m-paid-by','m-paid-to','m-desc','m-deal-total'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; }); refreshUI();
}

// ── CORE UTILS ────────────────────────────────────────────────
function switchTab(tabId) { document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(n => n.classList.remove('active')); const target = document.getElementById('tab-' + tabId); if (target) target.classList.add('active'); document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(n => n.classList.add('active')); refreshUI(); }
function refreshUI() { const active = document.querySelector('.section.active').id; if (active === 'tab-dashboard') renderDashboard(); if (active === 'tab-transactions') renderTransactions(); if (active === 'tab-settlement') { renderCalculatorFilters(); runCalculator(); } if (active === 'tab-customer') renderCustomerLedger(); if (active === 'tab-trash') renderTrash(); updateDataLists(); toggleDescriptionField(); }

function renderTransactions() {
    const txs = getTransactions(); const s = document.getElementById('f-search').value.toLowerCase();
    const filtered = txs.filter(t => !t.isDeleted && (!s || t.description.toLowerCase().includes(s))).sort((a,b) => b.date.localeCompare(a.date));
    document.getElementById('tx-tbody').innerHTML = filtered.map((t, idx) => `<tr><td style="padding-left:16px;">${idx+1}</td><td>${fmtDate(t.date)}</td><td style="font-weight:700; color:var(--accent);">₹${t.amount}</td><td>${t.paidBy}</td><td>${t.paidTo}</td><td>${t.description}</td><td><span class="badge">${t.category}</span></td><td style="text-align:right;"><button class="btn btn-danger btn-sm" onclick="deleteTx('${t.id}')">🗑️</button></td></tr>`).join('');
}

function updateDataLists() { 
    const allNames = getAllActiveNames(); 
    document.getElementById('methods-dl').innerHTML = allNames.map(m=>`<option value="${m}">`).join(''); 
    const catEl = document.getElementById('m-cat');
    if (catEl) catEl.innerHTML = getCategories().map(c=>`<option value="${c}">${c}</option>`).join('');
}

function deleteTx(id) { const txs = getTransactions(); const tx = txs.find(t => t.id === id); if (!tx) return; tx.isDeleted = true; syncToCloud(tx); saveTransactions(txs.filter(t => t.id !== id)); saveTrash([...getTrash(), { ...tx, deletedAt: new Date().toLocaleString() }]); refreshUI(); }
function renderTrash() { const trash = getTrash(); document.getElementById('trash-tbody').innerHTML = trash.map((t, i) => `<tr><td style="padding-left:16px;">${i+1}</td><td>${fmtDate(t.date)}</td><td>₹${t.amount}</td><td>${t.paidBy}</td><td>${t.description}</td><td><button class="btn btn-ghost btn-sm" onclick="restoreTx('${t.id}')">🔄</button></td></tr>`).join(''); }
function restoreTx(id) { const trash = getTrash(); const tx = trash.find(t => t.id === id); if (!tx) return; tx.isDeleted = false; syncToCloud(tx); saveTrash(trash.filter(t => t.id !== id)); saveTransactions([...getTransactions(), tx]); refreshUI(); }

function injectSampleData() { if (!confirm('Sample?')) return; const s = []; for(let i=1; i<=3; i++) { s.push({ id:'s'+Date.now()+i, date:'2024-05-01', amount:1000*i, paidBy:'Cash', paidTo:'Ayush', description:'Sample '+i, category:'Sales', isDeleted: false, isCustomer: false }); } saveTransactions([...getTransactions(), ...s]); refreshUI(); }
function fmtDate(d) { if(!d) return '-'; const p = d.split('-'); return `${p[2]}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1]}-${p[0].slice(-2)}`; }
function fmtCurrency(n) { return '₹' + n.toLocaleString('en-IN'); }
function showToast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.getElementById('toast-container').appendChild(t); setTimeout(() => t.remove(), 3000); }
function renderSettings() { }

document.addEventListener('DOMContentLoaded', () => { 
    updateDataLists();
    refreshUI(); 
    autoLoadFromCloud(); 
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => { el.addEventListener('click', () => switchTab(el.dataset.tab)); });
});
