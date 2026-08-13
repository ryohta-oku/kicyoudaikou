/**
 * OCR結果の型・スキーマ・正規化。
 *
 * 「値なし」は必ず空文字（null や undefined は使わない）。
 * OpenAI の strict json_schema は全プロパティを required にする必要があり、
 * 全項目 string・全項目 required が Gemini と OpenAI の双方で差異なく扱える唯一の形。
 */

export interface OcrFields {
  ocrText: string;
  date: string;
  registrationNumber: string;
  amount: string;
  tax: string;
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

/** 任意のオブジェクトを OcrFields に正規化する */
export function normalizeOcrFields(raw: Record<string, unknown>): OcrFields {
  return {
    ocrText: toText(raw.ocrText ?? raw.ocr_text),
    date: toText(raw.date),
    registrationNumber: normalizeRegistrationNumber(raw.registrationNumber),
    amount: toText(raw.amount),
    tax: toText(raw.tax),
    memo: toText(raw.memo),
  };
}

export const EMPTY_OCR_FIELDS: OcrFields = {
  ocrText: "",
  date: "",
  registrationNumber: "",
  amount: "",
  tax: "",
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
