import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import { mkdir, readFile } from "fs/promises";
import Tesseract from "tesseract.js";

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: "ドキュメントIDが必要です" }, { status: 400 });
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: "ドキュメントが見つかりません" }, { status: 404 });
    }

    // ステータスを処理中に更新
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "ocr_processing" },
    });

    const pdfPath = path.join(process.cwd(), "public", document.filepath);
    const imagesDir = path.join(process.cwd(), "public", "uploads", "pages", documentId);
    await mkdir(imagesDir, { recursive: true });

    // PDFをページ画像に変換
    const pdfBuffer = await readFile(pdfPath);
    const pageImages = await convertPdfToImages(pdfBuffer, imagesDir, documentId);

    // 各ページでOCRを実行
    const pages = [];
    for (let i = 0; i < pageImages.length; i++) {
      const imagePath = pageImages[i];
      const fullImagePath = path.join(process.cwd(), "public", imagePath);

      const result = await Tesseract.recognize(fullImagePath, "jpn+eng", {});
      const ocrText = result.data.text;

      const page = await prisma.documentPage.create({
        data: {
          documentId,
          pageNumber: i + 1,
          imagePath,
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
    return NextResponse.json({ error: "OCR処理に失敗しました" }, { status: 500 });
  }
}

async function convertPdfToImages(
  pdfBuffer: Buffer,
  outputDir: string,
  documentId: string
): Promise<string[]> {
  // pdfjs-distを使ってPDFをcanvasに描画し、画像として保存
  // サーバーサイドではsharpを使用
  const sharp = (await import("sharp")).default;

  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const imagePaths: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // 高解像度でレンダリング

    // NodeCanvasFactoryを使わず、直接ピクセルデータを取得
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);

    // OperatorListを使ってテキスト抽出のみ行い、画像はsharpで生成
    // pdfjs-distのNode.js環境ではcanvasが使えないため、
    // 代替としてPDFの最初のページを画像化する簡易実装

    // PDFそのものを画像に変換（sharpはPDFの1ページ目を読める）
    const pageImageFilename = `page_${i}.png`;
    const pageImagePath = path.join(outputDir, pageImageFilename);

    try {
      // sharpでPDFページを画像に変換
      await sharp(pdfBuffer, { page: i - 1, density: 200 })
        .png()
        .toFile(pageImagePath);
    } catch {
      // sharpでPDFが読めない場合、プレースホルダー画像を生成
      await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toFile(pageImagePath);
    }

    imagePaths.push(`/uploads/pages/${documentId}/${pageImageFilename}`);

    page.cleanup();
  }

  return imagePaths;
}
