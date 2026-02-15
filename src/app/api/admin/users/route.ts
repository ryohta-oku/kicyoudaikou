import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
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

export async function GET() {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, plainPassword: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ users });
  } catch (err) {
    console.error("Admin users fetch error:", err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// ユーザー新規作成
export async function POST(request: NextRequest) {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { email, password, name, role } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "全ての項目を入力してください" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "パスワードは6文字以上で入力してください" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "このメールアドレスは既に登録されています" }, { status: 409 });
    }

    const userRole = ["admin", "instructor", "user"].includes(role) ? role : "user";
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, plainPassword: password, name, role: userRole },
      select: { id: true, email: true, name: true, role: true, plainPassword: true, createdAt: true },
    });

    return NextResponse.json({ user });
  } catch (err) {
    console.error("Admin user create error:", err);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { session, error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { userId, role, newPassword } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "ユーザーIDを指定してください" }, { status: 400 });
    }

    // パスワード変更
    if (newPassword) {
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "パスワードは6文字以上で入力してください" }, { status: 400 });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword, plainPassword: newPassword },
      });
      return NextResponse.json({ success: true });
    }

    // 権限変更（管理者のみ）
    if (!role) {
      return NextResponse.json({ error: "権限を指定してください" }, { status: 400 });
    }

    if (session!.user.role !== "admin") {
      return NextResponse.json({ error: "権限変更は管理者のみ可能です" }, { status: 403 });
    }

    if (!["admin", "instructor", "user"].includes(role)) {
      return NextResponse.json({ error: "無効な権限です" }, { status: 400 });
    }

    if (userId === session!.user.id) {
      return NextResponse.json({ error: "自分自身の権限は変更できません" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true, plainPassword: true, createdAt: true },
    });

    return NextResponse.json({ user });
  } catch (err) {
    console.error("Admin user update error:", err);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { session, error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "ユーザーIDを指定してください" }, { status: 400 });
    }

    if (userId === session!.user.id) {
      return NextResponse.json({ error: "自分自身は削除できません" }, { status: 400 });
    }

    // 指導者は管理者を削除不可
    if (session!.user.role === "instructor") {
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (target?.role === "admin") {
        return NextResponse.json({ error: "管理者は削除できません" }, { status: 403 });
      }
    }

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin user delete error:", err);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
