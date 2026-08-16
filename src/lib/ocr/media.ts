/**
 * OCRに渡すメディア（画像／PDF）の読み込み。
 *
 * 以前は ocr/route.ts の imageToBase64/ensureFileOnDisk と、
 * reread-all / reread-field に逐語コピーされた getPageMedia の3系統に分かれており、
 * MIME マップも3つあって .heic/.heif を含むのは1つだけ、という状態だった。
 */

import path from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { toPhysicalPath } from "@/lib/storage";

export interface LoadedMedia {
  kind: "image" | "pdf";
  base64: string;
  mimeType: string;
  bytes: number;
}

/**
 * インラインで送れるファイルサイズの上限。
 *
 * Gemini はリクエスト全体で20MBまで（base64化で約1.37倍に膨らむ点に注意）、
 * OpenAI は1ファイル50MBまで。厳しい方に合わせて18MBとする。
 * これを超えるとプロバイダ側で弾かれるため、その前に日本語のエラーを返す。
 * PM2 の max_memory_restart が 400MB である点でも、これ以上の巨大ファイルは通すべきでない。
 */
export const MAX_MEDIA_BYTES = 18 * 1024 * 1024;

/**
 * 1つのPDFから処理する最大ページ数。
 *
 * ページごとにAI呼び出しが発生し、1ページあたり数秒かかる。
 * OCRルートの maxDuration が60秒のため、その範囲に収まる値にしている。
 * 超過分を黙って切り捨てると仕訳が欠落するので、上限を超えたらエラーにする。
 */
export const MAX_PDF_PAGES = 10;

export const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
};

export function mimeTypeForPath(filePath: string): string {
  return MIME_MAP[path.extname(filePath).toLowerCase()] || "image/jpeg";
}

function assertSize(bytes: number): void {
  if (bytes > MAX_MEDIA_BYTES) {
    const mb = (bytes / 1024 / 1024).toFixed(1);
    const limit = Math.floor(MAX_MEDIA_BYTES / 1024 / 1024);
    throw new Error(
      `ファイルサイズが大きすぎます（${mb}MB / 上限${limit}MB）。圧縮してから再度アップロードしてください`
    );
  }
}

export function mediaFromBuffer(buffer: Buffer, mimeType: string): LoadedMedia {
  assertSize(buffer.byteLength);
  return {
    kind: mimeType === "application/pdf" ? "pdf" : "image",
    base64: buffer.toString("base64"),
    mimeType,
    bytes: buffer.byteLength,
  };
}

/** ディスク上のファイルを LoadedMedia として読み込む（MIMEは拡張子から判定） */
export async function loadMediaFromPath(filePath: string): Promise<LoadedMedia> {
  const buffer = await readFile(filePath);
  return mediaFromBuffer(buffer, mimeTypeForPath(filePath));
}

/**
 * ファイルをディスク上に確保する。無ければDBのバイナリから復元する。
 * （Vercel では /tmp、VPS では public/uploads 配下）
 */
export async function ensureFileOnDisk(document: {
  filepath: string;
  fileData: Uint8Array | null;
}): Promise<string> {
  const filePath = toPhysicalPath(document.filepath);
  try {
    await readFile(filePath);
    return filePath;
  } catch {
    // ディスクに無い → DBから復元
  }
  if (!document.fileData) {
    throw new Error("ファイルデータがDBに保存されていません");
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(document.fileData));
  return filePath;
}

/** heic-convert をタイムアウト付きで実行（メモリ爆発・ハング防止） */
export async function convertHeicWithTimeout(
  heicBuffer: Buffer,
  timeoutMs = 15_000
): Promise<Buffer> {
  const convert = (await import("heic-convert")).default;
  const result = await Promise.race([
    convert({
      buffer: new Uint8Array(heicBuffer) as unknown as ArrayBuffer,
      format: "JPEG",
      quality: 0.95,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("HEIC conversion timeout")), timeoutMs)
    ),
  ]);
  return Buffer.from(result as ArrayBuffer);
}

