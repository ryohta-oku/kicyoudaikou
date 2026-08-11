/**
 * 仕訳分類の出力スキーマ。
 *
 * OpenAI の structured outputs（strict）に渡す。strict は全プロパティが required で
 * あることを要求するため、「値なし」は空文字／0 で表現する。
 * Gemini 側はプロンプト記述＋responseMimeType で同じ形を出す。
 */

export const CLASSIFY_JSON_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      description: "抽出した仕訳。1書類につき必ず1件",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "取引日 YYYY-MM-DD。不明なら空文字" },
          description: { type: "string", description: "摘要（店名・品目など）" },
          amount: { type: "number", description: "税込総額。不明なら0" },
          accountCode: { type: "string", description: "勘定科目コード" },
          accountName: { type: "string", description: "勘定科目名" },
          subAccountCode: {
            type: "string",
            description: "補助科目コード。マスターに無ければ空文字",
          },
          subAccountName: {
            type: "string",
            description: "補助科目名（取引先名・店舗名）",
          },
          taxRate: {
            type: "string",
            description: "課税10%, 課税8%, 非課税, 不課税, 免税 のいずれか",
          },
          reasoning: { type: "string", description: "勘定科目を選んだ理由（日本語1-2文）" },
          confidence: { type: "number", description: "信頼度 0.0〜1.0" },
        },
        required: [
          "date",
          "description",
          "amount",
          "accountCode",
          "accountName",
          "subAccountCode",
          "subAccountName",
          "taxRate",
          "reasoning",
          "confidence",
        ],
      },
    },
  },
  required: ["entries"],
} as const;
