/**
 * 選択可能なAIモデルのカタログ。
 *
 * カタログはコード、選択値はデータ。モデル追加にはデプロイが必要だが、
 * 単価・vision対応・プロバイダ対応を型付きの1箇所に保てる利点を取る。
 * 管理画面のセレクトはこの一覧からしか選べないため、不正なモデルIDは保存されない。
 *
 * モデルIDは 2026-08-11 時点で両社のAPIに実在することを確認済み。
 * 単価は100万トークンあたりのUSD（入力／出力）。価格改定が頻繁なため要定期確認。
 */

import type { AiProvider } from "./types";

export interface ModelInfo {
  id: string;
  provider: AiProvider;
  label: string;
  /** 画像・PDFのOCRに使えるか */
  supportsVision: boolean;
  inputPer1M: number;
  outputPer1M: number;
  /** 提供終了予定などの注意書き */
  note?: string;
}

export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "gpt-5.6-luna",
    provider: "openai",
    label: "GPT-5.6 Luna（OpenAI・低価格）",
    supportsVision: true,
    inputPer1M: 0.2,
    outputPer1M: 1.2,
  },
  {
    id: "gpt-5.6-terra",
    provider: "openai",
    label: "GPT-5.6 Terra（OpenAI・バランス）",
    supportsVision: true,
    inputPer1M: 2.0,
    outputPer1M: 12.0,
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    label: "Gemini 3.5 Flash-Lite（Google・低価格）",
    supportsVision: true,
    inputPer1M: 0.3,
    outputPer1M: 2.5,
  },
  {
    id: "gemini-3.1-flash-lite",
    provider: "gemini",
    label: "Gemini 3.1 Flash-Lite（Google・最安）",
    supportsVision: true,
    inputPer1M: 0.25,
    outputPer1M: 1.5,
  },
  {
    id: "gemini-3.6-flash",
    provider: "gemini",
    label: "Gemini 3.6 Flash（Google・高精度）",
    supportsVision: true,
    inputPer1M: 1.5,
    outputPer1M: 7.5,
  },
  {
    id: "gemini-2.5-flash-lite",
    provider: "gemini",
    label: "Gemini 2.5 Flash-Lite（旧・移行元）",
    supportsVision: true,
    inputPer1M: 0.1,
    outputPer1M: 0.4,
    note: "2026年10月16日で提供終了予定",
  },
];

/**
 * 既定モデル。
 * OCRもLunaを既定とするが、vision処理での優位は未検証のため、
 * 管理画面から Gemini へ即座に戻せることを前提とした選択。
 */
export const DEFAULT_OCR_MODEL = "gpt-5.6-luna";
export const DEFAULT_CLASSIFY_MODEL = "gpt-5.6-luna";

export function findModel(modelId: string | null | undefined): ModelInfo | null {
  if (!modelId) return null;
  return MODEL_CATALOG.find((m) => m.id === modelId) || null;
}

export function resolveProvider(modelId: string): AiProvider {
  const model = findModel(modelId);
  if (!model) throw new Error(`未知のモデルです: ${modelId}`);
  return model.provider;
}
