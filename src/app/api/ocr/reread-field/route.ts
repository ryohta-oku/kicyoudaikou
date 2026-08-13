import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runFieldReread } from "@/lib/ai";
import { loadPageMedia } from "@/lib/ocr/media";
import { FIELD_PROMPTS } from "@/lib/ocr/prompts";
import { normalizeRegistrationNumber } from "@/lib/ocr/schema";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { pageId, fieldName } = await request.json();

    if (!pageId || !fieldName) {
      return NextResponse.json(
        { error: "pageId と fieldName が必要です" },
        { status: 400 }
      );
    }

    if (!FIELD_PROMPTS[fieldName]) {
      return NextResponse.json(
        { error: `未対応のフィールド: ${fieldName}` },
        { status: 400 }
      );
    }

    const page = await prisma.documentPage.findUnique({
      where: { id: pageId },
    });

    if (!page) {
      return NextResponse.json(
        { error: "ページが見つかりません" },
        { status: 404 }
      );
    }

    const media = await loadPageMedia({
      imagePath: page.imagePath,
      imageData: page.imageData,
      documentId: page.documentId,
    });

    // 複数ページPDFでは対象ページを明示しないと1ページ目の値が返ってしまう
    const result = await runFieldReread(media, fieldName, {
      pageNumber: page.pageNumber,
    });
    const raw = result.text.trim();

    // 登録番号は T + 13桁の数字パターンのみ許容（それ以外は空）
    const value =
      fieldName === "registrationNumber" ? normalizeRegistrationNumber(raw) : raw;

    return NextResponse.json({ value, raw });
  } catch (error) {
    console.error("Reread field error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "再読み取りに失敗しました", detail },
      { status: 500 }
    );
  }
}
