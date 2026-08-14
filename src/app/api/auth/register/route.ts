import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SHARED_LOGIN, rejectIfSharedLogin } from "@/lib/shared-login";

// ユーザーが0人かどうかを返す（初期セットアップ判定用）
export async function GET() {
  try {
    // 共通ログイン中に初期セットアップ画面を出さない。
    // アカウントは client-hub にあり、こちらの User が0人でも「未設定」ではない
    if (SHARED_LOGIN) return NextResponse.json({ needsSetup: false });

    const count = await prisma.user.count();
    return NextResponse.json({ needsSetup: count === 0 });
  } catch (error) {
    console.error("Setup check error:", error);
    return NextResponse.json({ needsSetup: false });
  }
}

// 初期管理者登録（ユーザーが0人の場合のみ、招待コード不要）
export async function POST(request: NextRequest) {
  const blocked = rejectIfSharedLogin("管理者の登録");
  if (blocked) return blocked;

  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "全ての項目を入力してください" },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: "パスワードは4文字以上で入力してください" },
        { status: 400 }
      );
    }

    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "管理者は既に登録されています" },
        { status: 403 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, plainPassword: password, name, role: "admin" },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "登録に失敗しました" },
      { status: 500 }
    );
  }
}
