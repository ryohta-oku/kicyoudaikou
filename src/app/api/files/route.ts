import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { toPhysicalPath } from "@/lib/storage";
import { getClientScope, isFilePathAllowed } from "@/lib/advisor";
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
 * アップロードファイルを配信するAPIルート
 * まずローカルファイルシステムを確認し、なければDBから取得
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

    /*
      社外の人（税理士）には担当の得意先の証憑だけを渡す。
      ここは id ではなくパスで引く口なので、パスから書類をたどって確かめる。
      当てはまらない形のパスは渡さない（advisor.ts の判定を参照）。
    */
    const scope = await getClientScope();
    if (!scope) {
      return NextResponse.json({ error: "認証が必要です", code: "FILE_UNAUTHORIZED" }, { status: 401 });
    }
    if (!(await isFilePathAllowed(scope, filePath))) {
      return NextResponse.json({ error: "権限がありません", code: "FILE_FORBIDDEN" }, { status: 403 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // 1. ローカルファイルシステムから読み取りを試行
    try {
      const physicalPath = toPhysicalPath(filePath);
      const buffer = await readFile(physicalPath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      // ファイルがローカルにない場合、DBフォールバック
    }

    // 2. DBから取得（ページ画像の場合）
    if (filePath.startsWith("/uploads/pages/")) {
      // パス形式: /uploads/pages/{documentId}/page_N.ext
      const parts = filePath.split("/");
      // parts: ["", "uploads", "pages", documentId, "page_N.ext"]
      if (parts.length >= 5) {
        const documentId = parts[3];
        const pageFilename = parts[4];
        const pageMatch = pageFilename.match(/^page_(\d+)/);
        if (pageMatch) {
          const pageNumber = parseInt(pageMatch[1], 10);
          const page = await prisma.documentPage.findFirst({
            where: { documentId, pageNumber },
            select: { imageData: true },
          });
          if (page?.imageData) {
            return new NextResponse(page.imageData, {
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "private, max-age=3600",
              },
            });
          }
        }
      }
    }

    // 3. DBからドキュメント本体のファイルデータを取得
    const doc = await prisma.document.findFirst({
      where: { filepath: filePath },
      select: { fileData: true },
    });
    if (doc?.fileData) {
      return new NextResponse(doc.fileData, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    return NextResponse.json({ error: "ファイルが見つかりません", code: "FILE_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    console.error("File serve error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ファイルの取得に失敗しました", code: "FILE_SERVE_ERROR", detail }, { status: 500 });
  }
}
