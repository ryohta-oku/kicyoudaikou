import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rejectIfSharedLogin } from "@/lib/shared-login";
import { ADMIN_AREA_ROLES } from "@/lib/roles";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  instructor: "指導者",
  user_a: "利用者（A型）",
  user_b: "利用者（B型）",
  tax_advisor: "税理士",
  user: "利用者",
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    /*
      「税理士として操作」に切り替えられる人か。

      担当得意先の行を持っていること自体が印。役割を増やさずに済むし、
      「誰が何を見られるか」の置き場所が1つに保たれる。
      本物の税理士（社外）は常にその立場なので、切り替えは要らない。
    */
    const canActAsAdvisor =
      ADMIN_AREA_ROLES.includes(user.role) &&
      (await prisma.advisorClient.count({ where: { userId: user.id } })) > 0;

    return NextResponse.json({
      user: { ...user, roleLabel: ROLE_LABELS[user.role] || user.role },
      canActAsAdvisor,
    });
  } catch (error) {
    console.error("Account fetch error:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { name, currentPassword, newPassword } = await request.json();

    // 名前の更新
    if (name !== undefined) {
      if (!name || name.trim() === "") {
        return NextResponse.json({ error: "名前を入力してください" }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: session.user.id },
        data: { name: name.trim() },
      });
    }

    // パスワード変更。氏名の変更は影の行を直すだけなので共通ログイン中でも通す
    if (newPassword) {
      // 共通ログイン中はここで変えても照合に使われない
      const blocked = rejectIfSharedLogin("パスワードの変更");
      if (blocked) return blocked;

      if (!currentPassword) {
        return NextResponse.json({ error: "現在のパスワードを入力してください" }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "新しいパスワードは6文字以上で入力してください" }, { status: 400 });
      }

      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      if (!user) {
        return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json({ error: "現在のパスワードが正しくありません" }, { status: 403 });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: session.user.id },
        data: { password: hashedPassword, plainPassword: newPassword },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account update error:", error);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
