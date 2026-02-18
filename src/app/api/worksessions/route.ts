import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { userId, userName, userRole, folderId, folderName } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "ユーザーIDが必要です" }, { status: 400 });
    }

    const workSession = await prisma.workSession.create({
      data: {
        userId,
        userName: userName || "",
        userRole: userRole || "",
        folderId: folderId || null,
        folderName: folderName || "",
      },
    });

    return NextResponse.json({ workSession });
  } catch (error) {
    console.error("WorkSession create error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "セッション作成に失敗しました", detail }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const userRole = searchParams.get("userRole");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};

    // A型/B型は自分のデータのみ（クライアントからuserIdを渡す）
    if (userRole === "user_a" || userRole === "user_b") {
      if (userId) where.userId = userId;
    } else if (userId) {
      where.userId = userId;
    }

    if (from || to) {
      where.startedAt = {};
      if (from) (where.startedAt as Record<string, unknown>).gte = new Date(from);
      if (to) (where.startedAt as Record<string, unknown>).lte = new Date(to + "T23:59:59.999Z");
    }

    const sessions = await prisma.workSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: { workLogs: true },
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("WorkSession list error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "セッション一覧の取得に失敗しました", detail }, { status: 500 });
  }
}
