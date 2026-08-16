import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getClientScope, isFolderAllowed, isExternalScope } from "@/lib/advisor";

/**
 * 税理士の確認（1仕訳ごとの「よい」「直して」）。
 *
 * **誰がどの立場で押したかを両方残す。** 事業所の人が「税理士として操作」した
 * ものと、本物の税理士が押したものを後から区別できないと、
 * 「誰が承認したか」の記録が意味を失う。
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const scope = await getClientScope();
    if (!session?.user || !scope) {
      return NextResponse.json({ error: "認証が必要です", code: "REVIEW_UNAUTHORIZED" }, { status: 401 });
    }

    // 税理士の立場で見ているときだけ押せる。事業所の画面からは押させない
    if (!isExternalScope(scope)) {
      return NextResponse.json(
        { error: "税理士として操作しているときだけ確認できます", code: "REVIEW_NOT_ADVISOR" },
        { status: 403 }
      );
    }

    const { folderId, entryId, status, comment } = (await request.json()) as {
      folderId?: string;
      entryId?: string;
      status?: string;
      comment?: string;
    };

    if (!folderId || !entryId || (status !== "ok" && status !== "needs_fix")) {
      return NextResponse.json({ error: "入力が不正です", code: "REVIEW_BAD_REQUEST" }, { status: 400 });
    }
    if (status === "needs_fix" && !comment?.trim()) {
      return NextResponse.json(
        { error: "どこを直してほしいかを書いてください", code: "REVIEW_NO_COMMENT" },
        { status: 400 }
      );
    }

    if (!(await isFolderAllowed(scope, folderId))) {
      return NextResponse.json({ error: "権限がありません", code: "REVIEW_FORBIDDEN" }, { status: 403 });
    }

    // その仕訳が本当にこのフォルダのものか（他のフォルダの仕訳を書き換えられないように）
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: { document: { select: { folderId: true } } },
    });
    if (!entry || entry.document.folderId !== folderId) {
      return NextResponse.json({ error: "仕訳が見つかりません", code: "REVIEW_ENTRY_NOT_FOUND" }, { status: 404 });
    }

    const reviewerKind = scope.actingAsAdvisor ? "office_as_advisor" : "tax_advisor";
    const data = {
      status,
      comment: status === "needs_fix" ? comment!.trim() : "",
      reviewedBy: session.user.id!,
      reviewedByName: session.user.name || "",
      reviewerKind,
      reviewedAt: new Date(),
    };

    const review = await prisma.taxReview.upsert({
      where: { entryId },
      create: { entryId, ...data },
      update: data,
      select: { status: true, comment: true, reviewedByName: true, reviewerKind: true },
    });

    return NextResponse.json({ review });
  } catch (error) {
    console.error("Tax review error:", error);
    return NextResponse.json({ error: "保存に失敗しました", code: "REVIEW_FAILED" }, { status: 500 });
  }
}
