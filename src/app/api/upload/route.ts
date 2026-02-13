import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

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
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

    if (!isAcceptedFile(file)) {
      return NextResponse.json(
        { error: "PDF または画像ファイル（JPEG, PNG, WebP, GIF, BMP, TIFF, HEIC）をアップロードしてください" },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const fileId = uuidv4();
    const ext = path.extname(file.name);
    const savedFilename = `${fileId}${ext}`;
    const filepath = path.join(uploadDir, savedFilename);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    const fileType = getFileType(file);

    const document = await prisma.document.create({
      data: {
        filename: file.name,
        filepath: `/uploads/${savedFilename}`,
        fileType,
        status: "uploaded",
      },
    });

    return NextResponse.json({ document });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
  }
}
