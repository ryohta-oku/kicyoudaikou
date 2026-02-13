import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ページのOCRテキストを更新
export async function PATCH(request: NextRequest) {
  try {
    const { pageId, correctedText, isConfirmed, date, registrationNumber, amount, tax, memo } = await request.json();

    if (!pageId) {
      return NextResponse.json({ error: "ページIDが必要です", code: "PAGE_NO_ID" }, { status: 400 });
    }

    const page = await prisma.documentPage.update({
      where: { id: pageId },
      data: {
        ...(correctedText !== undefined && { correctedText }),
        ...(isConfirmed !== undefined && { isConfirmed }),
        ...(date !== undefined && { date }),
        ...(registrationNumber !== undefined && { registrationNumber }),
        ...(amount !== undefined && { amount }),
        ...(tax !== undefined && { tax }),
        ...(memo !== undefined && { memo }),
      },
    });

    return NextResponse.json({ page });
  } catch (error) {
    console.error("Error updating page:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ページの更新に失敗しました", code: "PAGE_UPDATE_FAILED", detail }, { status: 500 });
  }
}
