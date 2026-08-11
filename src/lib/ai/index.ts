/**
 * ルートが import する唯一のAIモジュール。
 *
 * モデルの決定は DB（管理画面） → 環境変数 → 組み込み既定 の順。
 * 各段でカタログと照合し、廃止済みモデルを指す古い設定が残っていても
 * 500 にせず次の候補へフォールスルーする。
 */

import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { CLASSIFY_JSON_SCHEMA } from "@/lib/classify/schema";
import { parseOcrResponse } from "@/lib/ocr/parse";
import { OCR_JSON_SCHEMA, type OcrFields } from "@/lib/ocr/schema";
import { FIELD_PROMPTS, OCR_SYSTEM_PROMPT, OCR_USER_PROMPT } from "@/lib/ocr/prompts";
import type { LoadedMedia } from "@/lib/ocr/media";
import {
  DEFAULT_CLASSIFY_MODEL,
  DEFAULT_OCR_MODEL,
  findModel,
  resolveProvider,
} from "./registry";
import { geminiAdapter } from "./gemini";
import { openaiAdapter } from "./openai";
import type { AiAdapter, AiResult } from "./types";

export type ModelKind = "ocr" | "classify";

export type ModelSource = "db" | "env" | "default";

export interface ResolvedModel {
  modelId: string;
  source: ModelSource;
}

/** DB → env → 既定 の順に、カタログに存在する最初のものを採用する */
export async function resolveModel(kind: ModelKind): Promise<ResolvedModel> {
  const fromDb = await getSetting(
    kind === "ocr" ? SETTING_KEYS.ocrModel : SETTING_KEYS.classifyModel
  );
  if (findModel(fromDb)) return { modelId: fromDb as string, source: "db" };

  const fromEnv =
    kind === "ocr" ? process.env.OCR_MODEL : process.env.CLASSIFY_MODEL;
  if (findModel(fromEnv)) return { modelId: fromEnv as string, source: "env" };

  return {
    modelId: kind === "ocr" ? DEFAULT_OCR_MODEL : DEFAULT_CLASSIFY_MODEL,
    source: "default",
  };
}

function adapterFor(modelId: string): AiAdapter {
  return resolveProvider(modelId) === "openai" ? openaiAdapter : geminiAdapter;
}

/** 出力が空だった場合、原因が分かるエラーにして投げる */
function assertNotEmpty(result: AiResult): void {
  if (result.text.trim().length > 0) return;
  if (result.truncated) {
    throw new Error(
      `${result.model} の応答が出力トークン上限で打ち切られました（推論トークンの消費が原因の可能性があります）`
    );
  }
  throw new Error(`${result.model} から空の応答が返りました`);
}

export interface OcrRunResult {
  fields: OcrFields;
  meta: AiResult;
}

export interface ModelTestResult {
  modelId: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/** 接続テスト用の最小スキーマ（トークンをほとんど消費しない） */
const PING_SCHEMA = {
  type: "object",
  properties: { ok: { type: "string", description: '文字列 "ok" を返す' } },
  required: ["ok"],
} as const;

/**
 * 指定モデルに実際に1回だけ問い合わせて疎通を確認する。
 * APIキーの有無・モデルIDの正しさ・ネットワーク・JSONモードをまとめて検証できる。
 * 管理画面でモデルを切り替えた直後の確認に使う。
 */
export async function testModel(modelId: string): Promise<ModelTestResult> {
  const startedAt = Date.now();
  try {
    if (!findModel(modelId)) throw new Error(`カタログにないモデルです: ${modelId}`);
    const result = await adapterFor(modelId).runStructuredText({
      model: modelId,
      instructions: 'あなたは接続テストに応答します。必ず {"ok":"ok"} だけを返してください。',
      input: "ping",
      schema: PING_SCHEMA,
      schemaName: "ping",
      maxOutputTokens: 512,
    });
    assertNotEmpty(result);
    return { modelId, ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      modelId,
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 画像／PDFからOCR＋構造化フィールド抽出を1回の呼び出しで行う。
 * maxOutputTokens は呼び出し側の指定に従う（PDFと画像で必要量が違うため統一しない）。
 */
export async function runOcr(
  media: LoadedMedia,
  maxOutputTokens: number
): Promise<OcrRunResult> {
  const { modelId } = await resolveModel("ocr");
  const result = await adapterFor(modelId).runStructuredOcr({
    model: modelId,
    media,
    systemPrompt: OCR_SYSTEM_PROMPT,
    userPrompt: OCR_USER_PROMPT,
    schema: OCR_JSON_SCHEMA,
    schemaName: "ocr_fields",
    maxOutputTokens,
  });
  assertNotEmpty(result);
  return { fields: parseOcrResponse(result.text), meta: result };
}

/** 単一項目のピンポイント再読み取り。生のテキストを返す */
export async function runFieldReread(
  media: LoadedMedia,
  fieldName: string,
  maxOutputTokens = 256
): Promise<AiResult> {
  const prompt = FIELD_PROMPTS[fieldName];
  if (!prompt) throw new Error(`未対応のフィールド: ${fieldName}`);

  const { modelId } = await resolveModel("ocr");
  return adapterFor(modelId).runShortText({
    model: modelId,
    media,
    prompt,
    maxOutputTokens,
  });
}

/** OCRテキストから仕訳データを推測する（JSON文字列を返す） */
export async function runClassify(
  instructions: string,
  input: string,
  maxOutputTokens = 4096
): Promise<AiResult> {
  const { modelId } = await resolveModel("classify");
  const result = await adapterFor(modelId).runStructuredText({
    model: modelId,
    instructions,
    input,
    schema: CLASSIFY_JSON_SCHEMA,
    schemaName: "journal_entries",
    maxOutputTokens,
  });
  assertNotEmpty(result);
  return result;
}
