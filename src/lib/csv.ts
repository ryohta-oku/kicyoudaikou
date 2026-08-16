/**
 * 仕訳CSVの書き出し。
 *
 * **狙いは「出したあとに手を入れなくてよいこと」。**
 * 以前は3形式とも9列の独自の並びで、名前だけ「弥生会計形式」だった。
 * 実際の弥生は25列、マネーフォワードは27列、freee は先頭に `[表題行]` が要る。
 * そのままでは3社とも取り込めない。ここを各社の公式仕様に合わせる。
 *
 * 仕様の出典:
 * - 弥生会計: 仕訳データのインポート形式（support.yayoi-kk.co.jp page_id=18545）25列
 * - マネーフォワード: 「仕訳帳」をインポートする（biz.moneyforward.com .../import-books/ib01.html）27列
 * - freee: その他の会計ソフトから仕訳データを移行する（support.freee.co.jp .../204847430）
 *
 * 前提は**税込経理・本則課税**。金額は税込のまま出し、消費税額は会計ソフトに
 * 計算させる（3社とも税込経理なら税額欄は空か0でよい）。
 */

import iconv from "iconv-lite";
import {
  COUNTER_TAX_CATEGORY,
  isTaxable,
  mfInvoiceValue,
  normalizeTaxCategory,
  taxClassName,
  yayoiTaxClassWithInvoice,
  type CsvFormat,
  type EntrySide,
  type InvoiceKind,
  type TaxCategory,
} from "./tax-class";

export type { CsvFormat };

export interface JournalEntryForExport {
  date: string;
  description: string;
  accountCode: string;
  accountName: string;
  subAccountCode: string;
  subAccountName: string;
  debitAmount: number;
  creditAmount: number;
  taxRate: string;
  /** 相手科目。空なら得意先の既定値を使う */
  creditAccountCode?: string;
  creditAccountName?: string;
  /**
   * この仕訳の元の領収書に適格請求書発行事業者の登録番号があったか。
   * `false` は「人が確認して、無かった」。`null` は分からない（＝ありとして扱わない）。
   */
  hasRegistrationNumber?: boolean | null;
}

/** 得意先ごとの出力設定 */
export interface ExportSettings {
  /** 相手科目（貸方）の既定値。3社とも必須項目なので空にはできない */
  defaultCounterAccountCode: string;
  defaultCounterAccountName: string;
  /** 登録番号が無い領収書に付けるインボイス区分 */
  nonQualifiedInvoiceKind: InvoiceKind;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  defaultCounterAccountCode: "1111",
  defaultCounterAccountName: "現金",
  nonQualifiedInvoiceKind: "80%控除",
};

// === 共通の下ごしらえ ===

/** 1行の仕訳を、借方・貸方の対に開いたもの */
interface Balanced {
  /** YYYY/MM/DD。3社ともこの形を受ける */
  date: string;
  amount: number;
  description: string;
  debit: Leg;
  credit: Leg;
  /** 課税仕入の側に付けるインボイス区分。課税仕入が無ければ null */
  invoice: InvoiceKind | null;
}

interface Leg {
  accountCode: string;
  accountName: string;
  subAccountCode: string;
  subAccountName: string;
  taxCategory: TaxCategory;
  side: EntrySide;
}

/** "2026-04-03" → "2026/04/03"。既にスラッシュならそのまま */
function toSlashDate(raw: string): string {
  const text = String(raw || "").trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return text;
  return `${match[1]}/${match[2].padStart(2, "0")}/${match[3].padStart(2, "0")}`;
}

/**
 * 仕訳を借方・貸方の対にする。
 *
 * いまの仕訳は片側（費用なら借方）しか持っていない。3社とも反対側の
 * 勘定科目が必須なので、ここで相手科目を補う。
 */
