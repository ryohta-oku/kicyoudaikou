import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getUploadBaseDir } from "@/lib/storage";
import convert from "heic-convert";

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
];

// HEICはブラウザがMIMEタイプを正しく認識しないことがあるため拡張子でもチェック
const HEIC_EXTENSIONS = [".heic", ".heif"];

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.includes(file.type)) return true;
  const ext = path.extname(file.name).toLowerCase();
  return HEIC_EXTENSIONS.includes(ext);
}

function getFileType(file: File): string {
  const ext = path.extname(file.name).toLowerCase();
  if (HEIC_EXTENSIONS.includes(ext)) return "heic";
  if (file.type === "application/pdf") return "pdf";
  return file.type.replace("image/", "");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません", code: "UPLOAD_NO_FILE" }, { status: 400 });
    }

    if (!isAcceptedFile(file)) {
      return NextResponse.json(
        { error: "PDF または画像ファイル（JPEG, PNG, WebP, GIF, BMP, TIFF, HEIC）をアップロードしてください", code: "UPLOAD_INVALID_TYPE" },
        { status: 400 }
      );
    }

    const fileId = uuidv4();
    const ext = path.extname(file.name);
    const savedFilename = `${fileId}${ext}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ローカルファイルシステムにも保存（ローカル開発用＆同一リクエスト内のOCR処理用）
    try {
      const uploadDir = getUploadBaseDir();
      await mkdir(uploadDir, { recursive: true });
      const filepath = path.join(uploadDir, savedFilename);
      await writeFile(filepath, buffer);
    } catch {
      // Vercel環境では/tmp書き込み失敗しても続行（DBに保存するため）
    }

    let fileType = getFileType(file);
    const title = (formData.get("title") as string) || file.name.replace(/\.[^.]+$/, "");
    const creator = (formData.get("creator") as string) || "";
    const folderId = (formData.get("folderId") as string) || null;

    // HEIC/HEIF → JPEG 変換（ブラウザ表示・OCR互換性のため）
    let finalBuffer = buffer;
    let finalFilename = savedFilename;
    if (fileType === "heic") {
      try {
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        const jpegData = await convert({
          buffer: arrayBuffer,
          format: "JPEG",
          quality: 0.95,
        });
        finalBuffer = Buffer.from(jpegData as ArrayBuffer);
        finalFilename = `${fileId}.jpg`;
        fileType = "jpeg";

        // 変換後のJPEGをローカルに保存し直す
        try {
          const uploadDir = getUploadBaseDir();
          const filepath = path.join(uploadDir, finalFilename);
          await writeFile(filepath, finalBuffer);
        } catch {
          // Vercel環境では/tmp書き込み失敗しても続行
        }
      } catch (heicError) {
        console.error("HEIC conversion failed, saving original:", heicError);
        // 変換に失敗した場合は元のHEICファイルをそのまま保存
      }
    }

    // ファイルデータをDBに保存（Vercel環境での永続化）
    let document;
    try {
      document = await prisma.document.create({
        data: {
          filename: file.name,
          filepath: `/uploads/${finalFilename}`,
          fileType,
          fileData: finalBuffer,
          title,
          creator,
          folderId,
          status: "uploaded",
        },
      });
    } catch {
      // folderId/title/creatorカラムが未マイグレーションの場合にフォールバック
      document = await prisma.document.create({
        data: {
          filename: file.name,
          filepath: `/uploads/${savedFilename}`,
          fileType,
          fileData: finalBuffer,
          status: "uploaded",
        },
      });
    }

    return NextResponse.json({ document: { id: document.id, filename: document.filename, filepath: document.filepath, fileType: document.fileType, status: document.status } });
  } catch (error) {
    console.error("Upload error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "アップロードに失敗しました", code: "UPLOAD_FAILED", detail }, { status: 500 });
  }
}
