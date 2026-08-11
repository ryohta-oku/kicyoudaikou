/**
 * AIプロバイダの共通契約。
 *
 * 汎用の chat() ではなく、呼び出し側が実際に必要とする3用途だけを定義する。
 * システムプロンプトの渡し方・スキーマの包み方・メディアパートの形・usageのフィールド名が
 * Gemini と OpenAI で異なるため、汎用ラッパーにすると差異が必ず漏れる。
 * 3つに絞れば差異はアダプタ2ファイルの中に閉じ込められる。
 */

import type { LoadedMedia } from "@/lib/ocr/media";

export type AiProvider = "gemini" | "openai";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiResult {
  text: string;
  usage: AiUsage;
  latencyMs: number;
  model: string;
  /** 出力トークン上限（reasoningトークン込み）に達して打ち切られた */
  truncated: boolean;
}

/** 画像／PDF → 固定スキーマのJSON */
export interface StructuredOcrRequest {
  model: string;
  media: LoadedMedia;
  systemPrompt: string;
  userPrompt: string;
  schema: object;
  schemaName: string;
  maxOutputTokens: number;
}

/** テキスト → 固定スキーマのJSON（仕訳分類） */
export interface StructuredTextRequest {
  model: string;
  instructions: string;
  input: string;
  schema: object;
  schemaName: string;
  maxOutputTokens: number;
}

/** 画像／PDF → 短いプレーンテキスト（単一項目の再読み取り） */
export interface ShortTextRequest {
  model: string;
  media: LoadedMedia;
  prompt: string;
  maxOutputTokens: number;
}

export interface AiAdapter {
  runStructuredOcr(req: StructuredOcrRequest): Promise<AiResult>;
  runStructuredText(req: StructuredTextRequest): Promise<AiResult>;
  runShortText(req: ShortTextRequest): Promise<AiResult>;
}

/**
 * maxDuration = 60 に対し、nginx やプラットフォーム側で切られる前に
 * 日本語のエラーを返せるようにする。
 */
export const AI_TIMEOUT_MS = 50_000;
