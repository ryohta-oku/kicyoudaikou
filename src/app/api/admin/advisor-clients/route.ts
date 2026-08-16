import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isExternalRole } from "@/lib/roles";

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
    const advisors = users.filter((u) => isExternalRole(u.role));

    const assignments = await prisma.advisorClient.findMany({
      where: { userId: { in: advisors.map((a) => a.id) } },
      select: { userId: true, clientId: true },
    });

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
    // 社外の役割にしか割り当てない。社内の人は元から全得意先を見られるので、
    // ここに行があると「絞っているつもり」の誤解を生む
    if (!isExternalRole(target.role)) {
      return NextResponse.json(
        { error: "社外の役割（税理士）にのみ割り当てられます" },
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
