import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// 削除依頼の作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { entryId, documentId, reason } = await request.json();

    if (!entryId || !documentId) {
      return NextResponse.json({ error: "entryIdとdocumentIdは必須です" }, { status: 400 });
    }

    // 既に同じエントリに対するpending依頼があるか確認
    const existing = await prisma.deletionRequest.findFirst({
      where: { entryId, status: "pending" },
    });
    if (existing) {
      return NextResponse.json({ error: "この仕訳には既に削除依頼が出ています" }, { status: 409 });
    }

    const deletionRequest = await prisma.deletionRequest.create({
      data: {
        entryId,
        documentId,
        reason: reason || "duplicate",
        requestedBy: session.user.name || session.user.email || "",
      },
    });

    return NextResponse.json({ deletionRequest });
  } catch (error) {
    console.error("Error creating deletion request:", error);
    return NextResponse.json({ error: "削除依頼の作成に失敗しました" }, { status: 500 });
  }
}
