import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import { mkdir, readFile, copyFile, writeFile } from "fs/promises";
import { getUploadBaseDir, toPhysicalPath } from "@/lib/storage";
import { getOpenAIClient, OCR_MODEL } from "@/lib/openai";

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
  "registrationNumber: （適格請求書発行事業者登録番号、T始まり13桁。見つからない場合は空欄）\n" +
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
  return {
    ocrText,
    date: get("date"),
    registrationNumber: get("registrationNumber"),
    amount: get("amount"),
    tax: get("tax"),
    memo: get("memo"),
  };
}

async function ocrPdf(pdfBuffer: Buffer): Promise<OcrResult> {
  const client = getOpenAIClient();
  const base64 = pdfBuffer.toString("base64");
  const response = await client.chat.completions.create({
    model: OCR_MODEL,
    max_tokens: 16384,
    messages: [
      { role: "system", content: OCR_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "file", file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${base64}` } } as never,
          { type: "text", text: "このPDFのテキストを読み取り、構造化データを抽出してください。" },
        ],
      },
    ],
  });
  return parseOcrResponse(response.choices[0]?.message?.content || "テキストなし");
}

async function ocrImage(imagePath: string): Promise<OcrResult> {
  const client = getOpenAIClient();
  const { base64, mimeType } = await imageToBase64(imagePath);
  const response = await client.chat.completions.create({
    model: OCR_MODEL,
    max_tokens: 4096,
    messages: [
      { role: "system", content: OCR_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: "text", text: "この画像のテキストを読み取り、構造化データを抽出してください。" },
        ],
      },
    ],
  });
  return parseOcrResponse(response.choices[0]?.message?.content || "テキストなし");
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
      // === PDF: OpenAIに直接送信（1回のAPI呼び出し） ===
      const pdfBuffer = await readFile(filePath);
      result = await ocrPdf(pdfBuffer);
      imagePath = document.filepath; // iframeで元PDFを表示するのでプレースホルダー不要
    } else {
      // === 画像: Vision APIでOCR ===
      const imagesDir = path.join(getUploadBaseDir(), "pages", documentId);
      await mkdir(imagesDir, { recursive: true });

      let fullImagePath: string;

      if (document.fileType === "heic" || document.fileType === "heif") {
        const convert = (await import("heic-convert")).default;
        const heicBuffer = await readFile(filePath);
        const jpegData = await convert({ buffer: new Uint8Array(heicBuffer), format: "JPEG", quality: 0.95 });
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
