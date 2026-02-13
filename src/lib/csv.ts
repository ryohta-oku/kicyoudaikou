interface JournalEntryForExport {
  date: string;
  description: string;
  accountCode: string;
  accountName: string;
  subAccountCode: string;
  subAccountName: string;
  debitAmount: number;
  creditAmount: number;
  taxRate: string;
}

// 弥生会計形式のCSVヘッダー
const YAYOI_HEADERS = [
  "取引日",
  "借方勘定科目",
  "借方補助科目",
  "借方金額",
  "貸方勘定科目",
  "貸方補助科目",
  "貸方金額",
  "摘要",
  "税区分",
];

// freee形式のCSVヘッダー
const FREEE_HEADERS = [
  "取引日",
  "勘定科目",
  "税区分",
  "金額",
  "取引先",
  "品目",
  "メモタグ",
  "備考",
  "収支区分",
];

// 汎用形式のCSVヘッダー
const GENERIC_HEADERS = [
  "日付",
  "勘定科目コード",
  "勘定科目名",
  "補助科目コード",
  "補助科目名",
  "借方金額",
  "貸方金額",
  "摘要",
  "税率区分",
];

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function toCSVRow(fields: string[]): string {
  return fields.map(escapeCSVField).join(",");
}

export function generateGenericCSV(entries: JournalEntryForExport[]): string {
  const rows = [toCSVRow(GENERIC_HEADERS)];

  for (const entry of entries) {
    rows.push(
      toCSVRow([
        entry.date,
        entry.accountCode,
        entry.accountName,
        entry.subAccountCode,
        entry.subAccountName,
        String(entry.debitAmount),
        String(entry.creditAmount),
        entry.description,
        entry.taxRate,
      ])
    );
  }

  return "\uFEFF" + rows.join("\n"); // BOM付きUTF-8
}

export function generateYayoiCSV(entries: JournalEntryForExport[]): string {
  const rows = [toCSVRow(YAYOI_HEADERS)];

  for (const entry of entries) {
    const isDebit = entry.debitAmount > 0;
    rows.push(
      toCSVRow([
        entry.date,
        isDebit ? entry.accountName : "",
        isDebit ? entry.subAccountName : "",
        isDebit ? String(entry.debitAmount) : "",
        !isDebit ? entry.accountName : "",
        !isDebit ? entry.subAccountName : "",
        !isDebit ? String(entry.creditAmount) : "",
        entry.description,
        entry.taxRate,
      ])
    );
  }

  return "\uFEFF" + rows.join("\n");
}

export function generateFreeeCSV(entries: JournalEntryForExport[]): string {
  const rows = [toCSVRow(FREEE_HEADERS)];

  for (const entry of entries) {
    const amount = entry.debitAmount > 0 ? entry.debitAmount : entry.creditAmount;
    const isExpense = entry.debitAmount > 0;
    rows.push(
      toCSVRow([
        entry.date,
        entry.accountName,
        entry.taxRate,
        String(amount),
        "",
        "",
        "",
        entry.description,
        isExpense ? "支出" : "収入",
      ])
    );
  }

  return "\uFEFF" + rows.join("\n");
}

export type CSVFormat = "generic" | "yayoi" | "freee";

export function generateCSV(
  entries: JournalEntryForExport[],
  format: CSVFormat
): string {
  switch (format) {
    case "yayoi":
      return generateYayoiCSV(entries);
    case "freee":
      return generateFreeeCSV(entries);
    default:
      return generateGenericCSV(entries);
  }
}
