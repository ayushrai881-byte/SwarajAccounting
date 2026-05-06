// ============================================================
// SWARAJ PAYMENTS TRACKER — MASTER v9 (PREVENT DOUBLE SAVE)
// ============================================================

const DB_KEY = 'sp_master_txs';
const TRASH_KEY = 'sp_master_trash';
const METHODS_KEY = 'sp_master_methods';
const GSHEET_KEY = 'sp_master_gsheet';

let allCharts = {};
let pendingImport = [];

// ── STATE ────────────────────────────────────────────────────
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
    txs.forEach(t => { if (t.paidBy) names.add(t.paidBy); if (t.paidTo) names.add(t.paidTo); });
    return Array.from(names).sort();
}

function addMethod(m) {
  const custom = JSON.parse(localStorage.getItem(METHODS_KEY) || '[]');
  if (!custom.includes(m)) { custom.push(m); localStorage.setItem(METHODS_KEY, JSON.stringify(custom)); }
  refreshUI();
}

function getCategories() {
  return ['Fuel', 'Salary', 'Travel', 'Petty Cash', 'Sales', 'Refund', 'Showroom', 'Food', 'Maintenance', 'Utilities', 'Office', 'Miscellaneous'];
}

// ── SYNC ──────────────────────────────────────────────────────
async function syncToGSheet(tx) {
  const url = localStorage.getItem(GSHEET_KEY);
  if (url) { try { await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify(tx) }); } catch (e) {} }
}

async function syncAllToGSheet() {
    const txs = getTransactions();
    const status = document.getElementById('sync-status');
    if (!localStorage.getItem(GSHEET_KEY)) return showToast('Set Sync URL first!', 'error');
    if (!txs.length) return showToast('No data to sync!');
    status.textContent = "Syncing... Please wait.";
    for (let i = 0; i < txs.length; i++) {
        await syncToGSheet(txs[i]);
        status.textContent = `Syncing: ${i + 1} / ${txs.length}`;
    }
    status.textContent = "✅ All data synced to Google Sheet!";
    showToast('Success: All history uploaded!');
}

function saveGSheetUrl() {
  localStorage.setItem(GSHEET_KEY, document.getElementById('gsheet-url').value.trim());
  showToast('Cloud Sync URL Saved!');
}

// ── NAVIGATION & UI ───────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  refreshUI();
}

function refreshUI() {
    const activeTab = document.querySelector('.nav-item.active').dataset.tab;
    if (activeTab === 'dashboard') renderDashboard();
    if (activeTab === 'transactions') renderTransactions();
    if (activeTab === 'settlement') { renderSettlement(); renderCalculatorFilters(); }
    if (activeTab === 'trash') renderTrash();
    if (activeTab === 'settings') renderSettings();
    updateDataLists();
}

function renderDashboard() {
  const txs = getTransactions();
  const total = txs.reduce((s, t) => s + t.amount, 0);
  document.getElementById('dash-stats').innerHTML = `
    <div class="card"><div class="card-label">Overall Volume</div><div class="card-value">${fmtCurrency(total)}</div></div>
    <div class="card"><div class="card-label">Active Records</div><div class="card-value">${txs.length}</div></div>
    <div class="card"><div class="card-label">Deleted Items</div><div class="card-value">${getTrash().length}</div></div>
  `;
  renderCharts(txs);
}

