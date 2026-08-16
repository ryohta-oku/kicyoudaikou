import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getClientScope, isFolderAllowed, isExternalScope } from "@/lib/advisor";
import { ADMIN_AREA_ROLES } from "@/lib/roles";

/**
 * フォルダ単位の税理士確認。
 *
 *   request  事業所 → 税理士に確認を依頼する（"pending"）
 *   approve  税理士 → 全部よい（"approved"）。このあとCSVを出せる
 *   return   税理士 → 直してほしい（"returned"）。事業所に戻る
 *
 * 誰が押せるかは行き先で変わる。**依頼は事業所、承認と差し戻しは税理士。**
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const scope = await getClientScope();
    if (!session?.user || !scope) {
      return NextResponse.json({ error: "認証が必要です", code: "REVIEW_UNAUTHORIZED" }, { status: 401 });
    }

    const { folderId, action } = (await request.json()) as {
      folderId?: string;
      action?: string;
    };

    if (!folderId || !["request", "approve", "return"].includes(action || "")) {
      return NextResponse.json({ error: "入力が不正です", code: "REVIEW_BAD_REQUEST" }, { status: 400 });
    }
    if (!(await isFolderAllowed(scope, folderId))) {
      return NextResponse.json({ error: "権限がありません", code: "REVIEW_FORBIDDEN" }, { status: 403 });
    }

    const asAdvisor = isExternalScope(scope);

    if (action === "request") {
      // 依頼するのは事業所の管理側。税理士が自分に依頼することはない
      if (asAdvisor || !ADMIN_AREA_ROLES.includes(scope.role)) {
        return NextResponse.json(
          { error: "管理者・指導者だけが依頼できます", code: "REVIEW_NOT_OFFICE" },
          { status: 403 }
        );
      }
      const folder = await prisma.folder.update({
        where: { id: folderId },
        data: { taxReviewStatus: "pending", taxReviewedBy: "", taxReviewedByName: "", taxReviewedAt: null },
        select: { taxReviewStatus: true },
      });
      return NextResponse.json(folder);
    }

    // ここから先は税理士の立場のときだけ
    if (!asAdvisor) {
      return NextResponse.json(
        { error: "税理士として操作しているときだけ確認できます", code: "REVIEW_NOT_ADVISOR" },
        { status: 403 }
      );
    }

    const entries = await prisma.journalEntry.findMany({
      where: { document: { folderId } },
      select: { id: true, taxReview: { select: { status: true } } },
    });

    if (action === "approve") {
      // **全部に「よい」が付いていないと完了にしない。** 見落としたまま
      // 完了になると、確認したことにならない
      const notOk = entries.filter((e) => e.taxReview?.status !== "ok");
      if (notOk.length > 0) {
        return NextResponse.json(
          { error: `まだ確認していない仕訳が ${notOk.length} 件あります`, code: "REVIEW_INCOMPLETE" },
          { status: 400 }
        );
      }
    } else {
      // 差し戻しは、何が問題かが1件でも書かれていること
      const anyFix = entries.some((e) => e.taxReview?.status === "needs_fix");
      if (!anyFix) {
        return NextResponse.json(
          { error: "直してほしい仕訳に印を付けてください", code: "REVIEW_NO_FIX" },
          { status: 400 }
        );
      }
    }

    const folder = await prisma.folder.update({
      where: { id: folderId },
      data: {
        taxReviewStatus: action === "approve" ? "approved" : "returned",
        taxReviewedBy: session.user.id!,
        taxReviewedByName:
          (session.user.name || "") + (scope.actingAsAdvisor ? "（事業所・税理士として）" : ""),
        taxReviewedAt: new Date(),
      },
      select: { taxReviewStatus: true, taxReviewedByName: true },
    });

    return NextResponse.json(folder);
  } catch (error) {
    console.error("Tax review folder error:", error);
    return NextResponse.json({ error: "保存に失敗しました", code: "REVIEW_FOLDER_FAILED" }, { status: 500 });
  }
}
