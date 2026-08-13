import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runOcr } from "@/lib/ai";
import { loadPageMedia } from "@/lib/ocr/media";

export const maxDuration = 60;

/** 既存ページの再読み取りは元がPDFの場合もあるため上限を大きく取る */
const MAX_OUTPUT_TOKENS = 16384;

export async function POST(request: NextRequest) {
  try {
    const { pageId } = await request.json();

    if (!pageId) {
      return NextResponse.json({ error: "pageId が必要です" }, { status: 400 });
    }

    const page = await prisma.documentPage.findUnique({
      where: { id: pageId },
    });

    if (!page) {
      return NextResponse.json({ error: "ページが見つかりません" }, { status: 404 });
    }

    const media = await loadPageMedia({
      imagePath: page.imagePath,
      imageData: page.imageData,
      documentId: page.documentId,
    });

    // 複数ページPDFの場合、メディアは書類全体なので該当ページを選ぶ必要がある。
    // 画像ページや単一ページPDFでは pages[0] が対象。
    const { pages } = await runOcr(media, MAX_OUTPUT_TOKENS);
    const fields = pages[page.pageNumber - 1] ?? pages[0];

    return NextResponse.json({
      ocrText: fields.ocrText,
      date: fields.date,
      registrationNumber: fields.registrationNumber,
      amount: fields.amount,
      tax: fields.tax,
      memo: fields.memo,
    });
  } catch (error) {
    console.error("Reread all error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "全項目の再読み取りに失敗しました", detail },
      { status: 500 }
    );
  }
}
