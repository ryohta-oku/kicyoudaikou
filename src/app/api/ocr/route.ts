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

    let pageImages: string[];

    if (document.fileType === "pdf") {
      // PDFをページ画像に変換
      const pdfBuffer = await readFile(filePath);
      pageImages = await convertPdfToImages(pdfBuffer, imagesDir, documentId);
    } else if (document.fileType === "heic" || document.fileType === "heif") {
      // HEIC/HEIFの場合: sharpでJPEGに変換してからOCR
      const sharp = (await import("sharp")).default;
      const pageImageFilename = "page_1.jpg";
      const destPath = path.join(imagesDir, pageImageFilename);
      await sharp(filePath).jpeg({ quality: 95 }).toFile(destPath);
      pageImages = [`/uploads/pages/${documentId}/${pageImageFilename}`];
    } else {
      // その他の画像ファイルの場合: pagesディレクトリにコピーして1ページとして扱う
      const ext = path.extname(document.filename) || `.${document.fileType}`;
      const pageImageFilename = `page_1${ext}`;
      const destPath = path.join(imagesDir, pageImageFilename);
      await copyFile(filePath, destPath);
      pageImages = [`/uploads/pages/${documentId}/${pageImageFilename}`];
    }

    // 各ページでGPT-4o mini Vision OCRを実行
    const pages = [];
    for (let i = 0; i < pageImages.length; i++) {
      const imagePath = pageImages[i];
      const fullImagePath = toPhysicalPath(imagePath);

      // GPT-4o mini Vision でOCR
      const ocrText = await ocrWithVision(fullImagePath);

      // ページ画像のバイナリデータを読み取り
      let imageData: Uint8Array<ArrayBuffer> | null = null;
      try {
        const buf = await readFile(fullImagePath);
        imageData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      } catch {
        // 画像データの読み取りに失敗しても続行
      }

      const page = await prisma.documentPage.create({
        data: {
          documentId,
          pageNumber: i + 1,
          imagePath,
          imageData,
          ocrText,
          correctedText: ocrText,
        },
      });

      pages.push(page);
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

async function convertPdfToImages(
  pdfBuffer: Buffer,
  outputDir: string,
  documentId: string
): Promise<string[]> {
  const sharp = (await import("sharp")).default;

  // sharpのmetadataでPDFのページ数を取得
  const metadata = await sharp(pdfBuffer, { density: 200 }).metadata();
  const numPages = metadata.pages || 1;

  const imagePaths: string[] = [];

  for (let i = 0; i < numPages; i++) {
    const pageImageFilename = `page_${i + 1}.png`;
    const pageImagePath = path.join(outputDir, pageImageFilename);

    await sharp(pdfBuffer, { page: i, density: 200 })
      .png()
      .toFile(pageImagePath);

    imagePaths.push(`/uploads/pages/${documentId}/${pageImageFilename}`);
  }

  return imagePaths;
}
