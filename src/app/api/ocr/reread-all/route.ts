import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { toPhysicalPath } from "@/lib/storage";
import { getGeminiClient, OCR_MODEL } from "@/lib/gemini";

export const maxDuration = 60;

const OCR_SYSTEM_PROMPT =
  "あなたはOCR（光学文字認識）と経理書類解析の専門家です。\n" +
  "画像またはPDFに含まれるテキストをすべて正確に読み取り、以下のフォーマットで出力してください。\n\n" +
  "=== OCR_TEXT ===\n" +
  "（読み取ったテキスト全文。レイアウトを維持し、日本語・英語・数字を正確に。金額・日付・店名・品目は特に正確に）\n" +
  "=== FIELDS ===\n" +
  "date: （日付をYYYY-MM-DD形式で。見つからない場合は空欄）\n" +
  "registrationNumber: （適格請求書発行事業者の登録番号。T + 数字13桁 = 合計14文字、例: T1234567890123。この形式に一致しない場合は空欄）\n" +
  "amount: （税込合計金額、数字のみ。見つからない場合は空欄）\n" +
  "tax: （消費税額、数字のみ。見つからない場合は空欄）\n" +
  "memo: （取引先名・品目・摘要の要約を簡潔に）\n\n" +
  "テキストが見つからない場合は「テキストなし」と返してください。";

interface OcrResult {
  ocrText: string;
  date: string;
  registrationNumber: string;
  amount: string;
  tax: string;
  memo: string;
}

function parseOcrResponse(content: string): OcrResult {
  if (!content.includes("=== FIELDS ===")) {
    return { ocrText: content, date: "", registrationNumber: "", amount: "", tax: "", memo: "" };
  }
  const textMatch = content.match(/===\s*OCR_TEXT\s*===([\s\S]*?)===\s*FIELDS\s*===/);
  const ocrText = textMatch ? textMatch[1].trim() : content.split("=== FIELDS ===")[0].trim();
  const fieldsSection = content.split(/===\s*FIELDS\s*===/)[1] || "";
  const get = (name: string) => fieldsSection.match(new RegExp(`${name}:\\s*(.+)`))?.[1]?.trim() || "";
  const rawRegNum = get("registrationNumber");
  const regNumMatch = rawRegNum.match(/T\d{13}/);

  return {
    ocrText,
    date: get("date"),
    registrationNumber: regNumMatch ? regNumMatch[0] : "",
    amount: get("amount"),
    tax: get("tax"),
    memo: get("memo"),
  };
}

type PageMedia =
  | { type: "image"; base64: string; mimeType: string }
  | { type: "pdf"; base64: string };

async function getPageMedia(page: {
  imagePath: string;
  imageData: Uint8Array | null;
  documentId: string;
}): Promise<PageMedia> {
  const ext = path.extname(page.imagePath).toLowerCase();
  const isPdf = ext === ".pdf";

  if (isPdf) {
    const document = await prisma.document.findUnique({
      where: { id: page.documentId },
    });
    if (!document) throw new Error("ドキュメントが見つかりません");

    const filePath = toPhysicalPath(document.filepath);
    try {
      const buffer = await readFile(filePath);
      return { type: "pdf", base64: buffer.toString("base64") };
    } catch {
      // ディスクにない場合、DBから復元
    }
    if (!document.fileData) throw new Error("PDFデータが見つかりません");
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, Buffer.from(document.fileData));
    const buffer = await readFile(filePath);
    return { type: "pdf", base64: buffer.toString("base64") };
  }

  const physicalPath = toPhysicalPath(page.imagePath);
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };

  try {
    const buffer = await readFile(physicalPath);
    return { type: "image", base64: buffer.toString("base64"), mimeType: mimeMap[ext] || "image/jpeg" };
  } catch {
    // ディスクにない場合
  }

  if (!page.imageData) throw new Error("画像データが見つかりません");
  const dir = path.dirname(physicalPath);
  await mkdir(dir, { recursive: true });
  await writeFile(physicalPath, Buffer.from(page.imageData));
  const buffer = await readFile(physicalPath);
  return { type: "image", base64: buffer.toString("base64"), mimeType: mimeMap[ext] || "image/jpeg" };
}

export async function POST(request: NextRequest) {
  try {
    const { pageId } = await request.json();

    if (!pageId) {
      return NextResponse.json({ error: "pageId が必要です" }, { status: 400 });
    }

    const page = await prisma.documentPage.findUnique({
      where: { id: pageId },
    });

    if (!page) {
      return NextResponse.json({ error: "ページが見つかりません" }, { status: 404 });
    }

    const media = await getPageMedia({
      imagePath: page.imagePath,
      imageData: page.imageData,
      documentId: page.documentId,
    });

    const ai = getGeminiClient();

    const mediaPart =
      media.type === "pdf"
        ? { inlineData: { mimeType: "application/pdf", data: media.base64 } }
        : { inlineData: { mimeType: media.mimeType, data: media.base64 } };

    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            mediaPart,
            { text: "この書類のテキストを読み取り、構造化データを抽出してください。" },
          ],
        },
      ],
      config: {
        systemInstruction: OCR_SYSTEM_PROMPT,
        maxOutputTokens: 16384,
      },
    });

    const result = parseOcrResponse(response.text || "テキストなし");

    return NextResponse.json({
      ocrText: result.ocrText,
      date: result.date,
      registrationNumber: result.registrationNumber,
      amount: result.amount,
      tax: result.tax,
      memo: result.memo,
    });
  } catch (error) {
    console.error("Reread all error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "全項目の再読み取りに失敗しました", detail },
      { status: 500 }
    );
  }
}
