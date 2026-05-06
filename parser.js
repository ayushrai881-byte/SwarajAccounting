// ============================================================
// SWARAJ PAYMENTS TRACKER — PARSER MODULE (v2)
// paidBy = who paid / source of funds
// paidTo = who received / destination
// ============================================================

const PAYMENT_ALIASES = {
  'au': 'AU Bank', 'au bank': 'AU Bank',
  'ayush': 'Ayush', 'a': 'Ayush',
  'rahil': 'Rahil', 'rs': 'Rahil', 'rahil sagar': 'Rahil',
  'sbi cc': 'SBI CC', 'sbi': 'SBI CC',
  'cash': 'Cash',
};

const CATEGORY_MAP = {
  'Fuel':        ['petrol', 'diesel', 'fuel', 'pump', 'cng'],
  'Salary':      ['sal ', 'salary', 'advance', 'jaswant', 'wages', 'worker'],
  'Travel':      ['bus', 'train', 'travel', 'prayagraj', 'ticket', 'cab', 'flight', 'uber', 'ola'],
  'Petty Cash':  ['cash addon', 'tea', 'manager', 'daily', 'petty'],
  'Sales':       ['sold', 'sell', 'sale', 'part sold', 'rajkumar'],
  'Refund':      ['refund', 'return', 'lalsahab', 'raj dangi', 'wapas'],
  'Showroom':    ['showroom', 'baleno', 'vehicle'],
  'Food':        ['food', 'restaurant', 'lunch', 'dinner', 'breakfast', 'chai'],
  'Maintenance': ['repair', 'service', 'maintenance', 'spare'],
  'Utilities':   ['electricity', 'water', 'bill', 'internet', 'recharge'],
  'Office':      ['office', 'stationery', 'printing', 'rent'],
};

function generateId() {
  return 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function normalizeMethod(raw) {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  for (const [key, val] of Object.entries(PAYMENT_ALIASES)) {
    if (lower === key) return val;
  }
  // Check custom methods in localStorage
  try {
    const custom = JSON.parse(localStorage.getItem('sp_payment_methods') || '[]');
    for (const m of custom) {
      if (lower === m.toLowerCase()) return m;
    }
  } catch(e) {}
  return raw.charAt(0).toUpperCase() + raw.slice(1).trim();
}

function detectCategory(desc) {
  const lower = (desc || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return 'Miscellaneous';
}

function parseIsoDate(dateStr) {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return dateStr;
  const day   = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year  = parts[2].length === 2 ? '20' + parts[2] : parts[2];
  return `${year}-${month}-${day}`;
}

function parseMessageBlock(sender, dateStr, timeStr, lines) {
  if (!lines.length) return null;

  let fullText = lines.join(' ');
  
  // Find "By X" or "To X" tags
  // Support both "By X" on a new line and "... By X" at the end of a line
  let byRaw = null, toRaw = null;
  
  const byMatch = fullText.match(/\s*(?:\.\.\.\s*)?By\s+([^\.]+)(?:\.\.\.|$)/i);
  const toMatch = fullText.match(/\s*(?:\.\.\.\s*)?To\s+([^\.]+)(?:\.\.\.|$)/i);
  
  if (byMatch) { byRaw = byMatch[1].trim(); fullText = fullText.replace(byMatch[0], ' '); }
  if (toMatch) { toRaw = toMatch[1].trim(); fullText = fullText.replace(toMatch[0], ' '); }
  
  if (!byRaw && !toRaw) return null;

  // Clean up fullText from extra dots and spaces
  fullText = fullText.replace(/\s*\.\.\.\s*/g, ' ').replace(/\s+/g, ' ').trim();

  // Parse amount and description
  let amount = null, description = '';
  
  // Try to match amount at the start
  const amountMatch = fullText.match(/^([\d,]+)\s*(.*)/);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    description = amountMatch[2].trim();
  }

  if (!amount || isNaN(amount) || amount <= 0) return null;
  description = description.replace(/^[\s-:,.!]+|[\s-:,.!]+$/g, '') || 'No description';

  return {
    id: generateId(),
    date: parseIsoDate(dateStr),
    time: timeStr.trim(),
    amount,
    description,
    paidBy: byRaw ? normalizeMethod(byRaw) : '',
    paidTo: toRaw ? normalizeMethod(toRaw) : '',
    category: detectCategory(description),
    source: 'whatsapp',
  };
}

// Main WhatsApp parser
// Format: [HH:MM am/pm, DD/M/YYYY] Sender: first line of message
function parseWhatsAppText(rawText) {
  const results = [];
  const lines = rawText.split('\n');
  const headerRe = /^\[(\d{1,2}:\d{2}\s*(?:am|pm)),\s*(\d{1,2}\/\d{1,2}\/\d{4})\]\s*([^:]+):\s*(.*)$/i;
  let current = null;

  const flush = () => {
    if (current) {
      const tx = parseMessageBlock(current.sender, current.date, current.time, current.lines.filter(l => l));
      if (tx) results.push(tx);
    }
  };

  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      flush();
      current = { time: m[1], date: m[2], sender: m[3], lines: [m[4].trim()] };
    } else if (current) {
      current.lines.push(line.trim());
    }
  }
  flush();
  return results;
}

// CSV parser (expects: date, amount, description, paidby, paidto, category)
function parseCSV(text) {
  const results = [];
  const rows = text.trim().split('\n');
  if (rows.length < 2) return results;
  const headers = rows[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(',').map(c => c.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, idx) => row[h] = cols[idx] || '');
    const amount = parseFloat(row.amount);
    if (!amount || isNaN(amount)) continue;
    results.push({
      id: generateId(),
      date: row.date || new Date().toISOString().slice(0, 10),
      time: row.time || '',
      amount,
      description: row.description || '',
      paidBy: normalizeMethod(row.paidby || row['paid by'] || ''),
      paidTo: normalizeMethod(row.paidto || row['paid to'] || ''),
      category: row.category || detectCategory(row.description || ''),
      source: 'csv',
    });
  }
  return results;
}

window.SP_Parser = { parseWhatsAppText, parseCSV, detectCategory, normalizeMethod, generateId };
