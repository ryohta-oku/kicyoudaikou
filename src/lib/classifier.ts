import { prisma } from "./prisma";

interface ClassificationResult {
  accountCode: string;
  accountName: string;
  subAccountCode: string;
  subAccountName: string;
  confidence: number;
}

// キーワードベースの勘定科目推測ルール
const CLASSIFICATION_RULES: {
  keywords: string[];
  accountCode: string;
  accountName: string;
  category: string;
}[] = [
  // 費用科目
  { keywords: ["交通", "電車", "バス", "タクシー", "新幹線", "飛行機", "航空"], accountCode: "7121", accountName: "旅費交通費", category: "費用" },
  { keywords: ["接待", "飲食", "会食", "懇親"], accountCode: "7131", accountName: "接待交際費", category: "費用" },
  { keywords: ["通信", "電話", "インターネット", "切手", "郵便", "宅配"], accountCode: "7141", accountName: "通信費", category: "費用" },
  { keywords: ["消耗品", "文房具", "コピー用紙", "トナー", "事務用品"], accountCode: "7151", accountName: "消耗品費", category: "費用" },
  { keywords: ["水道", "電気", "ガス", "光熱"], accountCode: "7161", accountName: "水道光熱費", category: "費用" },
  { keywords: ["家賃", "賃借", "レンタル", "リース"], accountCode: "7171", accountName: "地代家賃", category: "費用" },
  { keywords: ["保険", "損害保険", "生命保険"], accountCode: "7181", accountName: "保険料", category: "費用" },
  { keywords: ["修繕", "修理", "メンテナンス"], accountCode: "7191", accountName: "修繕費", category: "費用" },
  { keywords: ["広告", "宣伝", "チラシ", "看板"], accountCode: "7201", accountName: "広告宣伝費", category: "費用" },
  { keywords: ["給料", "給与", "賃金", "アルバイト", "パート"], accountCode: "7111", accountName: "給料手当", category: "費用" },
  { keywords: ["外注", "委託", "業務委託"], accountCode: "7211", accountName: "外注費", category: "費用" },
  { keywords: ["会議", "セミナー", "研修"], accountCode: "7221", accountName: "会議費", category: "費用" },
  { keywords: ["新聞", "図書", "書籍", "雑誌", "購読"], accountCode: "7231", accountName: "新聞図書費", category: "費用" },
  { keywords: ["車両", "ガソリン", "駐車", "高速", "ETC"], accountCode: "7241", accountName: "車両費", category: "費用" },
  { keywords: ["雑費"], accountCode: "7299", accountName: "雑費", category: "費用" },
  // 収益科目
  { keywords: ["売上", "売掛", "販売", "収入"], accountCode: "4111", accountName: "売上高", category: "収益" },
  { keywords: ["受取利息", "利息収入"], accountCode: "4211", accountName: "受取利息", category: "収益" },
  // 資産科目
  { keywords: ["現金"], accountCode: "1111", accountName: "現金", category: "資産" },
  { keywords: ["普通預金", "銀行", "振込"], accountCode: "1121", accountName: "普通預金", category: "資産" },
  { keywords: ["売掛金"], accountCode: "1131", accountName: "売掛金", category: "資産" },
  // 負債科目
  { keywords: ["買掛金"], accountCode: "2111", accountName: "買掛金", category: "負債" },
  { keywords: ["未払金", "未払い"], accountCode: "2121", accountName: "未払金", category: "負債" },
];

export async function classifyText(text: string): Promise<ClassificationResult> {
  const normalizedText = text.toLowerCase();

  // まずDBの勘定科目マスターから検索
  const accounts = await prisma.account.findMany({
    include: { subAccounts: true },
  });

  // マスターデータがあればそちらを優先
  for (const account of accounts) {
    if (normalizedText.includes(account.name.toLowerCase())) {
      return {
        accountCode: account.code,
        accountName: account.name,
        subAccountCode: "",
        subAccountName: "",
        confidence: 0.9,
      };
    }
    for (const sub of account.subAccounts) {
      if (normalizedText.includes(sub.name.toLowerCase())) {
        return {
          accountCode: account.code,
          accountName: account.name,
          subAccountCode: sub.code,
          subAccountName: sub.name,
          confidence: 0.85,
        };
      }
    }
  }

  // ルールベースで推測
  for (const rule of CLASSIFICATION_RULES) {
    for (const keyword of rule.keywords) {
      if (normalizedText.includes(keyword)) {
        return {
          accountCode: rule.accountCode,
          accountName: rule.accountName,
          subAccountCode: "",
          subAccountName: "",
          confidence: 0.7,
        };
      }
    }
  }

  // 該当なし
  return {
    accountCode: "",
    accountName: "",
    subAccountCode: "",
    subAccountName: "",
    confidence: 0,
  };
}

// テキストから仕訳情報を抽出するパーサー
export function parseOCRText(text: string): {
  date: string;
  description: string;
  amount: number;
}[] {
  const results: { date: string; description: string; amount: number }[] = [];
  const lines = text.split("\n").filter((line) => line.trim());

  // 日付パターン: YYYY/MM/DD, YYYY-MM-DD, YYYY年MM月DD日, R6.MM.DD etc.
  const datePatterns = [
    /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/,
    /[令和R]?\s*(\d{1,2})[\.\/\-年](\d{1,2})[\.\/\-月](\d{1,2})日?/,
  ];

  // 金額パターン: ¥1,000 / 1,000円 / ￥1000 etc.
  const amountPattern = /[¥￥]?\s*([\d,]+)\s*円?/;

  let currentDate = "";

  for (const line of lines) {
    // 日付を検出
    for (const pattern of datePatterns) {
      const dateMatch = line.match(pattern);
      if (dateMatch) {
        if (dateMatch.length === 4 && dateMatch[1].length === 4) {
          currentDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
        } else if (dateMatch.length === 4) {
          // 令和対応
          const year = 2018 + parseInt(dateMatch[1]);
          currentDate = `${year}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
        }
        break;
      }
    }

    // 金額を検出
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
