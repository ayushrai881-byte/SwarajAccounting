// ============================================================
// SWARAJ PAYMENTS TRACKER — MASTER v22 (AUTO S.NO & COUNTERS)
// ============================================================

const DB_KEY = 'sp_master_txs';
const TRASH_KEY = 'sp_master_trash';
const METHODS_KEY = 'sp_master_methods';
const GSHEET_KEY = 'sp_master_gsheet';

let allCharts = {};
let pendingImport = [];

// ── STATE MANAGEMENT ──────────────────────────────────────────
function getTransactions() { return JSON.parse(localStorage.getItem(DB_KEY) || '[]'); }
function saveTransactions(arr) { localStorage.setItem(DB_KEY, JSON.stringify(arr)); }
function getTrash() { return JSON.parse(localStorage.getItem(TRASH_KEY) || '[]'); }
function saveTrash(arr) { localStorage.setItem(TRASH_KEY, JSON.stringify(arr)); }

function getMethods() {
    const def = ['AU Bank', 'SBI CC', 'Ayush', 'Rahil', 'Cash', 'Swaraj', 'ICICI Bank'];
    const custom = JSON.parse(localStorage.getItem(METHODS_KEY) || '[]');
    return [...new Set([...def, ...custom])];
}

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
function refreshUI() { const active = document.querySelector('.section.active').id; if (active === 'tab-dashboard') renderDashboard(); if (active === 'tab-transactions') renderTransactions(); if (active === 'tab-settlement') { renderCalculatorFilters(); runCalculator(); } if (active === 'tab-trash') renderTrash(); if (active === 'tab-settings') renderSettings(); updateDataLists(); }

function renderTransactions() {
    const txs = getTransactions();
    const s = document.getElementById('f-search').value.toLowerCase(); const d = document.getElementById('f-date').value; const pb = document.getElementById('f-paid-by').value; const pt = document.getElementById('f-paid-to').value; const cat = document.getElementById('f-cat').value;
    
    const filtered = txs.filter(t => { if (s && !t.description.toLowerCase().includes(s)) return false; if (d && t.date !== d) return false; if (pb && t.paidBy !== pb) return false; if (pt && t.paidTo !== pt) return false; if (cat && t.category !== cat) return false; return true; }).sort((a,b) => b.date.localeCompare(a.date));
    
    // Update Header with Total Count
    const head = document.querySelector('#tab-transactions h2');
    if (head) head.innerHTML = `📋 Transactions <span style="font-size:0.8rem; opacity:0.5; font-weight:400; margin-left:10px;">(Total: ${txs.length})</span>`;

    document.getElementById('tx-tbody').innerHTML = filtered.map((t, idx) => `
        <tr style="font-size:0.75rem;">
            <td style="padding-left:16px; font-weight:600; color:var(--text2);">${idx + 1}</td>
            <td>${t.date}</td>
            <td style="font-weight:700; color:var(--accent);">₹${t.amount}</td>
            <td>${t.paidBy}</td>
            <td>${t.paidTo}</td>
            <td style="opacity:0.8;">${t.description}</td>
            <td><span class="badge" style="background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">${t.category}</span></td>
            <td style="text-align:right; padding-right:16px;"><button class="btn btn-danger btn-sm" onclick="deleteTx('${t.id}')" style="padding:4px 8px;">🗑️</button></td>
        </tr>
    `).join('');
    updateFilterOptions();
}

