import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ users });
  } catch (err) {
    console.error("Admin users fetch error:", err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json({ error: "ユーザーIDと権限を指定してください" }, { status: 400 });
    }

    if (!["admin", "instructor", "user"].includes(role)) {
      return NextResponse.json({ error: "無効な権限です" }, { status: 400 });
    }

    // 自分自身の権限は変更不可
    if (userId === session!.user.id) {
      return NextResponse.json({ error: "自分自身の権限は変更できません" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return NextResponse.json({ user });
  } catch (err) {
    console.error("Admin user update error:", err);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "ユーザーIDを指定してください" }, { status: 400 });
    }

    // 自分自身は削除不可
    if (userId === session!.user.id) {
      return NextResponse.json({ error: "自分自身は削除できません" }, { status: 400 });
    }

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin user delete error:", err);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
