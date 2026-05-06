// ============================================================
// SWARAJ PAYMENTS TRACKER — EXPORT MODULE
// ============================================================

function formatCurrency(n) {
  return '₹' + parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

// ── EXCEL EXPORT ──────────────────────────────────────────────
function exportToExcel(transactions, filename = 'Swaraj_Payments') {
  const XLSX = window.XLSX;

  // Sheet 1: Transactions
  const txHeaders = ['Date','Time','Reported By','Amount (₹)','Description','Payment Method','Category','Type','Direction'];
  const txRows = transactions.map(t => [
    t.date, t.time, t.reportedBy, t.amount, t.description,
    t.paymentMethod, t.category, t.type, t.direction
  ]);

  // Sheet 2: Summary by Payment Method
  const methodTotals = {};
  for (const t of transactions) {
    if (!methodTotals[t.paymentMethod]) methodTotals[t.paymentMethod] = { expense: 0, income: 0 };
    if (t.direction === 'expense') methodTotals[t.paymentMethod].expense += t.amount;
    else methodTotals[t.paymentMethod].income += t.amount;
  }
  const summaryRows = [['Payment Method','Total Expense (₹)','Total Income (₹)','Net (₹)']];
  for (const [m, vals] of Object.entries(methodTotals)) {
    summaryRows.push([m, vals.expense, vals.income, vals.income - vals.expense]);
  }

  // Sheet 3: Summary by Category
  const catTotals = {};
  for (const t of transactions) {
    if (!catTotals[t.category]) catTotals[t.category] = 0;
    catTotals[t.category] += t.amount;
  }
  const catRows = [['Category','Total (₹)']];
  for (const [c, total] of Object.entries(catTotals)) catRows.push([c, total]);

  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]);
  ws1['!cols'] = [10,8,15,12,30,15,15,10,10].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Transactions');

  const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws2['!cols'] = [20,18,18,15].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, 'By Payment Method');

  const ws3 = XLSX.utils.aoa_to_sheet(catRows);
  ws3['!cols'] = [20,15].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws3, 'By Category');

  const dateStr = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `${filename}_${dateStr}.xlsx`);
}

// ── PDF EXPORT ───────────────────────────────────────────────
function exportToPDF(transactions, settlement, filename = 'Swaraj_Payments') {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const dateStr = new Date().toLocaleDateString('en-IN');
  const totalExpense = transactions.filter(t => t.direction === 'expense').reduce((s,t) => s+t.amount, 0);
  const totalIncome = transactions.filter(t => t.direction === 'income').reduce((s,t) => s+t.amount, 0);

  // Header
  doc.setFillColor(10, 14, 26);
  doc.rect(0, 0, 297, 30, 'F');
  doc.setTextColor(16, 185, 129);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('SWARAJ PAYMENTS', 14, 14);
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text('Financial Report', 14, 21);
  doc.text(`Generated: ${dateStr}`, 230, 14);
  doc.text(`${transactions.length} transactions`, 230, 21);

  // Summary cards
  doc.setTextColor(0,0,0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const cards = [
    ['Total Expense', formatCurrency(totalExpense), [239,68,68]],
    ['Total Income', formatCurrency(totalIncome), [16,185,129]],
    ['Net Balance', formatCurrency(totalIncome - totalExpense), totalIncome >= totalExpense ? [16,185,129] : [239,68,68]],
  ];
  cards.forEach(([label, val, color], i) => {
    const x = 14 + i * 92;
    doc.setFillColor(245,245,245);
    doc.roundedRect(x, 34, 85, 18, 2, 2, 'F');
    doc.setTextColor(80,80,80);
    doc.setFontSize(9);
    doc.text(label, x+4, 42);
    doc.setTextColor(...color);
    doc.setFontSize(13);
    doc.text(val, x+4, 50);
  });

  // Settlement
  if (settlement && settlement.length) {
    doc.setTextColor(0,0,0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Settlement Summary', 14, 62);
    settlement.forEach((s, i) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`• ${s}`, 14, 68 + i * 6);
    });
  }

  // Transactions table
  doc.autoTable({
    startY: settlement && settlement.length ? 68 + settlement.length * 6 + 4 : 62,
    head: [['Date','Reported By','Amount','Description','Method','Category','Type']],
    body: transactions.map(t => [
      t.date, t.reportedBy, formatCurrency(t.amount),
      t.description.length > 35 ? t.description.slice(0,33)+'…' : t.description,
      t.paymentMethod, t.category, t.type
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [16,185,129], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245,248,245] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        data.cell.styles.textColor = data.cell.raw === 'Income' ? [16,185,129] : [239,68,68];
      }
    }
  });

  const dateFileStr = new Date().toISOString().slice(0,10);
  doc.save(`${filename}_${dateFileStr}.pdf`);
}

window.SP_Export = { exportToExcel, exportToPDF };
