import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY が設定されていません。.env に追加してください。"
      );
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

// モデル名の定数はここには置かない。
// 管理画面から切り替えられるようにするため、@/lib/ai/registry と @/lib/ai/index で解決する。
