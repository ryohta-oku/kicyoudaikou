import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";

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

    // WorkLog: OCR確認完了を記録
    if (isConfirmed === true) {
      try {
        const userSession = await auth();
        if (userSession?.user) {
          const effectiveRole = getEffectiveRole(userSession.user.role || "");
          const pageWithDoc = await prisma.documentPage.findUnique({
            where: { id: pageId },
            select: { documentId: true, document: { select: { folderId: true } } },
          });
          await prisma.workLog.create({
            data: {
              userId: userSession.user.id!,
              userName: userSession.user.name || "",
              userRole: effectiveRole,
              folderId: pageWithDoc?.document?.folderId || null,
              documentId: pageWithDoc?.documentId || null,
              action: "ocr_confirm",
              workType: "ocr_review",
            },
          });
        }
      } catch (logError) {
        console.error("WorkLog create error (ocr_confirm):", logError);
      }
    }

    return NextResponse.json({ page });
  } catch (error) {
    console.error("Error updating page:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ページの更新に失敗しました", code: "PAGE_UPDATE_FAILED", detail }, { status: 500 });
  }
}
