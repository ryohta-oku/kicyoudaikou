import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import { mkdir, readFile, copyFile, writeFile } from "fs/promises";
import { getUploadBaseDir } from "@/lib/storage";
import { runFieldReread, runOcr } from "@/lib/ai";
import {
  convertHeicWithTimeout,
  ensureFileOnDisk,
  loadMediaFromPath,
  mediaFromBuffer,
  splitPdfPages,
  type LoadedMedia,
} from "@/lib/ocr/media";
import { normalizeRegistrationNumber, type OcrFields } from "@/lib/ocr/schema";

// Vercel Pro: 60s, Hobby: 10s（プランの上限まで）
export const maxDuration = 60;

/** PDFは1ドキュメント丸ごと1回で読む。画像より出力が長くなるため上限を大きく取る */
const PDF_MAX_OUTPUT_TOKENS = 16384;
const IMAGE_MAX_OUTPUT_TOKENS = 4096;

const MAX_REG_NUM_RETRIES = 2;

/**
 * 登録番号が取れなかった場合、集中的に再読み取りする（最大2回）。
 *
 * 注: 1書類あたり最大2回の追加API呼び出しになる。実務では「T番号の有無」しか
 * 確認しないため過剰との指摘があり、国税庁APIでの検証に置き換える案が別途ある。
 */
async function retryRegistrationNumber(media: LoadedMedia): Promise<string> {
  for (let i = 0; i < MAX_REG_NUM_RETRIES; i++) {
    try {
      const result = await runFieldReread(media, "registrationNumber");
      const value = normalizeRegistrationNumber(result.text);
      if (value) return value;
    } catch (error) {
      console.error("登録番号の再読み取りに失敗:", error);
      return "";
    }
  }
  return "";
}

