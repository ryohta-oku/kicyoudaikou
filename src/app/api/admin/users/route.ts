import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { SHARED_LOGIN, rejectIfSharedLogin } from "@/lib/shared-login";

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
    /**
     * 共通ログイン中かどうかを画面に渡す。**押してから 409 で気づく**のでは遅いので、
     * 追加・変更のボタンを最初から出さないために使う
     */
    return NextResponse.json({ users, sharedLogin: SHARED_LOGIN });
  } catch (err) {
    console.error("Admin users fetch error:", err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// ユーザー新規作成（招待メール送信）
export async function POST(request: NextRequest) {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;
  // 共通ログイン中にここで作っても、照合先は client-hub なのでログインできない
  const blocked = rejectIfSharedLogin("アカウントの追加");
  if (blocked) return blocked;

  try {
    const { email, name, role, password } = await request.json();

    if (!email || !name) {
      return NextResponse.json({ error: "名前とメールアドレスを入力してください" }, { status: 400 });
    }

    if (password && password.length < 6) {
      return NextResponse.json({ error: "パスワードは6文字以上で入力してください" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "このメールアドレスは既に登録されています" }, { status: 409 });
    }

    // 役割の既定は利用者（A型）。2026-09-01 に B型が無くなったため。
    // user_b を許可リストに残すのは、既存アカウントの編集を 400 にしないため
    const userRole = ["admin", "instructor", "user_a", "user_b"].includes(role) ? role : "user_a";
    const inviteToken = randomUUID();
    const inviteTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間後

    // パスワード指定あり→そのまま設定、なし→ランダムプレースホルダー
    const hashedPassword = password
      ? await bcrypt.hash(password, 10)
      : await bcrypt.hash(randomUUID(), 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        plainPassword: password || "",
        name,
        role: userRole,
        inviteToken,
        inviteTokenExpiry,
      },
      select: { id: true, email: true, name: true, role: true, plainPassword: true, createdAt: true },
    });

    // 認証メール送信（失敗してもユーザー作成は成功とする）
    let emailSent = false;
    let setupUrl: string | undefined;
    try {
      const emailResult = await sendVerificationEmail(email, name, inviteToken);
      emailSent = !emailResult.consoleOnly;
      setupUrl = emailResult.consoleOnly ? emailResult.setupUrl : undefined;
    } catch (emailErr) {
      console.error("Email send failed:", emailErr);
      const appUrl = process.env.APP_URL || "http://localhost:3000";
      setupUrl = `${appUrl}/setup-password?token=${inviteToken}`;
    }

    return NextResponse.json({ user, emailSent, setupUrl });
  } catch (err) {
    console.error("Admin user create error:", err);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { session, error } = await requireAdminOrInstructor();
  if (error) return error;
  /**
   * 共通ログイン中は、パスワードは照合に使われず、役割は次のログインで
   * client-hub の値に上書きされる。どちらも黙って無効になるので断る
   */
  const blocked = rejectIfSharedLogin("パスワード・役割の変更");
  if (blocked) return blocked;

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

    if (!["admin", "instructor", "user_a", "user_b"].includes(role)) {
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
  /**
   * 共通ログイン中にここで消しても、client-hub 側のアカウントは生きているので
   * 次のログインで影の行が作り直される。**止めたことにならない**
   */
  const blocked = rejectIfSharedLogin("アカウントの停止・削除");
  if (blocked) return blocked;

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
