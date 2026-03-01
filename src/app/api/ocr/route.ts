import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import { mkdir, readFile, copyFile, writeFile } from "fs/promises";
import { getUploadBaseDir, toPhysicalPath } from "@/lib/storage";
import { getGeminiClient, OCR_MODEL } from "@/lib/gemini";

// Vercel Pro: 60s, Hobby: 10s（プランの上限まで）
export const maxDuration = 60;

/**
 * ドキュメントのファイルデータを取得する
 */
async function ensureFileOnDisk(document: { filepath: string; fileData: Uint8Array | null }): Promise<string> {
  const filePath = toPhysicalPath(document.filepath);
  try {
    await readFile(filePath);
    return filePath;
  } catch {
    // ローカルにない場合、DBから復元
  }
  if (!document.fileData) {
    throw new Error("ファイルデータがDBに保存されていません");
  }
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, Buffer.from(document.fileData));
  return filePath;
}

async function imageToBase64(filePath: string): Promise<{ base64: string; mimeType: string }> {
  const buffer = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return { base64: buffer.toString("base64"), mimeType: mimeMap[ext] || "image/jpeg" };
}

// --- OCR + 構造化フィールド抽出（1回のAPI呼び出しで両方実行） ---

interface OcrResult {
  ocrText: string;
  date: string;
  registrationNumber: string;
  amount: string;
  tax: string;
  memo: string;
}

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

function parseOcrResponse(content: string): OcrResult {
  if (!content.includes("=== FIELDS ===")) {
    return { ocrText: content, date: "", registrationNumber: "", amount: "", tax: "", memo: "" };
  }
  const textMatch = content.match(/===\s*OCR_TEXT\s*===([\s\S]*?)===\s*FIELDS\s*===/);
  const ocrText = textMatch ? textMatch[1].trim() : content.split("=== FIELDS ===")[0].trim();
  const fieldsSection = content.split(/===\s*FIELDS\s*===/)[1] || "";
  const get = (name: string) => fieldsSection.match(new RegExp(`${name}:\\s*(.+)`))?.[1]?.trim() || "";
  // 登録番号: T + 13桁の数字のみ許容（それ以外は空）
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

const REG_NUM_RETRY_PROMPT =
  "この書類から適格請求書発行事業者の登録番号を読み取ってください。\n" +
  "登録番号のフォーマット: T + 数字13桁 = 合計14文字（例: T1234567890123）\n\n" +
  "注意:\n" +
  "- 必ず「T」で始まり、その後に数字が正確に13桁続きます\n" +
  "- 1桁でも多い・少ない場合は読み取りミスです。書類を再確認してください\n" +
  "- 「登録番号」「登録No」「T」の文字の近くに印字されていることが多いです\n" +
  "- レシートや領収書は文字がかすれたり薄くなっている場合があります。周辺の文脈から推測してください\n" +
  "- よくある誤読: 5↔6, 1↔l, 0↔O, 8↔B — 数字13桁であることを確認してください\n" +
  "- 番号のみを返してください（T + 13桁の数字）\n" +
  "- 見つからない場合は「なし」と返してください";

const MAX_REG_NUM_RETRIES = 2;

/** 登録番号が取れなかった場合、集中的に再読み取りする（最大2回） */
async function retryRegistrationNumber(
  inlineData: { mimeType: string; data: string },
): Promise<string> {
  const ai = getGeminiClient();
  for (let i = 0; i < MAX_REG_NUM_RETRIES; i++) {
    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData },
            { text: REG_NUM_RETRY_PROMPT },
          ],
        },
      ],
      config: { maxOutputTokens: 256 },
    });
    const raw = (response.text || "").trim();
    const match = raw.match(/T\d{13}/);
    if (match) return match[0];
  }
  return "";
}

async function ocrPdf(pdfBuffer: Buffer): Promise<OcrResult> {
  const ai = getGeminiClient();
  const base64 = pdfBuffer.toString("base64");
  const response = await ai.models.generateContent({
    model: OCR_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: base64 } },
          { text: "このPDFのテキストを読み取り、構造化データを抽出してください。" },
        ],
      },
    ],
    config: {
      systemInstruction: OCR_SYSTEM_PROMPT,
      maxOutputTokens: 16384,
    },
  });
  const result = parseOcrResponse(response.text || "テキストなし");
  if (!result.registrationNumber) {
    result.registrationNumber = await retryRegistrationNumber({
      mimeType: "application/pdf",
      data: base64,
    });
  }
  return result;
}

