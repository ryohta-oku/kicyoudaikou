import { prisma } from "./prisma";
import { getOpenAIClient, CLASSIFY_MODEL } from "./openai";

export interface ClassificationResult {
  accountCode: string;
  accountName: string;
  subAccountCode: string;
  subAccountName: string;
  confidence: number;
}

export interface ParsedJournalEntry {
  date: string;
  description: string;
  amount: number;
  accountCode: string;
  accountName: string;
  subAccountCode: string;
  subAccountName: string;
  taxRate: string;
  reasoning: string;
  confidence: number;
}

// 勘定科目マスターを取得してプロンプトに含める
async function getAccountMasterText(): Promise<string> {
  const accounts = await prisma.account.findMany({
    include: { subAccounts: true },
  });

  if (accounts.length === 0) {
    return "";
  }

  const lines = accounts.map((a) => {
    const subs = a.subAccounts.map((s) => `  - ${s.code}: ${s.name}`).join("\n");
    return `${a.code}: ${a.name}（${a.category}）${subs ? "\n" + subs : ""}`;
  });

  return "\n\n利用可能な勘定科目マスター:\n" + lines.join("\n");
}

/**
 * GPT-4o mini で OCRテキストから仕訳データを抽出・分類する
 * 1回のAPI呼び出しで、日付・摘要・金額の抽出と勘定科目の分類を同時に行う
 */
