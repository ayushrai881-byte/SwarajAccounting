// ============================================================
// SWARAJ PAYMENTS — EXPORT ENGINE (Fixed for Paid By/To)
// ============================================================

function doExportExcel() {
  const txs = getTransactions(); // Uses function from app.js
  if (txs.length === 0) return alert("No data to export!");

  // Prepare data specifically with your new column names
  const data = txs.map(t => ({
    Date: t.date,
    Amount: t.amount,
    "Paid By": t.paidBy,
    "Paid To": t.paidTo,
    Description: t.description,
    Category: t.category
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
  
  XLSX.writeFile(workbook, `Swaraj_Ledger_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function doExportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const txs = getTransactions();
  if (txs.length === 0) return alert("No data to export!");

  doc.setFontSize(18);
  doc.text("Swaraj Payments — Financial Report", 14, 20);
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

  const head = [['Date', 'Amount', 'Paid By', 'Paid To', 'Description', 'Category']];
  const body = txs.map(t => [
    t.date,
    `Rs. ${t.amount}`,
    t.paidBy,
    t.paidTo,
    t.description,
    t.category
  ]);

  doc.autoTable({
    startY: 35,
    head: head,
    body: body,
    theme: 'grid',
    headStyles: { fillColor: [99, 102, 241] }, // Matches your Indigo accent
    styles: { fontSize: 8 }
  });

  doc.save(`Swaraj_Report_${new Date().toISOString().slice(0,10)}.pdf`);
}