async function ocrImage(imagePath: string): Promise<OcrResult> {
  const ai = getGeminiClient();
  const { base64, mimeType } = await imageToBase64(imagePath);
  const response = await ai.models.generateContent({
    model: OCR_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: "この画像のテキストを読み取り、構造化データを抽出してください。" },
        ],
      },
    ],
    config: {
      systemInstruction: OCR_SYSTEM_PROMPT,
      maxOutputTokens: 4096,
    },
  });
  const result = parseOcrResponse(response.text || "テキストなし");
  if (!result.registrationNumber) {
    result.registrationNumber = await retryRegistrationNumber({
      mimeType,
      data: base64,
    });
  }
  return result;
}

export async function POST(request: NextRequest) {
  let documentId: string | undefined;

  try {
    const body = await request.json();
    documentId = body.documentId;

    if (!documentId) {
      return NextResponse.json({ error: "ドキュメントIDが必要です", code: "OCR_NO_DOCUMENT_ID" }, { status: 400 });
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: "ドキュメントが見つかりません", code: "OCR_DOCUMENT_NOT_FOUND" }, { status: 404 });
    }

    // 既にOCRページが存在する場合はスキップ（重複防止）
    const existingPages = await prisma.documentPage.count({ where: { documentId } });
    if (existingPages > 0) {
      await prisma.document.update({ where: { id: documentId }, data: { status: "ocr_complete" } });
      const pages = await prisma.documentPage.findMany({ where: { documentId }, orderBy: { pageNumber: "asc" } });
      return NextResponse.json({ pages });
    }

    // ステータスを処理中に更新
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "ocr_processing" },
    });

    // ファイルをディスク上に確保（DBから復元する場合あり）
    const filePath = await ensureFileOnDisk({
      filepath: document.filepath,
      fileData: document.fileData,
    });

    let result: OcrResult;
    let imagePath: string;
    let imageData: Uint8Array<ArrayBuffer> | null = null;

    if (document.fileType === "pdf") {
      // === PDF: Geminiに直接送信（1回のAPI呼び出し） ===
      const pdfBuffer = await readFile(filePath);
      result = await ocrPdf(pdfBuffer);
      imagePath = document.filepath; // iframeで元PDFを表示するのでプレースホルダー不要
    } else {
      // === 画像: Gemini Vision でOCR ===
      const imagesDir = path.join(getUploadBaseDir(), "pages", documentId);
      await mkdir(imagesDir, { recursive: true });

      let fullImagePath: string;

      if (document.fileType === "heic" || document.fileType === "heif") {
        const convert = (await import("heic-convert")).default;
        const heicBuffer = await readFile(filePath);
        const jpegData = await convert({ buffer: new Uint8Array(heicBuffer) as unknown as ArrayBuffer, format: "JPEG", quality: 0.95 });
        const destPath = path.join(imagesDir, "page_1.jpg");
        await writeFile(destPath, Buffer.from(jpegData as ArrayBuffer));
        fullImagePath = destPath;
        imagePath = `/uploads/pages/${documentId}/page_1.jpg`;
      } else {
        const ext = path.extname(document.filename) || `.${document.fileType}`;
        const destPath = path.join(imagesDir, `page_1${ext}`);
        await copyFile(filePath, destPath);
        fullImagePath = destPath;
        imagePath = `/uploads/pages/${documentId}/page_1${ext}`;
      }

      result = await ocrImage(fullImagePath);

      try {
        const buf = await readFile(fullImagePath);
        imageData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      } catch { /* ignore */ }
    }

    const page = await prisma.documentPage.create({
      data: {
        documentId,
        pageNumber: 1,
        imagePath,
        imageData,
        ocrText: result.ocrText,
        correctedText: result.ocrText,
        date: result.date,
        registrationNumber: result.registrationNumber,
        amount: result.amount,
        tax: result.tax,
        memo: result.memo,
      },
    });

    await prisma.document.update({
      where: { id: documentId },
      data: { status: "ocr_complete" },
    });

    return NextResponse.json({ pages: [page] });
  } catch (error) {
    console.error("OCR error:", error);

    // エラー時はステータスをリセットしてリトライ可能にする
    if (documentId) {
      try {
        await prisma.document.update({
          where: { id: documentId },
          data: { status: "uploaded" },
        });
      } catch { /* ignore */ }
    }

    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "OCR処理に失敗しました", code: "OCR_FAILED", detail }, { status: 500 });
  }
}
