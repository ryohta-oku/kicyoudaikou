import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";

async function requireAdminOrInstructor() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  const role = getEffectiveRole(session.user.role || "");
  if (role !== "admin" && role !== "instructor") {
    return { error: NextResponse.json({ error: "管理者または指導者権限が必要です" }, { status: 403 }) };
  }
  return { session };
}

// 承認（実際に仕訳+ドキュメント削除）
export async function PATCH(request: NextRequest) {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    const req = await prisma.deletionRequest.findUnique({
      where: { id },
      include: {
        entry: {
          select: {
            id: true,
            documentId: true,
            document: {
              select: {
                id: true,
                _count: { select: { journalEntries: true } },
              },
            },
          },
        },
      },
    });

    if (!req || req.status !== "pending") {
      return NextResponse.json({ error: "有効な削除依頼が見つかりません" }, { status: 404 });
    }

    // 仕訳エントリを削除
    await prisma.journalEntry.delete({ where: { id: req.entryId } });

    // このドキュメントの他の仕訳が無ければドキュメントも削除
    if (req.entry.document._count.journalEntries <= 1) {
      await prisma.document.delete({ where: { id: req.documentId } });
    }

    // 依頼ステータスを承認済みに更新（エントリ削除後にカスケード削除される場合もあるのでtry）
    try {
      await prisma.deletionRequest.update({
        where: { id },
        data: { status: "approved" },
      });
    } catch {
      // カスケード削除で既に消えている場合は無視
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error approving deletion request:", error);
    return NextResponse.json({ error: "承認に失敗しました" }, { status: 500 });
  }
}

// 却下
export async function DELETE(request: NextRequest) {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    await prisma.deletionRequest.update({
      where: { id },
      data: { status: "rejected" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error rejecting deletion request:", error);
    return NextResponse.json({ error: "却下に失敗しました" }, { status: 500 });
  }
}