export async function classifyWithAI(ocrText: string): Promise<ParsedJournalEntry[]> {
  const client = getOpenAIClient();
  const accountMaster = await getAccountMasterText();

  const response = await client.chat.completions.create({
    model: CLASSIFY_MODEL,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `あなたは日本の記帳代行の専門家です。OCRで読み取られたテキストから仕訳データを抽出してください。

以下のJSON形式で返してください:
{
  "entries": [
    {
      "date": "YYYY-MM-DD",
      "description": "摘要（店名・品目など）",
      "amount": 金額（数値）,
      "accountCode": "勘定科目コード",
      "accountName": "勘定科目名",
      "subAccountCode": "補助科目コード（マスターに存在する場合のみ。なければ空文字）",
      "subAccountName": "補助科目名（取引先名・店舗名など。必ず推測して入力すること）",
      "taxRate": "税率区分（課税10%, 課税8%, 非課税, 不課税, 免税 のいずれか）",
      "reasoning": "この勘定科目を選んだ理由（日本語1-2文）",
      "confidence": 信頼度（0.0〜1.0）
    }
  ]
}

ルール:
- 日付が見つからない場合は空文字""にする
- 金額は税込み総額を使用する。見つからない場合は0
- reasoningには、なぜその勘定科目を選んだかを日本語1-2文で説明する
- taxRateには、課税10%, 課税8%, 非課税, 不課税, 免税 のいずれかを選ぶ
- 勘定科目は以下の一般的な科目から選ぶ:
  7121: 旅費交通費, 7131: 接待交際費, 7141: 通信費, 7151: 消耗品費,
  7161: 水道光熱費, 7171: 地代家賃, 7181: 保険料, 7191: 修繕費,
  7201: 広告宣伝費, 7111: 給料手当, 7211: 外注費, 7221: 会議費,
  7231: 新聞図書費, 7241: 車両費, 7299: 雑費,
  4111: 売上高, 1111: 現金, 1121: 普通預金
- 判断に迷う場合はconfidenceを低くする（0.5以下）
- テキストに仕訳情報がない場合はentriesを空配列にする
- 【重要】補助科目（subAccountName）は取引先名・店舗名・支払先名を推測して必ず入力すること。
  例: レシートの店名「スターバックス」→ subAccountName: "スターバックス"
  例: 請求書の発行元「株式会社ABC」→ subAccountName: "株式会社ABC"
  例: 領収書の宛先が「タクシー代」で店名が「日本交通」→ subAccountName: "日本交通"
  マスターに該当する補助科目がある場合はそのコードと名前を使用し、なければsubAccountCodeは空文字でsubAccountNameだけ入力する。${accountMaster}`,
      },
      {
        role: "user",
        content: `以下のOCRテキストから仕訳データを抽出してください:\n\n${ocrText}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content);
    const entries: ParsedJournalEntry[] = (parsed.entries || []).map(
      (e: Record<string, unknown>) => ({
        date: String(e.date || ""),
        description: String(e.description || ""),
        amount: Number(e.amount) || 0,
        accountCode: String(e.accountCode || ""),
        accountName: String(e.accountName || ""),
        subAccountCode: String(e.subAccountCode || ""),
        subAccountName: String(e.subAccountName || ""),
        taxRate: String(e.taxRate || ""),
        reasoning: String(e.reasoning || ""),
        confidence: Number(e.confidence) || 0,
      })
    );
    return entries;
  } catch {
    console.error("AI classification JSON parse error:", content);
    return [];
  }
}

// === フォールバック用: キーワードベースの分類（AI API が使えない場合） ===

const CLASSIFICATION_RULES: {
  keywords: string[];
  accountCode: string;
  accountName: string;
}[] = [
  { keywords: ["交通", "電車", "バス", "タクシー", "新幹線", "飛行機", "航空"], accountCode: "7121", accountName: "旅費交通費" },
  { keywords: ["接待", "飲食", "会食", "懇親"], accountCode: "7131", accountName: "接待交際費" },
  { keywords: ["通信", "電話", "インターネット", "切手", "郵便", "宅配"], accountCode: "7141", accountName: "通信費" },
  { keywords: ["消耗品", "文房具", "コピー用紙", "トナー", "事務用品"], accountCode: "7151", accountName: "消耗品費" },
  { keywords: ["水道", "電気", "ガス", "光熱"], accountCode: "7161", accountName: "水道光熱費" },
  { keywords: ["家賃", "賃借", "レンタル", "リース"], accountCode: "7171", accountName: "地代家賃" },
  { keywords: ["保険", "損害保険", "生命保険"], accountCode: "7181", accountName: "保険料" },
  { keywords: ["修繕", "修理", "メンテナンス"], accountCode: "7191", accountName: "修繕費" },
  { keywords: ["広告", "宣伝", "チラシ", "看板"], accountCode: "7201", accountName: "広告宣伝費" },
  { keywords: ["給料", "給与", "賃金", "アルバイト", "パート"], accountCode: "7111", accountName: "給料手当" },
  { keywords: ["外注", "委託", "業務委託"], accountCode: "7211", accountName: "外注費" },
  { keywords: ["会議", "セミナー", "研修"], accountCode: "7221", accountName: "会議費" },
  { keywords: ["新聞", "図書", "書籍", "雑誌", "購読"], accountCode: "7231", accountName: "新聞図書費" },
  { keywords: ["車両", "ガソリン", "駐車", "高速", "ETC"], accountCode: "7241", accountName: "車両費" },
  { keywords: ["雑費"], accountCode: "7299", accountName: "雑費" },
  { keywords: ["売上", "売掛", "販売", "収入"], accountCode: "4111", accountName: "売上高" },
  { keywords: ["現金"], accountCode: "1111", accountName: "現金" },
  { keywords: ["普通預金", "銀行", "振込"], accountCode: "1121", accountName: "普通預金" },
];

export async function classifyText(text: string): Promise<ClassificationResult> {
  const normalizedText = text.toLowerCase();

  const accounts = await prisma.account.findMany({
    include: { subAccounts: true },
  });

  for (const account of accounts) {
    if (normalizedText.includes(account.name.toLowerCase())) {
      return { accountCode: account.code, accountName: account.name, subAccountCode: "", subAccountName: "", confidence: 0.9 };
    }
    for (const sub of account.subAccounts) {
      if (normalizedText.includes(sub.name.toLowerCase())) {
        return { accountCode: account.code, accountName: account.name, subAccountCode: sub.code, subAccountName: sub.name, confidence: 0.85 };
      }
    }
  }

  for (const rule of CLASSIFICATION_RULES) {
    for (const keyword of rule.keywords) {
      if (normalizedText.includes(keyword)) {
        return { accountCode: rule.accountCode, accountName: rule.accountName, subAccountCode: "", subAccountName: "", confidence: 0.7 };
      }
    }
  }

  return { accountCode: "", accountName: "", subAccountCode: "", subAccountName: "", confidence: 0 };
}

export function parseOCRText(text: string): { date: string; description: string; amount: number }[] {
  const results: { date: string; description: string; amount: number }[] = [];
  const lines = text.split("\n").filter((line) => line.trim());

  const datePatterns = [
    /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/,
    /[令和R]?\s*(\d{1,2})[\.\/\-年](\d{1,2})[\.\/\-月](\d{1,2})日?/,
  ];

  const amountPattern = /[¥￥]?\s*([\d,]+)\s*円?/;

  let currentDate = "";

  for (const line of lines) {
    for (const pattern of datePatterns) {
      const dateMatch = line.match(pattern);
      if (dateMatch) {
        if (dateMatch.length === 4 && dateMatch[1].length === 4) {
          currentDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
        } else if (dateMatch.length === 4) {
          const year = 2018 + parseInt(dateMatch[1]);
          currentDate = `${year}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
        }
        break;
      }
    }

    const amountMatch = line.match(amountPattern);
    if (amountMatch) {
      const amount = parseInt(amountMatch[1].replace(/,/g, ""));
      if (amount > 0 && currentDate) {
        results.push({
          date: currentDate,
          description: line.replace(amountPattern, "").trim() || "不明",
          amount,
        });
      }
    }
  }

  return results;
}
