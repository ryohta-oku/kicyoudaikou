/**
 * OCRレスポンスのパーサー。
 *
 * 以前は ocr/route.ts と reread-all/route.ts に別々の実装があり、
 * ```json フェンス対応が reread-all にしか無いというドリフトが起きていた。
 * ここでは上位互換として、次の順に解釈を試みる:
 *   1. { pages: [...] }（現行形式・複数ページ対応）
 *   2. 単一オブジェクト形式（旧形式。1ページとして扱う）
 *   3. ```json フェンスで囲まれたJSON
 *   4. レガシーの「=== FIELDS ===」テキスト形式
 *   5. どれでもなければ全文を ocrText として扱う
 *
 * 4 はプロンプトをJSON化した後も残す。スキーマを無視するモデルに当たったとき、
 * 何も取れないより旧形式で拾えたほうが安全なため。
 */

import {
  MAX_OCR_PAGES,
  normalizeOcrFields,
  type OcrDocumentResult,
  type OcrFields,
} from "./schema";

function fieldsFromObject(raw: unknown, fallbackText: string): OcrFields | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // { fields: {...}, ocr_text: "..." } のような入れ子にも対応
  const nested =
    obj.fields && typeof obj.fields === "object"
      ? (obj.fields as Record<string, unknown>)
      : null;
  const source = nested ? { ...nested, ocrText: obj.ocrText ?? obj.ocr_text } : obj;
  const fields = normalizeOcrFields(source as Record<string, unknown>);
  if (!fields.ocrText) fields.ocrText = fallbackText;
  return fields;
}

function fromJsonObject(parsed: unknown, fallbackText: string): OcrDocumentResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  // 現行形式: { pages: [...] }
  if (Array.isArray(obj.pages)) {
    const pages = obj.pages
      .slice(0, MAX_OCR_PAGES)
      .map((p) => fieldsFromObject(p, ""))
      .filter((p): p is OcrFields => p !== null);
    // 空配列で返ってきた場合は解釈失敗とみなし、後続のフォールバックに委ねる
    if (pages.length > 0) return { pages };
    return null;
  }

  // 旧形式: 単一オブジェクト
  const single = fieldsFromObject(obj, fallbackText);
  return single ? { pages: [single] } : null;
}

function tryParseJson(content: string): OcrDocumentResult | null {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    try {
      return fromJsonObject(JSON.parse(trimmed), content);
    } catch {
      // フェンス付きの可能性へフォールスルー
    }
  }
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return fromJsonObject(JSON.parse(fenced[1].trim()), content);
    } catch {
      // レガシー形式へフォールスルー
    }
  }
  return null;
}

function tryParseLegacyFields(content: string): OcrDocumentResult | null {
  if (!content.includes("=== FIELDS ===")) return null;

  const textMatch = content.match(/===\s*OCR_TEXT\s*===([\s\S]*?)===\s*FIELDS\s*===/);
  const ocrText = textMatch
    ? textMatch[1].trim()
    : content.split("=== FIELDS ===")[0].trim();
  const fieldsSection = content.split(/===\s*FIELDS\s*===/)[1] || "";
  const get = (name: string) =>
    fieldsSection.match(new RegExp(`${name}:\\s*(.+)`))?.[1]?.trim() || "";

  return {
    pages: [
      normalizeOcrFields({
        ocrText,
        date: get("date"),
        registrationNumber: get("registrationNumber"),
        amount: get("amount"),
        tax: get("tax"),
        memo: get("memo"),
      }),
    ],
  };
}

/** 書類全体の読み取り結果を返す（必ず1件以上の pages を含む） */
export function parseOcrDocument(content: string): OcrDocumentResult {
  return (
    tryParseJson(content) ??
    tryParseLegacyFields(content) ?? {
      pages: [normalizeOcrFields({ ocrText: content })],
    }
  );
}

/**
 * 1ページ分だけ欲しい場合のヘルパー（既存ページの再読み取りなど）。
 * 複数ページが返っても先頭のみを使う。
 */
export function parseOcrResponse(content: string): OcrFields {
  return parseOcrDocument(content).pages[0];
}
