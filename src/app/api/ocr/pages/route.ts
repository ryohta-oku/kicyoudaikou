import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";
import { extractReceiptNumber } from "@/lib/receipt-number";

// ページのOCRテキストを更新
export async function PATCH(request: NextRequest) {
  try {
    const { pageId, correctedText, isConfirmed, isDoubleChecked, date, registrationNumber, amount, tax, memo, noRegistrationNumber } = await request.json();

    if (!pageId) {
      return NextResponse.json({ error: "ページIDが必要です", code: "PAGE_NO_ID" }, { status: 400 });
    }

    /*
      レシート番号は**人が直した本文から拾い直す。**

      画面に出さない項目なので、UIから送られてくることはない。それでも
      直した本文には正しい番号が入っている ―― 読み取りが崩れて番号を
      拾えなかったページも、人が本文を直した時点で拾えるようになる。

      **拾えたときだけ書く。** 拾えないときに空で上書きすると、
      せっかく取れていた番号が本文の整形だけで消えてしまう。
    */
    const foundNumber =
      correctedText !== undefined ? extractReceiptNumber(correctedText) : "";

    const page = await prisma.documentPage.update({
      where: { id: pageId },
      data: {
        ...(correctedText !== undefined && { correctedText }),
        ...(foundNumber && { receiptNumber: foundNumber }),
        ...(isConfirmed !== undefined && { isConfirmed }),
        ...(isDoubleChecked !== undefined && { isDoubleChecked }),
        ...(date !== undefined && { date }),
        ...(registrationNumber !== undefined && { registrationNumber }),
        ...(amount !== undefined && { amount }),
        ...(tax !== undefined && { tax }),
        ...(memo !== undefined && { memo }),
        ...(noRegistrationNumber !== undefined && { noRegistrationNumber }),
      },
    });

    const userSession = await auth();

    // 1stチェック確認時: PageSnapshot を保存
    if (isConfirmed === true) {
      try {
        if (userSession?.user) {
          const effectiveRole = getEffectiveRole(userSession.user.role || "");
          const pageWithDoc = await prisma.documentPage.findUnique({
            where: { id: pageId },
            select: {
              documentId: true,
              date: true,
              registrationNumber: true,
              amount: true,
              tax: true,
              memo: true,
              document: { select: { folderId: true } },
            },
          });

          // PageSnapshot を upsert（1stチェック時の値を保存）
          await prisma.pageSnapshot.upsert({
            where: { pageId },
            create: {
              pageId,
              userId: userSession.user.id!,
              userName: userSession.user.name || "",
              date: pageWithDoc?.date || "",
              registrationNumber: pageWithDoc?.registrationNumber || "",
              amount: pageWithDoc?.amount || "",
              tax: pageWithDoc?.tax || "",
              memo: pageWithDoc?.memo || "",
            },
            update: {
              userId: userSession.user.id!,
              userName: userSession.user.name || "",
              date: pageWithDoc?.date || "",
              registrationNumber: pageWithDoc?.registrationNumber || "",
              amount: pageWithDoc?.amount || "",
              tax: pageWithDoc?.tax || "",
              memo: pageWithDoc?.memo || "",
            },
          });

          // WorkLog: OCR確認完了を記録
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
        console.error("WorkLog/Snapshot create error (ocr_confirm):", logError);
      }
    }

    // ダブルチェック確認時: WorkLog を記録
    if (isDoubleChecked === true) {
      try {
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
              action: "double_check_confirm",
              workType: "double_check",
            },
          });
        }
      } catch (logError) {
        console.error("WorkLog create error (double_check_confirm):", logError);
      }
    }

    return NextResponse.json({ page });
  } catch (error) {
    console.error("Error updating page:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ページの更新に失敗しました", code: "PAGE_UPDATE_FAILED", detail }, { status: 500 });
  }
}
