/**
 * OpenAI アダプタ（Responses API）。
 *
 * Chat Completions ではなく Responses API を使う理由:
 * - PDFを input_file として直接渡せる（Chat Completions では画像しか渡せない）
 * - structured outputs（strict json_schema）が扱いやすい
 *
 * 注意: OpenAI はPDFをページ画像に展開して画像トークンとして課金する。
 * このアプリは1ドキュメント＝1ページしか作らないため実害は小さいが、
 * 複数ページPDFではGeminiよりコストが膨らむ。
 */

import { getOpenAIClient } from "@/lib/openai";
import {
  AI_TIMEOUT_MS,
  type AiAdapter,
  type AiResult,
  type ShortTextRequest,
  type StructuredOcrRequest,
  type StructuredTextRequest,
} from "./types";
import type { LoadedMedia } from "@/lib/ocr/media";

/** reasoningトークンも max_output_tokens を消費するため最小限に抑える */
const REASONING_EFFORT = "low" as const;

/**
 * strict モードは全オブジェクトに additionalProperties: false を要求する。
 * カタログ側のスキーマには持たせず（Gemini と共用のため）ここで付与する。
 * 配列の items も再帰する必要がある（仕訳分類の entries[] がこれに当たる）。
 */
function toStrictSchema(schema: object): object {
  const node = schema as Record<string, unknown>;

  if (node.type === "array" && node.items) {
    return { ...node, items: toStrictSchema(node.items as object) };
  }

  if (node.type !== "object") return schema;

  const properties = (node.properties ?? {}) as Record<string, object>;
  return {
    ...node,
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, toStrictSchema(value)])
    ),
  };
}

function mediaContent(media: LoadedMedia) {
  const dataUri = `data:${media.mimeType};base64,${media.base64}`;
  if (media.kind === "pdf") {
    return { type: "input_file" as const, filename: "document.pdf", file_data: dataUri };
  }
  return { type: "input_image" as const, image_url: dataUri, detail: "auto" as const };
}

interface OpenAiResponseLike {
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
}

function toResult(
  response: OpenAiResponseLike,
  model: string,
  latencyMs: number
): AiResult {
  return {
    text: response.output_text || "",
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    latencyMs,
    model,
    truncated:
      response.status === "incomplete" &&
      response.incomplete_details?.reason === "max_output_tokens",
  };
}

async function create(
  model: string,
  params: Record<string, unknown>
): Promise<AiResult> {
  const client = getOpenAIClient();
  const startedAt = Date.now();
  const response = await client.responses.create(
    { model, reasoning: { effort: REASONING_EFFORT }, ...params },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { signal: AbortSignal.timeout(AI_TIMEOUT_MS) } as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
  return toResult(response as OpenAiResponseLike, model, Date.now() - startedAt);
}

export const openaiAdapter: AiAdapter = {
  async runStructuredOcr(req: StructuredOcrRequest): Promise<AiResult> {
    return create(req.model, {
      instructions: req.systemPrompt,
      input: [
        {
          role: "user",
          content: [
            mediaContent(req.media),
            { type: "input_text", text: req.userPrompt },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: req.schemaName,
          strict: true,
          schema: toStrictSchema(req.schema),
        },
      },
      max_output_tokens: req.maxOutputTokens,
    });
  },

  async runStructuredText(req: StructuredTextRequest): Promise<AiResult> {
    // json_object モードは入力メッセージに "json" の語を含むことを要求するため使わない。
    // json_schema なら形が保証され、パース失敗も起きない。
    return create(req.model, {
      instructions: req.instructions,
      input: req.input,
      text: {
        format: {
          type: "json_schema",
          name: req.schemaName,
          strict: true,
          schema: toStrictSchema(req.schema),
        },
      },
      max_output_tokens: req.maxOutputTokens,
    });
  },

  async runShortText(req: ShortTextRequest): Promise<AiResult> {
    return create(req.model, {
      input: [
        {
          role: "user",
          content: [
            mediaContent(req.media),
            { type: "input_text", text: req.prompt },
          ],
        },
      ],
      max_output_tokens: req.maxOutputTokens,
    });
  },
};
