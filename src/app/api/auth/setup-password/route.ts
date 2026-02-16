import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// トークン検証（GET）
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "トークンが必要です" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { inviteToken: token },
    select: { id: true, name: true, email: true, plainPassword: true, password: true, inviteTokenExpiry: true },
  });

  if (!user) {
    return NextResponse.json({ error: "無効なリンクです" }, { status: 404 });
  }

  if (!user.inviteTokenExpiry || new Date() > user.inviteTokenExpiry) {
    return NextResponse.json({ error: "このリンクは有効期限が切れています" }, { status: 410 });
  }

  // パスワード設定済みか判定（plainPasswordがあれば設定済み＝認証モード）
  const hasPassword = !!user.plainPassword;

  return NextResponse.json({
    user: { name: user.name, email: user.email },
    hasPassword,
    plainPassword: hasPassword ? user.plainPassword : undefined,
  });
}

// パスワード設定 or 認証完了（POST）
export async function POST(request: NextRequest) {
  try {
    const { token, password, verifyOnly } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "トークンが必要です" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { inviteToken: token },
    });

    if (!user) {
      return NextResponse.json({ error: "無効なリンクです" }, { status: 404 });
    }

    if (!user.inviteTokenExpiry || new Date() > user.inviteTokenExpiry) {
      return NextResponse.json({ error: "このリンクは有効期限が切れています" }, { status: 410 });
    }

    if (verifyOnly) {
      // 認証のみ（パスワード変更なし）
      await prisma.user.update({
        where: { id: user.id },
        data: {
          inviteToken: null,
          inviteTokenExpiry: null,
        },
      });
      return NextResponse.json({ success: true });
    }

    // パスワード設定/変更
    if (!password) {
      return NextResponse.json({ error: "パスワードを入力してください" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "パスワードは6文字以上で入力してください" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        plainPassword: password,
        inviteToken: null,
        inviteTokenExpiry: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Setup password error:", error);
    return NextResponse.json({ error: "設定に失敗しました" }, { status: 500 });
  }
}
