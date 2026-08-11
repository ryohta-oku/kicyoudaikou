import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY が設定されていません。.env に追加してください。");
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// モデル名の定数はここには置かない。
// 管理画面から切り替えられるようにするため、@/lib/ai/registry と @/lib/ai/index で解決する。