export async function POST(request: NextRequest) {
  let documentId: string | undefined;

  try {
    const body = await request.json();
    documentId = body.documentId;

    if (!documentId) {
      return NextResponse.json({ error: "ドキュメントIDが必要です", code: "OCR_NO_DOCUMENT_ID" }, { status: 400 });
    }

    let document = await prisma.document.findUnique({
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

    // ページごとの読み取り結果。1ページの書類なら要素数1。
    let ocrPages!: OcrFields[];
    let imagePath!: string;
    let imageData: Uint8Array<ArrayBuffer> | null = null;
    /**
     * 複数ページPDFを1ページずつのPDFとして保存したときの、ページごとのファイル。
     *
     * **1ページ＝1レシート＝1ファイル**にしておくと、あとで
     * 「元のPDFの何ページ目か」を数えなくてよくなる。
     */
    let pdfPageFiles: { imagePath: string; data: Uint8Array<ArrayBuffer> }[] = [];

    if (document.fileType === "pdf") {
      // === PDF: そのままAIに送信（1回のAPI呼び出し） ===
      const pdfBuffer = await readFile(filePath);
      // PDFマジックバイト（%PDF）を検証
      const isPdf = pdfBuffer[0] === 0x25 && pdfBuffer[1] === 0x50 && pdfBuffer[2] === 0x44 && pdfBuffer[3] === 0x46;
      if (!isPdf) {
        // 実際にはPDFでない → ファイル形式を判別してフォールバック
        // HEIC/HEIF: offset 4 に "ftyp" シグネチャ
        const isFtyp = pdfBuffer.length > 8 &&
          pdfBuffer[4] === 0x66 && pdfBuffer[5] === 0x74 && pdfBuffer[6] === 0x79 && pdfBuffer[7] === 0x70;
        document = { ...document, fileType: isFtyp ? "heic" : "jpeg" };
      } else {
        const media = mediaFromBuffer(pdfBuffer, "application/pdf");
        // 複数ページPDFはサーバー側で1ページずつに分割してからOCRする。
        // AIにページ分割を任せると空要素を返したり全ページ分を1要素に詰めたりして安定しない。
        const pageMedias = await splitPdfPages(media);

        ocrPages = [];
        for (const pageMedia of pageMedias) {
          const fields = (await runOcr(pageMedia, PDF_MAX_OUTPUT_TOKENS)).pages[0];
          // 登録番号の再読み取りは単一ページのときだけ。
          // 複数ページではページ数×最大2回の追加呼び出しになりコストが見合わない。
          if (pageMedias.length === 1 && !fields.registrationNumber) {
            fields.registrationNumber = await retryRegistrationNumber(pageMedia);
          }
          ocrPages.push(fields);
        }

        imagePath = document.filepath;

        /*
          分割したPDFを**捨てずに残す。**

          これまでは全ページが元のPDFを指していたので、レシートを1枚見せるたびに
          「元のPDFの何ページ目か」を数える必要があった。何ページ目を選んでも
          1ページ目が出る、という不具合はそこから来ていた。

          1ページ＝1ファイルにしておけば数えなくてよい。再読み取りのときに
          そのページだけをAIに渡せるようにもなる（従来は全ページ渡していた）。

          1ページしかないPDFは分ける意味がないので、元のファイルのまま。
        */
        if (pageMedias.length > 1) {
          const pagesDir = path.join(getUploadBaseDir(), "pages", documentId);
          await mkdir(pagesDir, { recursive: true });
          for (let i = 0; i < pageMedias.length; i++) {
            const buf = Buffer.from(pageMedias[i].base64, "base64");
            const name = `page_${i + 1}.pdf`;
            await writeFile(path.join(pagesDir, name), buf);
            pdfPageFiles.push({
              imagePath: `/uploads/pages/${documentId}/${name}`,
              // ディスクが飛んでも配れるようにDBにも持つ（/api/files が拾う）
              data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
            });
          }
        }
      }
    }
    if (document.fileType !== "pdf") {
      // === 画像: Vision でOCR ===
      const imagesDir = path.join(getUploadBaseDir(), "pages", documentId);
      await mkdir(imagesDir, { recursive: true });

      let fullImagePath: string;

      if (document.fileType === "heic" || document.fileType === "heif") {
        try {
          const heicBuffer = await readFile(filePath);
          const jpegData = await convertHeicWithTimeout(heicBuffer);
          const destPath = path.join(imagesDir, "page_1.jpg");
          await writeFile(destPath, jpegData);
          fullImagePath = destPath;
          imagePath = `/uploads/pages/${documentId}/page_1.jpg`;
        } catch {
          // HEIC変換失敗/タイムアウト → 正しい拡張子でコピーしてそのまま送信
          const destPath = path.join(imagesDir, "page_1.heic");
          await copyFile(filePath, destPath);
          fullImagePath = destPath;
          imagePath = `/uploads/pages/${documentId}/page_1.heic`;
        }
      } else {
        // 拡張子は解決後の fileType から導出する。
        // document.filename から取ると、中身が画像なのに .pdf という名前のファイルで
        // ページ画像が page_1.pdf になり、再読み取り時にJPEGをPDFとして送ってしまう。
        const ext = `.${document.fileType === "jpeg" ? "jpg" : document.fileType}`;
        const destPath = path.join(imagesDir, `page_1${ext}`);
        await copyFile(filePath, destPath);
        fullImagePath = destPath;
        imagePath = `/uploads/pages/${documentId}/page_1${ext}`;
      }

      const media = await loadMediaFromPath(fullImagePath);
      // 画像は常に1ページ。複数返ってきても先頭のみ採用する。
      ocrPages = [(await runOcr(media, IMAGE_MAX_OUTPUT_TOKENS)).pages[0]];
      if (!ocrPages[0].registrationNumber) {
        ocrPages[0].registrationNumber = await retryRegistrationNumber(media);
      }

      try {
        const buf = await readFile(fullImagePath);
        imageData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      } catch { /* ignore */ }
    }

    // ページごとにDocumentPageを作る。
    // 複数ページPDFを1件にまとめると、別々の領収書の金額が合算されて
    // 誤った仕訳になるため、物理ページ単位で分ける。
    const createdPages = [];
    for (let i = 0; i < ocrPages.length; i++) {
      const fields = ocrPages[i];
      // 分割したPDFがあれば、そのページ自身のファイルを指す
      const own = pdfPageFiles[i];
      const created = await prisma.documentPage.create({
        data: {
          documentId,
          pageNumber: i + 1,
          imagePath: own?.imagePath ?? imagePath,
          // 画像データは1ページ目にのみ保持する（同じ画像の重複保存を避ける）。
          // 分割PDFはページごとに別物なので、それぞれ持つ
          imageData: own ? own.data : i === 0 ? imageData : null,
          ocrText: fields.ocrText,
          correctedText: fields.ocrText,
          date: fields.date,
          registrationNumber: fields.registrationNumber,
          amount: fields.amount,
          tax: fields.tax,
          memo: fields.memo,
        },
      });
      createdPages.push(created);
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { status: "ocr_complete" },
    });

    return NextResponse.json({ pages: createdPages });
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
