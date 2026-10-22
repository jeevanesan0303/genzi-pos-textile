export const money = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

export function localDay(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const get = (type) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function dateText(value) {
  if (!value) return "—";

  // DATE values represent calendar dates, without timezone conversion.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-");
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCell(value, type) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (type === "money") return money(value);

  if (["date", "datetime", "timestamp"].includes(type)) {
    return dateText(value);
  }

  if (type === "number") {
    return new Intl.NumberFormat("en-LK").format(Number(value));
  }

  return String(value);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = name;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportValue(value, type) {
  if (value === null || value === undefined) return "";

  if (["money", "number"].includes(type)) {
    return Number(value);
  }

  if (["date", "datetime", "timestamp"].includes(type)) {
    return dateText(value);
  }

  return String(value);
}

function csvCell(value) {
  let text = String(value ?? "");

  // Prevent spreadsheet formula execution in text fields.
  if (
    typeof value === "string" &&
    (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
  ) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportReport(format, report, rows, search = "") {
  const filename =
    `genzi-${report.type}-report-${localDay()}`;

  const headers = report.columns.map((column) =>
    column.type === "money"
      ? `${column.label} (LKR)`
      : column.label
  );

  const values = rows.map((row) =>
    report.columns.map((column) =>
      exportValue(row[column.key], column.type)
    )
  );

  const period =
    !report.from && !report.to
      ? "All time"
      : `${report.from || "Beginning"} to ${report.to || "Present"}`;

  if (format === "csv") {
    const content = [headers, ...values]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    download(
      new Blob(["\uFEFF", content], {
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

    const sheet = workbook.addWorksheet("Report");

    sheet.addRow(headers);
    sheet.addRows(values);

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).height = 28;
    sheet.getRow(1).alignment = {
      vertical: "middle",
      wrapText: true,
    };

    sheet.views = [{ state: "frozen", ySplit: 1 }];

    report.columns.forEach((column, index) => {
      const excelColumn = sheet.getColumn(index + 1);

      excelColumn.width =
        column.key === "address" ? 40 :
        column.key === "name" || column.key === "description" ? 30 :
        22;

      if (column.type === "money") {
        excelColumn.numFmt = "#,##0.00";
      }

      if (column.type === "number") {
        excelColumn.numFmt = "#,##0";
      }
    });

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: {
        row: values.length + 1,
        column: headers.length,
      },
    };

    const info = workbook.addWorksheet("Report details");

    info.addRows([
      ["Report", report.title],
      ["Selected period", period],
      ["Search", search],
      ["Matching rows", rows.length],
      ["Generated", dateText(report.generatedAt)],
      ["Scope", report.note],
    ]);

    info.getColumn(1).width = 22;
    info.getColumn(2).width = 100;
    info.getColumn(2).alignment = { wrapText: true };

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
    pdf.text(`Gen Zi Corner - ${report.title}`, 14, 15);

    pdf.setFontSize(9);
    pdf.text(`Selected period: ${period}`, 14, 22);
    pdf.text(
      `Matching rows: ${rows.length} | Generated: ${dateText(report.generatedAt)}`,
      14,
      28
    );

    const note = pdf.splitTextToSize(report.note, 265);
    pdf.text(note, 14, 35);

    autoTable(pdf, {
      startY: 38 + note.length * 4,
      head: [headers],
      body: values.map((row) =>
        row.map((value, index) =>
          report.columns[index].type === "money"
            ? Number(value).toFixed(2)
            : String(value)
        )
      ),
      styles: {
        fontSize: 7,
        cellPadding: 2.5,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [108, 62, 215],
      },
      margin: { left: 10, right: 10 },
    });

    pdf.save(`${filename}.pdf`);
    return;
  }

  throw new Error("Unsupported export format.");
}