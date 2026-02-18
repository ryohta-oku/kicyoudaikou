import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { folderId, folderName } = await request.json();
    const effectiveRole = getEffectiveRole(session.user.role || "");

    const workSession = await prisma.workSession.create({
      data: {
        userId: session.user.id!,
        userName: session.user.name || "",
        userRole: effectiveRole,
        folderId: folderId || null,
        folderName: folderName || "",
      },
    });

    return NextResponse.json({ session: workSession });
  } catch (error) {
    console.error("WorkSession create error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "セッション作成に失敗しました", detail }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const effectiveRole = getEffectiveRole(session.user.role || "");

    const where: Record<string, unknown> = {};

    // A型/B型は自分のデータのみ
    if (effectiveRole === "user_a" || effectiveRole === "user_b") {
      where.userId = session.user.id;
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