function renderCharts(txs) {
  Object.values(allCharts).forEach(c => c.destroy());
  const catD = {}, methD = {}, trendD = {}, flowD = { out: 0, in: 0 };
  txs.forEach(t => {
    catD[t.category] = (catD[t.category] || 0) + t.amount;
    methD[t.paidBy] = (methD[t.paidBy] || 0) + t.amount;
    const mo = t.date.slice(0, 7); trendD[mo] = (trendD[mo] || 0) + t.amount;
    if(['Ayush','Rahil'].includes(t.paidBy)) flowD.out += t.amount;
    if(['Ayush','Rahil'].includes(t.paidTo)) flowD.in += t.amount;
  });
  const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'];
  allCharts.cat = new Chart(document.getElementById('chart-cat'), { type: 'doughnut', data: { labels: Object.keys(catD), datasets: [{ data: Object.values(catD), backgroundColor: COLORS }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
  allCharts.meth = new Chart(document.getElementById('chart-method'), { type: 'bar', data: { labels: Object.keys(methD), datasets: [{ label: 'By Account', data: Object.values(methD), backgroundColor: '#10b981' }] }, options: { responsive: true, maintainAspectRatio: false } });
  const months = Object.keys(trendD).sort();
  allCharts.trend = new Chart(document.getElementById('chart-trend'), { type: 'line', data: { labels: months, datasets: [{ label: 'Volume', data: months.map(m => trendD[m]), borderColor: '#6366f1', fill: true, backgroundColor: 'rgba(99,102,241,0.1)' }] }, options: { responsive: true, maintainAspectRatio: false } });
  allCharts.ei = new Chart(document.getElementById('chart-ei'), { type: 'pie', data: { labels: ['Partner Out', 'Partner In'], datasets: [{ data: [flowD.out, flowD.in], backgroundColor: ['#ef4444', '#10b981'] }] }, options: { responsive: true, maintainAspectRatio: false } });
}

function renderTransactions() {
  const s = document.getElementById('f-search').value.toLowerCase();
  const d = document.getElementById('f-date').value;
  const pb = document.getElementById('f-paid-by').value;
  const pt = document.getElementById('f-paid-to').value;
  const cat = document.getElementById('f-cat').value;
  const filtered = getTransactions().filter(t => {
    if (s && !t.description.toLowerCase().includes(s)) return false;
    if (d && t.date !== d) return false;
    if (pb && t.paidBy !== pb) return false;
    if (pt && t.paidTo !== pt) return false;
    if (cat && t.category !== cat) return false;
    return true;
  }).sort((a,b) => b.date.localeCompare(a.date));
  document.getElementById('tx-tbody').innerHTML = filtered.map(t => `<tr><td>${t.date}</td><td class="amount-cell">₹${t.amount}</td><td><span class="badge-method badge">${t.paidBy}</span></td><td><span class="badge-income badge">${t.paidTo}</span></td><td>${t.description}</td><td><span class="badge-cat badge">${t.category}</span></td><td><button class="btn btn-danger btn-sm" onclick="deleteTx('${t.id}')">🗑️</button></td></tr>`).join('');
  updateFilterOptions();
}

function renderCalculatorFilters() {
    const allNames = getAllActiveNames();
    const mkHtml = (type) => allNames.map(m => `
        <label class="flex gap-8 mb-8" style="font-size:0.85rem; cursor:pointer;"><input type="checkbox" class="calc-check" data-type="${type}" value="${m}" onchange="runCalculator()"> ${m}</label>
    `).join('');
    document.getElementById('calc-from-list').innerHTML = mkHtml('from');
    document.getElementById('calc-to-list').innerHTML = mkHtml('to');
}

function runCalculator() {
    const fb = Array.from(document.querySelectorAll('.calc-check[data-type="from"]:checked')).map(i => i.value);
    const tb = Array.from(document.querySelectorAll('.calc-check[data-type="to"]:checked')).map(i => i.value);
    const total = getTransactions().reduce((sum, t) => {
        if ((fb.length === 0 || fb.includes(t.paidBy)) && (tb.length === 0 || tb.includes(t.paidTo))) return sum + t.amount;
        return sum;
    }, 0);
    document.getElementById('calc-total').textContent = fmtCurrency(total);
}

function resetCalculator() { document.querySelectorAll('.calc-check').forEach(i => i.checked = false); document.getElementById('calc-total').textContent = '₹0'; }

function renderSettlement() {
  const txs = getTransactions();
  const summ = document.getElementById('settlement-summary');
  let aToR = 0, rToA = 0, rToAU = 0, aToAU = 0;
  txs.forEach(t => {
    if (t.paidBy === 'Ayush' && t.paidTo === 'Rahil') aToR += t.amount;
    if (t.paidBy === 'Rahil' && t.paidTo === 'Ayush') rToA += t.amount;
    if (t.paidBy === 'Rahil' && t.paidTo === 'AU Bank') rToAU += t.amount;
    if (t.paidBy === 'Ayush' && t.paidTo === 'AU Bank') aToAU += t.amount;
  });
  summ.innerHTML = `<div class="card"><div class="card-label">Ayush to Rahil</div><div class="card-value">₹${aToR}</div></div><div class="card"><div class="card-label">Rahil to Ayush</div><div class="card-value">₹${rToA}</div></div><div class="card"><div class="card-label">Rahil to AU Bank</div><div class="card-value">₹${rToAU}</div></div><div class="card"><div class="card-label">Ayush to AU Bank</div><div class="card-value">₹${aToAU}</div></div>`;
  document.getElementById('settlement-tbody').innerHTML = txs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,50).map(t => `<tr><td>${t.date}</td><td><strong>${t.paidBy}</strong></td><td><strong>${t.paidTo}</strong></td><td>₹${t.amount}</td><td class="text-muted">${t.description}</td></tr>`).join('');
}

// ── IMPORT & UTILS (FIXED DOUBLE SAVE) ────────────────────────
function parseAndPreview() {
    pendingImport = SP_Parser.parseWhatsAppText(document.getElementById('wa-paste').value);
    if (pendingImport.length > 0) {
        document.getElementById('preview-section').style.display = 'block';
        document.getElementById('preview-tbody').innerHTML = pendingImport.map((t, i) => `<tr><td>${t.date}</td><td>₹${t.amount}</td><td>${t.paidBy}</td><td>${t.paidTo}</td><td>${t.description}</td><td><button onclick="removePending(${i})">✕</button></td></tr>`).join('');
    }
}

function handleFileUpload(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = (e) => { document.getElementById('wa-paste').value = e.target.result; parseAndPreview(); }; reader.readAsText(file);
}

function removePending(i) { pendingImport.splice(i,1); parseAndPreview(); }

async function confirmImport() {
    if (pendingImport.length === 0) return;
    
    // 1. Immediately copy data and clear global pending state
    const dataToSave = [...pendingImport];
    pendingImport = []; 
    
    // 2. Hide UI immediately so user can't click again
    document.getElementById('preview-section').style.display = 'none';
    document.getElementById('wa-paste').value = '';
    
    // 3. Save locally
    saveTransactions([...getTransactions(), ...dataToSave]);
    
    // 4. Sync to cloud in background
    showToast(`Saving ${dataToSave.length} entries...`);
    for (const t of dataToSave) {
        await syncToGSheet(t);
    }
    
    showToast('Imported & Cloud Synced!'); 
    switchTab('dashboard');
}

function deleteTx(id) { const txs = getTransactions(); const tx = txs.find(t => t.id === id); if (!tx) return; saveTransactions(txs.filter(t => t.id !== id)); saveTrash([...getTrash(), { ...tx, deletedAt: new Date().toLocaleString() }]); showToast('Moved to Trash'); refreshUI(); }
function restoreTx(id) { const trash = getTrash(); const tx = trash.find(t => t.id === id); if (!tx) return; saveTrash(trash.filter(t => t.id !== id)); saveTransactions([...getTransactions(), tx]); showToast('Restored!'); refreshUI(); }
function emptyTrash() { if(confirm('Delete permanently?')) { saveTrash([]); refreshUI(); } }
function renderTrash() { document.getElementById('trash-tbody').innerHTML = getTrash().map(t => `<tr><td>${t.date}</td><td>₹${t.amount}</td><td>${t.paidBy}</td><td>${t.paidTo}</td><td>${t.description}</td><td>${t.deletedAt}</td><td><button class="btn btn-ghost btn-sm" onclick="restoreTx('${t.id}')">🔄 Restore</button></td></tr>`).join(''); }
function saveManualTx() { const tx = { id:SP_Parser.generateId(), date:document.getElementById('m-date').value, amount:parseFloat(document.getElementById('m-amount').value), paidBy:document.getElementById('m-paid-by').value, paidTo:document.getElementById('m-paid-to').value, description:document.getElementById('m-desc').value, category:document.getElementById('m-cat').value || SP_Parser.detectCategory(document.getElementById('m-desc').value) }; saveTransactions([...getTransactions(), tx]); syncToGSheet(tx); showToast('Saved!'); refreshUI(); }
function injectSampleData() { const m = getMethods(); const s = []; const d = new Date().toISOString().slice(0,10); for(let i=1; i<=20; i++) { const f = m[Math.floor(Math.random()*m.length)], t = m[Math.floor(Math.random()*m.length)]; s.push({ id:'s'+i+Date.now(), date:d, amount:Math.floor(Math.random()*5000)+100, paidBy:f, paidTo:t, description:`Sample #${i}`, category:getCategories()[Math.floor(Math.random()*4)] }); } saveTransactions([...getTransactions(), ...s]); showToast('20 Samples Injected!'); refreshUI(); }
function clearFilters() { ['f-search','f-date','f-paid-by','f-paid-to','f-cat'].forEach(id => document.getElementById(id).value = ''); renderTransactions(); }
function updateDataLists() { const allNames = getAllActiveNames(); document.getElementById('methods-dl').innerHTML = allNames.map(m=>`<option value="${m}">`).join(''); document.getElementById('m-cat').innerHTML = getCategories().map(c=>`<option value="${c}">${c}</option>`).join(''); }
function renderSettings() { document.getElementById('methods-list').innerHTML = getMethods().map(m=>`<div class="settings-item">${m}</div>`).join(''); document.getElementById('cats-list').innerHTML = getCategories().map(c=>`<div class="settings-item">${c}</div>`).join(''); document.getElementById('gsheet-url').value = localStorage.getItem(GSHEET_KEY) || ''; }
function addMethodFromInput() { const v = document.getElementById('new-method-input').value.trim(); if(v) addMethod(v); document.getElementById('new-method-input').value = ''; renderSettings(); }
function fmtCurrency(n) { return '₹' + n.toLocaleString('en-IN'); }
function showToast(m) { const t = document.createElement('div'); t.className = 'toast success'; t.textContent = m; document.getElementById('toast-container').appendChild(t); setTimeout(()=>t.remove(), 3000); }
function switchImportTab(t) { document.querySelectorAll('.import-tab').forEach(x => x.classList.toggle('active', x.dataset.itab === t)); document.querySelectorAll('.import-pane').forEach(p => p.classList.toggle('active', p.id === 'ipane-' + t)); }
function updateFilterOptions() { const allNames = getAllActiveNames(); const cats = getCategories(); const setOpts = (id, items) => { const el = document.getElementById(id); const cur = el.value; el.innerHTML = '<option value="">All</option>' + items.map(i => `<option ${i===cur?'selected':''} value="${i}">${i}</option>`).join(''); }; setOpts('f-paid-by', allNames); setOpts('f-paid-to', allNames); setOpts('f-cat', cats); }

document.addEventListener('DOMContentLoaded', () => {
    switchTab('dashboard'); updateDataLists();
    document.querySelectorAll('.nav-item').forEach(el => el.onclick = () => switchTab(el.dataset.tab));
    ['f-search','f-date','f-paid-by','f-paid-to','f-cat'].forEach(id => { document.getElementById(id).oninput = renderTransactions; document.getElementById(id).onchange = renderTransactions; });
});