function updateFilterOptions() { const allNames = getAllActiveNames(); const cats = getCategories(); const setOpts = (id, items) => { const el = document.getElementById(id); const cur = el.value; el.innerHTML = '<option value="">All</option>' + items.map(i => `<option ${i===cur?'selected':''} value="${i}">${i}</option>`).join(''); }; setOpts('f-paid-by', allNames); setOpts('f-paid-to', allNames); setOpts('f-cat', cats); }
function clearFilters() { ['f-search','f-date','f-paid-by','f-paid-to','f-cat'].forEach(id => document.getElementById(id).value = ''); renderTransactions(); }
function parseAndPreview() { const raw = document.getElementById('wa-paste').value; if (!raw) return showToast('Paste first!', 'error'); pendingImport = SP_Parser.parseWhatsAppText(raw); if (pendingImport.length > 0) { document.getElementById('preview-section').style.display = 'block'; document.getElementById('preview-count').textContent = pendingImport.length; document.getElementById('preview-tbody').innerHTML = pendingImport.map((t, i) => `<tr><td>₹${t.amount}</td><td>${t.paidBy}</td><td>${t.paidTo}</td><td><button class="btn btn-danger btn-sm" onclick="removePending(${i})">✕</button></td></tr>`).join(''); } else { showToast('No data found!', 'error'); } }
async function confirmImport() { if (pendingImport.length === 0) return; const toSave = [...pendingImport]; pendingImport = []; document.getElementById('preview-section').style.display = 'none'; document.getElementById('wa-paste').value = ''; saveTransactions([...getTransactions(), ...toSave]); showToast(`Saving ${toSave.length}...`); for (const t of toSave) { await syncToGSheet(t); } showToast('Imported!'); refreshUI(); }
function removePending(i) { pendingImport.splice(i,1); parseAndPreview(); }
function handleFileUpload(input) { const file = input.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { document.getElementById('wa-paste').value = e.target.result; parseAndPreview(); }; reader.readAsText(file); }
function saveManualTx() { const tx = { id: SP_Parser.generateId(), date: document.getElementById('m-date').value, amount: parseFloat(document.getElementById('m-amount').value), paidBy: document.getElementById('m-paid-by').value, paidTo: document.getElementById('m-paid-to').value, description: document.getElementById('m-desc').value, category: document.getElementById('m-cat').value || 'Miscellaneous' }; saveTransactions([...getTransactions(), tx]); syncToGSheet(tx); showToast('Saved!'); refreshUI(); }
function renderSettings() { document.getElementById('methods-list').innerHTML = getMethods().map(m => `<div style="padding:8px; background:rgba(255,255,255,0.03); border-radius:6px; margin-bottom:4px; font-size:0.8rem; border:1px solid #30363d;">${m}</div>`).join(''); document.getElementById('gsheet-url').value = localStorage.getItem(GSHEET_KEY) || ''; }
function addMethodFromInput() { const val = document.getElementById('new-method-input').value.trim(); if (!val) return; const custom = JSON.parse(localStorage.getItem(METHODS_KEY) || '[]'); if (!custom.includes(val)) { custom.push(val); localStorage.setItem(METHODS_KEY, JSON.stringify(custom)); showToast('Added!'); document.getElementById('new-method-input').value = ''; renderSettings(); } }
function clearAllData() { if (confirm('Wipe All?')) { localStorage.removeItem(DB_KEY); localStorage.removeItem(TRASH_KEY); showToast('Wiped!'); refreshUI(); } }
async function syncToGSheet(tx) { const url = localStorage.getItem(GSHEET_KEY); if (!url) return; try { await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify(tx) }); } catch (e) {} }
async function syncAllToGSheet() { const txs = getTransactions(); const url = localStorage.getItem(GSHEET_KEY); if (!url) return showToast('Set URL!', 'error'); document.getElementById('sync-status').textContent = 'Syncing...'; for(let i=0; i<txs.length; i++) { await syncToGSheet(txs[i]); document.getElementById('sync-status').textContent = `Syncing ${i+1}/${txs.length}`; } document.getElementById('sync-status').textContent = '✅ Synced!'; }
function saveGSheetUrl() { localStorage.setItem(GSHEET_KEY, document.getElementById('gsheet-url').value.trim()); showToast('Saved!'); }
function deleteTx(id) { const txs = getTransactions(); const tx = txs.find(t => t.id === id); if (!tx) return; saveTransactions(txs.filter(t => t.id !== id)); saveTrash([...getTrash(), { ...tx, deletedAt: new Date().toLocaleString() }]); showToast('Deleted'); refreshUI(); }

function renderTrash() { 
    const trash = getTrash();
    document.getElementById('trash-tbody').innerHTML = trash.map((t, idx) => `
        <tr style="font-size:0.75rem;">
            <td style="padding-left:16px; opacity:0.6;">${idx + 1}</td>
            <td>${t.date}</td>
            <td>₹${t.amount}</td>
            <td>${t.paidBy}</td>
            <td>${t.paidTo}</td>
            <td>${t.description}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="restoreTx('${t.id}')">🔄</button></td>
        </tr>
    `).join(''); 
}

function restoreTx(id) { const trash = getTrash(); const tx = trash.find(t => t.id === id); if (!tx) return; saveTrash(trash.filter(t => t.id !== id)); saveTransactions([...getTransactions(), tx]); showToast('Restored!'); refreshUI(); }
function emptyTrash() { if(confirm('Empty?')) { saveTrash([]); refreshUI(); } }
function injectSampleData() { const m = getMethods(); const s = []; for(let i=1; i<=10; i++) { s.push({ id:'s'+Date.now()+i, date:'2024-05-01', amount:Math.floor(Math.random()*5000), paidBy:m[0], paidTo:m[1], description:'Sample '+i, category:'Miscellaneous' }); } saveTransactions([...getTransactions(), ...s]); refreshUI(); }
function updateDataLists() { const allNames = getAllActiveNames(); document.getElementById('methods-dl').innerHTML = allNames.map(m=>`<option value="${m}">`).join(''); document.getElementById('m-cat').innerHTML = getCategories().map(c=>`<option value="${c}">${c}</option>`).join(''); }
function fmtCurrency(n) { return '₹' + n.toLocaleString('en-IN'); }
function showToast(m, type='success') { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; if(type==='error') t.style.borderColor = 'var(--danger)'; document.getElementById('toast-container').appendChild(t); setTimeout(() => t.remove(), 3000); }

// ── INITIALIZE ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    switchTab('dashboard');
    document.querySelectorAll('.nav-item').forEach(el => { el.addEventListener('click', () => switchTab(el.dataset.tab)); });
    ['f-search','f-date','f-paid-by','f-paid-to','f-cat'].forEach(id => { document.getElementById(id).addEventListener('input', renderTransactions); });
});
