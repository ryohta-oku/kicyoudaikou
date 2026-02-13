import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import { mkdir, readFile, copyFile, writeFile } from "fs/promises";
import { getUploadBaseDir, toPhysicalPath } from "@/lib/storage";
import { getOpenAIClient, OCR_MODEL } from "@/lib/openai";

/**
 * ドキュメントのファイルデータを取得する
 * まずローカルファイルシステムを確認し、なければDBから取得して/tmpに書き出す
 */
async function ensureFileOnDisk(document: { filepath: string; fileData: Uint8Array | null }): Promise<string> {
  const filePath = toPhysicalPath(document.filepath);

  // ローカルに存在するか確認
  try {
    await readFile(filePath);
    return filePath;
  } catch {
    // ローカルにない場合、DBから復元
  }

  if (!document.fileData) {
    throw new Error("ファイルデータがDBに保存されていません");
  }

  // DBのデータを/tmpに書き出し
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, Buffer.from(document.fileData));
  return filePath;
}

/**
 * 画像ファイルをbase64エンコードして返す
 */
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
  const mimeType = mimeMap[ext] || "image/jpeg";
  return { base64: buffer.toString("base64"), mimeType };
}

/**
 * GPT-4o mini Vision で画像からテキストを読み取る
 */
async function ocrWithVision(imagePath: string): Promise<string> {
  const client = getOpenAIClient();
  const { base64, mimeType } = await imageToBase64(imagePath);

  const response = await client.chat.completions.create({
    model: OCR_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "あなたはOCR（光学文字認識）の専門家です。画像に含まれるテキストをすべて正確に読み取ってください。" +
          "レイアウトをできるだけ維持し、日本語・英語・数字を正確に読み取ってください。" +
          "金額、日付、店名、品目などの情報は特に正確に読み取ってください。" +
          "画像にテキストが見つからない場合は「テキストなし」と返してください。",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
            },
          },
          {
            type: "text",
            text: "この画像に含まれるすべてのテキストを読み取ってください。",
          },
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content || "テキストなし";
}

/**
 * PDFのページ数を簡易的に取得する（バイナリ解析）
 */