function balance(
  entry: JournalEntryForExport,
  settings: ExportSettings
): Balanced {
  const isDebitSide = entry.creditAmount > 0 ? false : true;
  const amount = isDebitSide ? entry.debitAmount : entry.creditAmount;
  const category = normalizeTaxCategory(entry.taxRate);

  const own: Leg = {
    accountCode: entry.accountCode,
    accountName: entry.accountName,
    subAccountCode: entry.subAccountCode,
    subAccountName: entry.subAccountName,
    taxCategory: category,
    // 借方に立つのが費用＝仕入側、貸方に立つのが収益＝売上側
    side: isDebitSide ? "purchase" : "sale",
  };

  const counter: Leg = {
    accountCode: entry.creditAccountCode || settings.defaultCounterAccountCode,
    accountName: entry.creditAccountName || settings.defaultCounterAccountName,
    subAccountCode: "",
    subAccountName: "",
    taxCategory: COUNTER_TAX_CATEGORY,
    side: isDebitSide ? "sale" : "purchase",
  };

  // 登録番号があれば適格、無ければ得意先の設定値。
  // 課税仕入でなければインボイスの区分そのものが要らない
  const invoice: InvoiceKind | null =
    isTaxable(category) && own.side === "purchase"
      ? entry.hasRegistrationNumber === true
        ? "適格"
        : settings.nonQualifiedInvoiceKind
      : null;

  return {
    date: toSlashDate(entry.date),
    amount,
    description: entry.description,
    debit: isDebitSide ? own : counter,
    credit: isDebitSide ? counter : own,
    invoice,
  };
}

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function toCSVRow(fields: string[]): string {
  return fields.map(escapeCSVField).join(",");
}

// === 弥生会計（25列・ヘッダー行なし） ===

/**
 * 弥生会計。**ヘッダー行を付けない。** 1列目の識別フラグが行の種類を表すため、
 * ラベル行があると1件目が壊れる。
 *
 * 固定値は freee が弥生形式で書き出すときと同じ置き方にしている
 * （識別フラグ2000＝伝票以外、タイプ0＝仕訳、付箋0＝なし、調整no）。
 */
export function generateYayoiCSV(
  entries: JournalEntryForExport[],
  settings: ExportSettings
): string {
  const rows: string[] = [];

  for (const entry of entries) {
    const b = balance(entry, settings);
    const amount = String(b.amount);
    rows.push(
      toCSVRow([
        "2000", // 1 識別フラグ（伝票以外の通常の仕訳）
        "", // 2 伝票No.
        "", // 3 決算（空＝通常）
        b.date, // 4 取引日付
        b.debit.accountName, // 5 借方勘定科目
        b.debit.subAccountName, // 6 借方補助科目
        "", // 7 借方部門
        yayoiTaxClassWithInvoice(b.debit.taxCategory, b.debit.side, b.invoice), // 8 借方税区分
        amount, // 9 借方金額（税込）
        "", // 10 借方税金額（税込経理なので弥生が計算する）
        b.credit.accountName, // 11 貸方勘定科目
        b.credit.subAccountName, // 12 貸方補助科目
        "", // 13 貸方部門
        yayoiTaxClassWithInvoice(b.credit.taxCategory, b.credit.side, b.invoice), // 14 貸方税区分
        amount, // 15 貸方金額（税込）
        "", // 16 貸方税金額
        b.description, // 17 摘要
        "", // 18 番号
        "", // 19 期日
        "0", // 20 タイプ（0＝仕訳）
        "", // 21 生成元
        "", // 22 仕訳メモ
        "0", // 23 付箋1
        "0", // 24 付箋2
        "no", // 25 調整
      ])
    );
  }

  return rows.join("\r\n") + (rows.length > 0 ? "\r\n" : "");
}

// === マネーフォワード クラウド会計（27列 A〜AA・ヘッダー行あり） ===

