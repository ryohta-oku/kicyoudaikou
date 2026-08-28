/**
 * OCR結果の型・スキーマ・正規化。
 *
 * 「値なし」は必ず空文字（null や undefined は使わない）。
 * OpenAI の strict json_schema は全プロパティを required にする必要があり、
 * 全項目 string・全項目 required が Gemini と OpenAI の双方で差異なく扱える唯一の形。
 */

import { extractReceiptNumber } from "@/lib/receipt-number";

/**
 * 税率ごとの内訳。
 *
 * コンビニの領収書のように、**1枚に軽減税率8%と標準税率10%が混ざる**ことがある。
 * 内訳を持たないと全額が片方の税率で記帳され、消費税額が合わなくなる
 * （例: 税込1,302円・消費税112円の領収書を全額10%とすると118円になる）。
 */
export interface TaxLine {
  /** "10" / "8" / "0"（非課税・不課税） */
  rate: string;
  /** その税率の対象額（税込）、数字のみ */
  amount: string;
  /** その税率の消費税額、数字のみ */
  tax: string;
  /** その税率に該当する品目。勘定科目を分ける判断に使う */
  items: string;
}

export interface OcrFields {
  ocrText: string;
  date: string;
  registrationNumber: string;
  /** レシート番号（No. / 取引番号 / 伝票番号）。重複の判定にだけ使う */
  receiptNumber: string;
  /** 税込合計。taxLines がある場合はその合計と一致する */
  amount: string;
  /** 消費税の合計 */
  tax: string;
  /** 税率ごとの内訳。読み取れなければ空配列 */
  taxLines: TaxLine[];
  memo: string;
}

/** 適格請求書発行事業者の登録番号: T + 数字13桁（合計14文字） */
export const REGISTRATION_NUMBER_PATTERN = /T\d{13}/;

/**
 * 登録番号を正規化する。T+13桁に一致しなければ空文字。
 * この判定はアプリ全体でここ1箇所に集約すること。
 */
export function normalizeRegistrationNumber(raw: unknown): string {
  const match = String(raw ?? "").match(REGISTRATION_NUMBER_PATTERN);
  return match ? match[0] : "";
}

function toText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

/** 数字だけを取り出す（「¥1,302」→「1302」） */
function toNumberText(raw: unknown): string {
  const digits = toText(raw).replace(/[^\d]/g, "");
  return digits;
}

/**
 * 税率の内訳を正規化する。
 *
 * **信用できないものは捨てる。** 対象額が無い行、税率が読めない行は落とす。
 * 中途半端な内訳が残ると、それを元に仕訳が分かれて金額が合わなくなる。
 * 内訳が無ければ従来どおり1件の仕訳になるだけなので、落とすほうが安全。
 */
export function normalizeTaxLines(raw: unknown): TaxLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: TaxLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const rate = toNumberText(o.rate);
    const amount = toNumberText(o.amount);
    if (!amount || Number(amount) <= 0) continue;
    if (!["0", "8", "10"].includes(rate)) continue;
    lines.push({ rate, amount, tax: toNumberText(o.tax), items: toText(o.items) });
  }

  // 同じ税率が複数返ってきたらまとめる（AIが品目ごとに分けて返すことがある）
  const merged = new Map<string, TaxLine>();
  for (const line of lines) {
    const found = merged.get(line.rate);
    if (!found) {
      merged.set(line.rate, { ...line });
      continue;
    }
    found.amount = String(Number(found.amount) + Number(line.amount));
    found.tax = String(Number(found.tax || 0) + Number(line.tax || 0));
    found.items = [found.items, line.items].filter(Boolean).join("、");
  }

  // 1種類だけなら、わざわざ分ける意味が無い（従来どおりの1件で足りる）
  const result = [...merged.values()];
  return result.length >= 2 ? result : [];
}

/**
 * レシート番号を決める。**AIの答えより本文を優先はしないが、無ければ本文から拾う。**
 *
 * ここに置くのは、**読み取りのどの経路を通っても同じ結果になる**ようにするため
 * （初回OCR・全項目の再読み取り・旧形式の解釈が、それぞれ別々に拾うのを防ぐ）。
 * AIが `登録番号` を取り違えて返すことがあるので、その形なら捨てて拾い直す。
 */