function getPdfPageCount(buffer: Buffer): number {
  const str = buffer.toString("binary");
  const match = str.match(/\/Type\s*\/Pages[^]*?\/Count\s+(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * PDFをOpenAIに直接送信してOCR処理する（Vercel対応）
 */
async function ocrPdfDirect(pdfBuffer: Buffer, pageCount: number): Promise<string[]> {
  const client = getOpenAIClient();
  const base64 = pdfBuffer.toString("base64");

  const pageInstruction = pageCount > 1
    ? `このPDFは${pageCount}ページあります。各ページのテキストを「--- ページ 1 ---」「--- ページ 2 ---」のように区切って出力してください。`
    : "このPDFに含まれるすべてのテキストを読み取ってください。";

  const response = await client.chat.completions.create({
    model: OCR_MODEL,
    max_tokens: 16384,
    messages: [
      {
        role: "system",
        content:
          "あなたはOCR（光学文字認識）の専門家です。PDFに含まれるテキストをすべて正確に読み取ってください。" +
          "レイアウトをできるだけ維持し、日本語・英語・数字を正確に読み取ってください。" +
          "金額、日付、店名、品目などの情報は特に正確に読み取ってください。" +
          "テキストが見つからない場合は「テキストなし」と返してください。",
      },
      {
        role: "user",
        content: [
          {
            type: "file",
            file: {
              filename: "document.pdf",
              file_data: `data:application/pdf;base64,${base64}`,
            },
          } as never,
          {
            type: "text",
            text: pageInstruction,
          },
        ],
      },
    ],
  });

  const fullText = response.choices[0]?.message?.content || "テキストなし";

  if (pageCount <= 1) {
    return [fullText];
  }

  // ページ区切りでテキストを分割
  const parts = fullText.split(/---\s*ページ\s*\d+\s*---/).filter((t) => t.trim());
  if (parts.length >= pageCount) {
    return parts.map((t) => t.trim());
  }

  // 区切りがうまくいかなかった場合、全テキストを1ページとして返す
  return [fullText];
}

interface ExtractedFields {
  date: string;
  registrationNumber: string;
  amount: string;
  tax: string;
  memo: string;
}

/**
 * OCRテキストから構造化フィールドをAIで抽出する
 */
async function extractStructuredFields(ocrText: string): Promise<ExtractedFields> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: OCR_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "あなたは経理書類の解析専門家です。OCRテキストから以下の情報を正確に抽出してJSON形式で返してください。\n" +
          "- date: 日付（YYYY-MM-DD形式、見つからない場合は空文字）\n" +
          "- registrationNumber: 適格請求書発行事業者登録番号（Tから始まる番号、見つからない場合は空文字）\n" +
          "- amount: 金額・税込合計（数字のみ、見つからない場合は空文字）\n" +
          "- tax: 消費税額（数字のみ、見つからない場合は空文字）\n" +
          "- memo: 取引先名・品目・摘要など、要約メモ（簡潔に）\n\n" +
          "必ず有効なJSONのみを返してください。マークダウンや説明文は不要です。",
      },
      {
        role: "user",
        content: ocrText,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "{}";
  try {
    const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      date: String(parsed.date || ""),
      registrationNumber: String(parsed.registrationNumber || ""),
      amount: String(parsed.amount || ""),
      tax: String(parsed.tax || ""),
      memo: String(parsed.memo || ""),
    };
  } catch {
    return { date: "", registrationNumber: "", amount: "", tax: "", memo: "" };
  }
}

/**
 * プレースホルダー画像を作成する（PDF用）
 */
async function createPlaceholderImage(
  outputPath: string,
  pageNumber: number
): Promise<void> {
  const sharp = (await import("sharp")).default;

  // SVGでページ番号入りのプレースホルダーを作成
  const svg = `<svg width="800" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="1100" fill="#f3f4f6"/>
    <text x="400" y="520" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#6b7280">PDF ページ ${pageNumber}</text>
    <text x="400" y="570" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#9ca3af">OCRテキストは右側に表示されます</text>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: "ドキュメントIDが必要です", code: "OCR_NO_DOCUMENT_ID" }, { status: 400 });
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: "ドキュメントが見つかりません", code: "OCR_DOCUMENT_NOT_FOUND" }, { status: 404 });
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

    const imagesDir = path.join(getUploadBaseDir(), "pages", documentId);
    await mkdir(imagesDir, { recursive: true });

    const pages = [];

    if (document.fileType === "pdf") {
      // === PDF処理: OpenAIに直接送信 ===
      const pdfBuffer = await readFile(filePath);
      const pageCount = getPdfPageCount(pdfBuffer);
      const ocrTexts = await ocrPdfDirect(pdfBuffer, pageCount);

      for (let i = 0; i < ocrTexts.length; i++) {
        const pageImageFilename = `page_${i + 1}.png`;
        const pageImagePath = path.join(imagesDir, pageImageFilename);
        const imagePath = `/uploads/pages/${documentId}/${pageImageFilename}`;

        // プレースホルダー画像を作成
        await createPlaceholderImage(pageImagePath, i + 1);

        let imageData: Uint8Array<ArrayBuffer> | null = null;
        try {
          const buf = await readFile(pageImagePath);
          imageData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        } catch {
          // 画像データの読み取りに失敗しても続行
        }

        // 構造化フィールドを抽出
        const fields = await extractStructuredFields(ocrTexts[i]);

        const page = await prisma.documentPage.create({
          data: {
            documentId,
            pageNumber: i + 1,
            imagePath,
            imageData,
            ocrText: ocrTexts[i],
            correctedText: ocrTexts[i],
            ...fields,
          },
        });

        pages.push(page);
      }
    } else {
      // === 画像処理: 従来のVision OCR ===
      let pageImages: string[];

      if (document.fileType === "heic" || document.fileType === "heif") {
        // HEIC/HEIF: heic-convertでJPEGに変換（Vercel対応）
        const convert = (await import("heic-convert")).default;
        const heicBuffer = await readFile(filePath);
        const jpegData = await convert({
          buffer: heicBuffer.buffer as ArrayBuffer,
          format: "JPEG",
          quality: 0.95,
        });
        const pageImageFilename = "page_1.jpg";
        const destPath = path.join(imagesDir, pageImageFilename);
        await writeFile(destPath, Buffer.from(jpegData));
        pageImages = [`/uploads/pages/${documentId}/${pageImageFilename}`];
      } else {
        const ext = path.extname(document.filename) || `.${document.fileType}`;
        const pageImageFilename = `page_1${ext}`;
        const destPath = path.join(imagesDir, pageImageFilename);
        await copyFile(filePath, destPath);
        pageImages = [`/uploads/pages/${documentId}/${pageImageFilename}`];
      }

      for (let i = 0; i < pageImages.length; i++) {
        const imagePath = pageImages[i];
        const fullImagePath = toPhysicalPath(imagePath);

        const ocrText = await ocrWithVision(fullImagePath);

        let imageData: Uint8Array<ArrayBuffer> | null = null;
        try {
          const buf = await readFile(fullImagePath);
          imageData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        } catch {
          // 画像データの読み取りに失敗しても続行
        }

        // 構造化フィールドを抽出
        const fields = await extractStructuredFields(ocrText);

        const page = await prisma.documentPage.create({
          data: {
            documentId,
            pageNumber: i + 1,
            imagePath,
            imageData,
            ocrText,
            correctedText: ocrText,
            ...fields,
          },
        });

        pages.push(page);
      }
    }

    // ステータスをOCR完了に更新
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "ocr_complete" },
    });

    return NextResponse.json({ pages });
  } catch (error) {
    console.error("OCR error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "OCR処理に失敗しました", code: "OCR_FAILED", detail }, { status: 500 });
  }
}