const MF_HEADERS = [
  "取引No",
  "取引日",
  "借方勘定科目",
  "借方補助科目",
  "借方部門",
  "借方取引先",
  "借方税区分",
  "借方インボイス",
  "借方金額(円)",
  "借方税額",
  "貸方勘定科目",
  "貸方補助科目",
  "貸方部門",
  "貸方取引先",
  "貸方税区分",
  "貸方インボイス",
  "貸方金額(円)",
  "貸方税額",
  "摘要",
  "仕訳メモ",
  "タグ",
  "MF仕訳タイプ",
  "決算整理仕訳",
  "作成日時",
  "作成者",
  "最終更新日時",
  "最終更新者",
];

/**
 * マネーフォワード クラウド会計。
 *
 * 1行目のラベル行は必須（「編集せずに使用してください」）。
 * 税額欄は「0を入力するか空欄」と明記されているので0を入れる。
 * インボイスは独立した列で、**空欄だと「適格」とみなされる**ため、
 * 登録番号が無い領収書には必ず値を入れる。
 */
export function generateMoneyForwardCSV(
  entries: JournalEntryForExport[],
  settings: ExportSettings
): string {
  const rows = [toCSVRow(MF_HEADERS)];

  entries.forEach((entry, index) => {
    const b = balance(entry, settings);
    const amount = String(b.amount);
    rows.push(
      toCSVRow([
        String(index + 1), // A 取引No（9桁以内・単一仕訳なので通し番号）
        b.date, // B 取引日
        b.debit.accountName, // C 借方勘定科目
        b.debit.subAccountName, // D 借方補助科目
        "", // E 借方部門
        "", // F 借方取引先
        taxClassName(b.debit.taxCategory, b.debit.side, "mf"), // G 借方税区分
        mfInvoiceValue(b.debit.taxCategory, b.debit.side, b.invoice), // H 借方インボイス
        amount, // I 借方金額(円)
        "0", // J 借方税額
        b.credit.accountName, // K 貸方勘定科目
        b.credit.subAccountName, // L 貸方補助科目
        "", // M 貸方部門
        "", // N 貸方取引先
        taxClassName(b.credit.taxCategory, b.credit.side, "mf"), // O 貸方税区分
        mfInvoiceValue(b.credit.taxCategory, b.credit.side, b.invoice), // P 貸方インボイス
        amount, // Q 貸方金額(円)
        "0", // R 貸方税額
        b.description, // S 摘要
        "", // T 仕訳メモ
        "", // U タグ
        "", // V MF仕訳タイプ
        "", // W 決算整理仕訳
        "", // X 作成日時（インポートでは使われない）
        "", // Y 作成者
        "", // Z 最終更新日時
        "", // AA 最終更新者
      ])
    );
  });

  return "﻿" + rows.join("\r\n") + "\r\n";
}

// === freee（他社会計ソフトインポート形式） ===

const FREEE_HEADERS = [
  "[表題行]",
  "日付",
  "伝票番号",
  "借方勘定科目",
  "借方科目コード",
  "借方補助科目",
  "借方取引先",
  "借方金額",
  "借方税区分",
  "貸方勘定科目",
  "貸方科目コード",
  "貸方補助科目",
  "貸方取引先",
  "貸方金額",
  "貸方税区分",
  "摘要",
];

/**
 * freee 会計（［振替伝票］→［インポート］→［他社会計ソフトインポート］）。
 *
 * **1列目に `[表題行]` / `[明細行]` を入れるのが必須。** これが無いと弾かれる。
 * 伝票番号も必須で、同じ番号の行は1つの仕訳としてまとめられるため、
 * 1仕訳につき別々の番号を振る。
 *
 * 税額の列は**わざと出さない**。公式に「借方税額の列がない場合でも取り込みが可能。
 * その際『全ての金額が内税(税込) ※税額自動計算あり』を選ぶと税額が自動計算される」
 * とあり、税込経理ではこれがいちばん事故が少ない。
 *
 * 補助科目は freee に無い概念なので、店名は**取引先**として渡す
 * （未登録の取引先はインポート時に自動で登録される）。
 */
