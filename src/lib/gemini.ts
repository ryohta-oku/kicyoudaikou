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

export const OCR_MODEL = "gemini-2.5-flash-lite";
export const CLASSIFY_MODEL = "gemini-2.5-flash-lite";