/**
 * PDFを1ページずつの単一ページPDFに分割する。
 *
 * 領収書を束ねてスキャンした複数ページPDFについて、AIに「ページごとに分けて返して」と
 * 指示するだけでは分割が安定しない（空要素を返したり、全ページ分のテキストを
 * 1要素に詰め込んだりする）。ページ分割は決定的にサーバー側で行う。
 *
 * 単一ページPDFや画像の場合は分割せず、元のメディアをそのまま1件返す。
 */
export async function splitPdfPages(media: LoadedMedia): Promise<LoadedMedia[]> {
  if (media.kind !== "pdf") return [media];

  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(Buffer.from(media.base64, "base64"), {
    ignoreEncryption: true,
  });
  const pageCount = source.getPageCount();
  if (pageCount <= 1) return [media];

  // 切り捨てると仕訳が欠落するため、上限超過は処理せずエラーにする
  if (pageCount > MAX_PDF_PAGES) {
    throw new Error(
      `PDFのページ数が多すぎます（${pageCount}ページ / 上限${MAX_PDF_PAGES}ページ）。ファイルを分けてアップロードしてください`
    );
  }

  const result: LoadedMedia[] = [];
  for (let i = 0; i < pageCount; i++) {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(source, [i]);
    single.addPage(copied);
    const bytes = await single.save();
    result.push(mediaFromBuffer(Buffer.from(bytes), "application/pdf"));
  }
  return result;
}

/**
 * 既存のDocumentPageからメディアを読み込む（再読み取り系で使用）。
 *
 * ## ページ自身のファイルがあればそれを読む
 *
 * 複数ページPDFは取り込み時に1ページずつのPDFへ分けて保存している。
 * **そのページだけをAIに渡せる。** 分けていなかった頃は元の全ページを
 * 渡していたので、2ページ目の項目を読み直したいのに3ページ分が渡っていた。
 *
 * 分割前に取り込んだ古い行は `imagePath` が元のPDFを指しているので、
 * 従来どおり元のPDFを読む（そちらは全ページ渡しのまま）。
 */
export async function loadPageMedia(page: {
  imagePath: string;
  imageData: Uint8Array | null;
  documentId: string;
}): Promise<LoadedMedia> {
  const isPdf = path.extname(page.imagePath).toLowerCase() === ".pdf";
  const isOwnPageFile = page.imagePath.startsWith("/uploads/pages/");

  if (isPdf && isOwnPageFile) {
    const physicalPath = toPhysicalPath(page.imagePath);
    try {
      return mediaFromBuffer(await readFile(physicalPath), "application/pdf");
    } catch {
      // ディスクに無い → DBから復元
    }
    if (page.imageData) {
      await mkdir(path.dirname(physicalPath), { recursive: true });
      await writeFile(physicalPath, Buffer.from(page.imageData));
      return mediaFromBuffer(await readFile(physicalPath), "application/pdf");
    }
    // どちらも無ければ、元のPDF（全ページ）に落とす
  }

  if (isPdf) {
    const document = await prisma.document.findUnique({
      where: { id: page.documentId },
      select: { filepath: true, fileData: true },
    });
    if (!document) throw new Error("ドキュメントが見つかりません");
    const filePath = await ensureFileOnDisk(document);
    const buffer = await readFile(filePath);
    return mediaFromBuffer(buffer, "application/pdf");
  }

  const physicalPath = toPhysicalPath(page.imagePath);
  try {
    const buffer = await readFile(physicalPath);
    return mediaFromBuffer(buffer, mimeTypeForPath(physicalPath));
  } catch {
    // ディスクに無い → DBから復元
  }

  if (!page.imageData) throw new Error("画像データが見つかりません");
  await mkdir(path.dirname(physicalPath), { recursive: true });
  await writeFile(physicalPath, Buffer.from(page.imageData));
  const buffer = await readFile(physicalPath);
  return mediaFromBuffer(buffer, mimeTypeForPath(physicalPath));
}