export function generateFreeeCSV(
  entries: JournalEntryForExport[],
  settings: ExportSettings
): string {
  const rows = [toCSVRow(FREEE_HEADERS)];

  entries.forEach((entry, index) => {
    const b = balance(entry, settings);
    const amount = String(b.amount);
    rows.push(
      toCSVRow([
        "[明細行]",
        b.date,
        String(index + 1), // 伝票番号（1仕訳＝1番号）
        b.debit.accountName,
        b.debit.accountCode,
        "", // 借方補助科目（freee には無いので取引先に寄せる）
        b.debit.subAccountName, // 借方取引先
        amount,
        taxClassName(b.debit.taxCategory, b.debit.side, "freee"),
        b.credit.accountName,
        b.credit.accountCode,
        "",
        b.credit.subAccountName,
        amount,
        taxClassName(b.credit.taxCategory, b.credit.side, "freee"),
        b.description,
      ])
    );
  });

  return "﻿" + rows.join("\r\n") + "\r\n";
}

// === 汎用形式（社内で中身を見るため） ===

const GENERIC_HEADERS = [
  "取引日",
  "借方勘定科目コード",
  "借方勘定科目",
  "借方補助科目",
  "借方税区分",
  "借方金額",
  "貸方勘定科目コード",
  "貸方勘定科目",
  "貸方補助科目",
  "貸方税区分",
  "貸方金額",
  "摘要",
  "インボイス",
];

export function generateGenericCSV(
  entries: JournalEntryForExport[],
  settings: ExportSettings
): string {
  const rows = [toCSVRow(GENERIC_HEADERS)];

  for (const entry of entries) {
    const b = balance(entry, settings);
    const amount = String(b.amount);
    rows.push(
      toCSVRow([
        b.date,
        b.debit.accountCode,
        b.debit.accountName,
        b.debit.subAccountName,
        taxClassName(b.debit.taxCategory, b.debit.side, "generic"),
        amount,
        b.credit.accountCode,
        b.credit.accountName,
        b.credit.subAccountName,
        taxClassName(b.credit.taxCategory, b.credit.side, "generic"),
        amount,
        b.description,
        b.invoice ?? "",
      ])
    );
  }

  return "﻿" + rows.join("\r\n") + "\r\n";
}

// === 入口 ===

/**
 * 書き出した結果。**文字コードとファイル名が形式ごとに違う。**
 *
 * 弥生会計はWindowsのソフトで、取り込むテキストはShift_JIS。UTF-8のまま渡すと
 * 勘定科目が文字化けして、結局手で直すことになる。
 */
export interface GeneratedFile {
  /** そのまま返せるバイト列 */
  data: Buffer;
  filename: string;
  contentType: string;
}

export const CSV_FORMAT_LABELS: Record<CsvFormat, string> = {
  generic: "汎用形式",
  yayoi: "弥生会計",
  mf: "マネーフォワード クラウド会計",
  freee: "freee会計",
};

export function generateCSV(
  entries: JournalEntryForExport[],
  format: CsvFormat,
  settings: ExportSettings = DEFAULT_EXPORT_SETTINGS
): string {
  switch (format) {
    case "yayoi":
      return generateYayoiCSV(entries, settings);
    case "mf":
      return generateMoneyForwardCSV(entries, settings);
    case "freee":
      return generateFreeeCSV(entries, settings);
    default:
      return generateGenericCSV(entries, settings);
  }
}

export function generateExportFile(
  entries: JournalEntryForExport[],
  format: CsvFormat,
  settings: ExportSettings = DEFAULT_EXPORT_SETTINGS,
  baseName = "journal_entries"
): GeneratedFile {
  const text = generateCSV(entries, format, settings);

  if (format === "yayoi") {
    // 弥生会計の仕訳データは Shift_JIS のテキスト（拡張子 .txt）が既定
    return {
      data: iconv.encode(text, "Shift_JIS"),
      filename: `${baseName}_yayoi.txt`,
      contentType: "text/plain; charset=Shift_JIS",
    };
  }

  return {
    data: Buffer.from(text, "utf-8"),
    filename: `${baseName}_${format}.csv`,
    contentType: "text/csv; charset=utf-8",
  };
}