function resolveReceiptNumber(raw: unknown, ocrText: string): string {
  const given = toText(raw).replace(/^[No.．:：#\s]+/i, "");
  if (given && !/^T\d{13}$/i.test(given) && /\d/.test(given)) return given;
  return extractReceiptNumber(ocrText);
}

/** 任意のオブジェクトを OcrFields に正規化する */
export function normalizeOcrFields(raw: Record<string, unknown>): OcrFields {
  const ocrText = toText(raw.ocrText ?? raw.ocr_text);
  return {
    ocrText,
    date: toText(raw.date),
    registrationNumber: normalizeRegistrationNumber(raw.registrationNumber),
    receiptNumber: resolveReceiptNumber(raw.receiptNumber, ocrText),
    amount: toText(raw.amount),
    tax: toText(raw.tax),
    taxLines: normalizeTaxLines(raw.taxLines ?? raw.tax_lines),
    memo: toText(raw.memo),
  };
}

export const EMPTY_OCR_FIELDS: OcrFields = {
  ocrText: "",
  date: "",
  registrationNumber: "",
  receiptNumber: "",
  amount: "",
  tax: "",
  taxLines: [],
  memo: "",
};

/**
 * 1書類の読み取り結果。
 *
 * 複数ページのPDF（領収書を束ねてスキャンした場合など）では pages が複数になる。
 * 1ページの書類では要素数1。
 */
export interface OcrDocumentResult {
  pages: OcrFields[];
}

/** 安全側の上限。これを超えるページは切り捨てる（AIの暴走・コスト暴発の防止） */
export const MAX_OCR_PAGES = 30;

/**
 * OCR出力のJSONスキーマ。
 * OpenAI の structured outputs にそのまま渡す（アダプタ側で additionalProperties: false を付与）。
 * Gemini 側は responseMimeType: "application/json" ＋ プロンプト記述で同じ形を出させる
 * （SDKごとのスキーマ方言差を避けるため responseSchema は使わない）。
 */
export const OCR_JSON_SCHEMA = {
  type: "object",
  properties: {
    pages: {
      type: "array",
      description:
        "書類のページごとの読み取り結果。1ページの書類なら要素数1、複数ページのPDFならページ数と同じ要素数",
      items: {
        type: "object",
        properties: {
          ocrText: {
            type: "string",
            description: "そのページのテキスト全文。レイアウトを維持すること",
          },
          date: {
            type: "string",
            description: "日付をYYYY-MM-DD形式で。見つからない場合は空文字",
          },
          registrationNumber: {
            type: "string",
            description:
              "適格請求書発行事業者の登録番号。T + 数字13桁（例: T1234567890123）。一致しない場合は空文字",
          },
          receiptNumber: {
            type: "string",
            description:
              "レシート番号・取引番号・伝票番号（例: No. 155693 → 155693）。" +
              "登録番号（T始まり）や電話番号は入れないこと。見つからない場合は空文字",
          },
          amount: {
            type: "string",
            description: "税込合計金額、数字のみ。見つからない場合は空文字",
          },
          tax: {
            type: "string",
            description: "消費税額、数字のみ。見つからない場合は空文字",
          },
          taxLines: {
            type: "array",
            description:
              "税率ごとの内訳。軽減税率8%と標準税率10%が混在する領収書で必要。" +
              "amount の合計は税込合計金額と一致させること。読み取れない場合は空配列",
            items: {
              type: "object",
              properties: {
                rate: { type: "string", description: "税率。10 / 8 / 0 のいずれか（数字のみ）" },
                amount: { type: "string", description: "その税率の対象額（税込）、数字のみ" },
                tax: { type: "string", description: "その税率の消費税額、数字のみ" },
                items: {
                  type: "string",
                  description: "その税率に該当する品目名をカンマ区切りで。分からなければ空文字",
                },
              },
              required: ["rate", "amount", "tax", "items"],
            },
          },
          memo: {
            type: "string",
            description: "取引先名・品目・摘要の簡潔な要約",
          },
        },
        required: [
          "ocrText",
          "date",
          "registrationNumber",
          "receiptNumber",
          "amount",
          "tax",
          "taxLines",
          "memo",
        ],
      },
    },
  },
  required: ["pages"],
} as const;

/** 旧形式（単一オブジェクト）のスキーマ。フォールバック解釈の参照用に残す */
export const OCR_SINGLE_PAGE_SCHEMA = {
  type: "object",
  properties: {
    ocrText: {
      type: "string",
      description: "読み取ったテキスト全文。レイアウトを維持すること",
    },
    date: {
      type: "string",
      description: "日付をYYYY-MM-DD形式で。見つからない場合は空文字",
    },
    registrationNumber: {
      type: "string",
      description:
        "適格請求書発行事業者の登録番号。T + 数字13桁（例: T1234567890123）。一致しない場合は空文字",
    },
    amount: {
      type: "string",
      description: "税込合計金額、数字のみ。見つからない場合は空文字",
    },
    tax: {
      type: "string",
      description: "消費税額、数字のみ。見つからない場合は空文字",
    },
    memo: {
      type: "string",
      description: "取引先名・品目・摘要の簡潔な要約",
    },
  },
  required: ["ocrText", "date", "registrationNumber", "amount", "tax", "memo"],
} as const;
