import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

async function requireAdminOrInstructor() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (session.user.role !== "admin" && session.user.role !== "instructor") {
    return { error: NextResponse.json({ error: "管理者または指導者権限が必要です" }, { status: 403 }) };
  }
  return { session };
}

// 承認
export async function PATCH(request: NextRequest) {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    const client = await prisma.company.update({
      where: { id },
      data: { isApproved: true },
    });

    return NextResponse.json({ client });
  } catch (err) {
    console.error("Error approving client:", err);
    return NextResponse.json({ error: "承認に失敗しました" }, { status: 500 });
  }
}

// 却下（削除）
export async function DELETE(request: NextRequest) {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    // フォルダが紐づいている場合は削除不可
    const client = await prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { folders: true } } },
    });

    if (!client) {
      return NextResponse.json({ error: "得意先が見つかりません" }, { status: 404 });
    }

    if (client._count.folders > 0) {
      return NextResponse.json(
        {
          error: "フォルダが紐づいているため却下（削除）できません。先にフォルダの得意先を変更してください。",
          code: "CLIENT_HAS_FOLDERS",
          folders: client._count.folders,
        },
        { status: 409 }
      );
    }

    await prisma.company.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error rejecting client:", err);
    return NextResponse.json({ error: "却下に失敗しました" }, { status: 500 });
  }
}
