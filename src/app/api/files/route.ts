import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { toPhysicalPath } from "@/lib/storage";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

/**
 * /tmp に保存されたアップロードファイルを配信するAPIルート
 * クエリパラメータ: ?path=/uploads/xxx.pdf
 */
export async function GET(request: NextRequest) {
  try {
    const filePath = request.nextUrl.searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "パスが必要です", code: "FILE_NO_PATH" }, { status: 400 });
    }

    // パストラバーサル対策
    if (filePath.includes("..") || !filePath.startsWith("/uploads/")) {
      return NextResponse.json({ error: "無効なパスです", code: "FILE_INVALID_PATH" }, { status: 400 });
    }

    const physicalPath = toPhysicalPath(filePath);
    const buffer = await readFile(physicalPath);

    const ext = path.extname(physicalPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("File serve error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ファイルの取得に失敗しました", code: "FILE_NOT_FOUND", detail }, { status: 404 });
  }
}
