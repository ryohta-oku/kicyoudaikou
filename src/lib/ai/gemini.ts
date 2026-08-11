/**
 * Gemini アダプタ（@google/genai）。
 *
 * JSON出力は responseMimeType: "application/json" のみで指定し、responseSchema は使わない。
 * SDKごとにスキーマ方言（OpenAPIサブセット）が異なり壊れやすいため、
 * 期待する形はプロンプト側に書いてパーサーで正規化する方針を取る。
 * これは既存の classifier が実績のあるやり方でもある。
 */

import { getGeminiClient } from "@/lib/gemini";
import {
  AI_TIMEOUT_MS,
  type AiAdapter,
  type AiResult,
  type ShortTextRequest,
  type StructuredOcrRequest,
  type StructuredTextRequest,
} from "./types";
import type { LoadedMedia } from "@/lib/ocr/media";

type GenerateConfig = Record<string, unknown>;

/**
 * thinkingトークンは出力として課金され、かつ maxOutputTokens を食い潰して
 * 「エラーではなく空文字が返る」という分かりにくい失敗を起こす。
 * OCRも仕訳分類も熟考は不要なので抑制する。
 *
 * 2.5系は thinkingBudget: 0 で完全に無効化できる。
 * 3.x系はフィールド仕様が異なるため既定のままにしてある（必要になれば要検証）。
 */
function thinkingConfigFor(model: string): GenerateConfig {
  if (model.startsWith("gemini-2.5-")) {
    return { thinkingConfig: { thinkingBudget: 0 } };
  }
  return {};
}

function mediaPart(media: LoadedMedia) {
  return { inlineData: { mimeType: media.mimeType, data: media.base64 } };
}

interface GeminiResponseLike {
  text?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  candidates?: { finishReason?: string }[];
}

function toResult(
  response: GeminiResponseLike,
  model: string,
  latencyMs: number
): AiResult {
  const usage = response.usageMetadata;
  return {
    text: response.text || "",
    usage: {
      inputTokens: usage?.promptTokenCount ?? 0,
      // thinkingトークンも出力として課金されるため合算する
      outputTokens:
        (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    },
    latencyMs,
    model,
    truncated: response.candidates?.[0]?.finishReason === "MAX_TOKENS",
  };
}

async function generate(
  model: string,
  parts: object[],
  config: GenerateConfig
): Promise<AiResult> {
  const ai = getGeminiClient();
  const startedAt = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: { ...config, abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return toResult(response as GeminiResponseLike, model, Date.now() - startedAt);
}

export const geminiAdapter: AiAdapter = {
  async runStructuredOcr(req: StructuredOcrRequest): Promise<AiResult> {
    return generate(
      req.model,
      [mediaPart(req.media), { text: req.userPrompt }],
      {
        systemInstruction: req.systemPrompt,
        responseMimeType: "application/json",
        maxOutputTokens: req.maxOutputTokens,
        ...thinkingConfigFor(req.model),
      }
    );
  },

  async runStructuredText(req: StructuredTextRequest): Promise<AiResult> {
    return generate(req.model, [{ text: req.input }], {
      systemInstruction: req.instructions,
      responseMimeType: "application/json",
      maxOutputTokens: req.maxOutputTokens,
      ...thinkingConfigFor(req.model),
    });
  },

  async runShortText(req: ShortTextRequest): Promise<AiResult> {
    return generate(req.model, [mediaPart(req.media), { text: req.prompt }], {
      maxOutputTokens: req.maxOutputTokens,
      ...thinkingConfigFor(req.model),
    });
  },
};
