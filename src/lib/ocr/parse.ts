/**
 * OCRレスポンスのパーサー。
 *
 * 以前は ocr/route.ts と reread-all/route.ts に別々の実装があり、
 * ```json フェンス対応が reread-all にしか無いというドリフトが起きていた。
 * ここでは両者の上位互換として、次の順に解釈を試みる:
 *   1. 素のJSON
 *   2. ```json フェンスで囲まれたJSON
 *   3. レガシーの「=== FIELDS ===」テキスト形式
 *   4. どれでもなければ全文を ocrText として扱う
 *
 * 3 はプロンプトをJSON化した後も残す。スキーマを無視するモデルに当たったとき、
 * 何も取れないより旧形式で拾えたほうが安全なため。
 */

import { normalizeOcrFields, type OcrFields } from "./schema";

function fromJsonObject(parsed: unknown, fallbackText: string): OcrFields | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
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

function tryParseJson(content: string): OcrFields | null {
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

function tryParseLegacyFields(content: string): OcrFields | null {
  if (!content.includes("=== FIELDS ===")) return null;

  const textMatch = content.match(/===\s*OCR_TEXT\s*===([\s\S]*?)===\s*FIELDS\s*===/);
  const ocrText = textMatch
    ? textMatch[1].trim()
    : content.split("=== FIELDS ===")[0].trim();
  const fieldsSection = content.split(/===\s*FIELDS\s*===/)[1] || "";
  const get = (name: string) =>
    fieldsSection.match(new RegExp(`${name}:\\s*(.+)`))?.[1]?.trim() || "";

  return normalizeOcrFields({
    ocrText,
    date: get("date"),
    registrationNumber: get("registrationNumber"),
    amount: get("amount"),
    tax: get("tax"),
    memo: get("memo"),
  });
}

export function parseOcrResponse(content: string): OcrFields {
  return (
    tryParseJson(content) ??
    tryParseLegacyFields(content) ??
    normalizeOcrFields({ ocrText: content })
  );
}
