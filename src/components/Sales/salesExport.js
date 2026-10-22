export function dateText(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dayKey(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

const headings = [
  "Receipt",
  "Sale date (Sri Lanka)",
  "Customer",
  "Phone",
  "Cashier",
  "Payment",
  "Subtotal LKR",
  "Discount LKR",
  "Total LKR",
  "Status",
  "Edited on (Sri Lanka)",
  "Edited by",
  "Deleted on (Sri Lanka)",
];

function rowsFor(sales) {
  return sales.map((sale) => [
    sale.number,
    dateText(sale.completedAt),
    sale.customerName || "Walk-in customer",
    sale.customerPhone || "",
    sale.cashierName,
    sale.paymentMethod,
    Number(sale.subtotal),
    Number(sale.discount),
    Number(sale.total),
    sale.displayStatus,
    dateText(sale.editedAt),
    sale.editedBy || "",
    dateText(sale.deletedAt),
  ]);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  let text = String(value ?? "");

  // Prevent spreadsheet applications from evaluating text as formulas.
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportSales(format, sales) {
  const filename = `genzi-sales-${dayKey(new Date())}`;
  const rows = rowsFor(sales);

  if (format === "csv") {
    const csv = [headings, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    download(
      new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;",
      }),
      `${filename}.csv`
    );

    return;
  }

  if (format === "xlsx") {
    const imported = await import("exceljs");
    const ExcelJS = imported.default || imported;
    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Gen Zi Corner";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Sales");

    sheet.addRow(headings);
    sheet.addRows(rows);

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    sheet.columns.forEach((column, index) => {
      column.width = [0, 1, 10, 12].includes(index) ? 24 : 19;
    });

    [7, 8, 9].forEach((column) => {
      sheet.getColumn(column).numFmt = '#,##0.00';
    });

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, rows.length + 1), column: headings.length },
    };

    const buffer = await workbook.xlsx.writeBuffer();

    download(
      new Blob([buffer], {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${filename}.xlsx`
    );

    return;
  }

  if (format === "pdf") {
    const [{ jsPDF }, { autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    pdf.setFontSize(16);
    pdf.text("Gen Zi Corner - Sales report", 14, 15);

    pdf.setFontSize(9);
    pdf.text(
      `Exported: ${dateText(new Date())} | Matching bills: ${sales.length}`,
      14,
      22
    );

    autoTable(pdf, {
      startY: 28,
      head: [[
        "Receipt",
        "Date",
        "Customer",
        "Payment",
        "Total LKR",
        "Status",
        "Edited on",
      ]],
      body: sales.map((sale) => [
        sale.number,
        dateText(sale.completedAt),
        sale.customerName || "Walk-in customer",
        sale.paymentMethod,
        Number(sale.total).toFixed(2),
        sale.displayStatus,
        dateText(sale.editedAt),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 3,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [109, 63, 218],
      },
      columnStyles: {
        4: { halign: "right" },
      },
    });

    pdf.save(`${filename}.pdf`);
    return;
  }

  throw new Error("Unknown export format.");
}