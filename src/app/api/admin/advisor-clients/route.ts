import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isExternalRole, ADMIN_AREA_ROLES } from "@/lib/roles";

/**
 * 税理士（社外）が見てよい得意先の割り当て。
 *
 * **共通ログイン（SHARED_LOGIN）でも断らない。** アカウントの追加・パスワード・
 * 役割の変更は client-hub の仕事なので 409 で断っているが、
 * 「どの得意先を見せるか」は記帳代行だけが持つ情報で、client-hub には無い。
 * ここを塞ぐと、税理士アカウントを作っても何も見えないまま手当てできなくなる。
 */

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

/** 税理士アカウントと、その担当得意先の一覧 */
export async function GET() {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    });

    /*
      並べるのは2種類。意味が違うので、画面側で分けて見せる。

        税理士（社外）          … 見える得意先そのもの
        管理者・指導者（社内）  … 「税理士として操作」に切り替えたときに見る得意先。
                                  普段の見え方は変わらない

      社内の人も**全員並べる**。行を持っていることが「税理士として操作できる」印
      なので、まだ持っていない人が一覧に出ないと、最初の1件を付けられない。
    */
    const assignments = await prisma.advisorClient.findMany({
      select: { userId: true, clientId: true },
    });

    const advisors = users.filter(
      (u) => isExternalRole(u.role) || ADMIN_AREA_ROLES.includes(u.role)
    );

    const clients = await prisma.company.findMany({
      where: { isApproved: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      advisors: advisors.map((a) => ({
        ...a,
        clientIds: assignments.filter((x) => x.userId === a.id).map((x) => x.clientId),
      })),
      clients,
    });
  } catch (err) {
    console.error("advisor-clients GET error:", err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

/** ある税理士の担当得意先を「この一覧にする」形で置き換える */
export async function PUT(request: NextRequest) {
  const { error, session } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { userId, clientIds } = (await request.json()) as {
      userId?: string;
      clientIds?: string[];
    };

    if (!userId || !Array.isArray(clientIds)) {
      return NextResponse.json({ error: "userId と clientIds が必要です" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }
    /*
      社内の人にも割り当てられる。**意味が2通りある。**

        税理士（社外）        … 見える得意先そのもの
        事業所の人（社内）    … 「税理士として操作」に切り替えたときに見る得意先。
                               普段の見え方は変わらない（元どおり全部見える）

      行を持っていること自体が「税理士として操作できる」印になるので、
      列を増やさずに済む。ただし**利用者（user_a / user_b）には付けない** ――
      税理士の工程は事業所の管理側の仕事で、利用者さんの担当ではない。
    */
    const canHoldAdvisorHat =
      isExternalRole(target.role) || ADMIN_AREA_ROLES.includes(target.role);
    if (!canHoldAdvisorHat) {
      return NextResponse.json(
        { error: "税理士、または管理者・指導者にのみ割り当てられます" },
        { status: 400 }
      );
    }

    // 実在する得意先だけに絞る（存在しないIDを渡されても行を作らない）
    const valid = await prisma.company.findMany({
      where: { id: { in: clientIds } },
      select: { id: true },
    });
    const validIds = valid.map((c) => c.id);

    await prisma.$transaction([
      prisma.advisorClient.deleteMany({ where: { userId } }),
      ...(validIds.length > 0
        ? [
            prisma.advisorClient.createMany({
              data: validIds.map((clientId) => ({
                userId,
                clientId,
                createdBy: session!.user.name || "",
              })),
            }),
          ]
        : []),
    ]);

    return NextResponse.json({ userId, clientIds: validIds });
  } catch (err) {
    console.error("advisor-clients PUT error:", err);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
