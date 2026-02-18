import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    // sendBeaconからのリクエストはContent-Type: text/plainの場合がある
    let body: Record<string, unknown>;
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const text = await request.text();
      body = JSON.parse(text);
    }

    const { sessionId, userId, userName, userRole, folderId, folderName, documentId, action, workType, durationSec } = body as {
      sessionId?: string;
      userId?: string;
      userName?: string;
      userRole?: string;
      folderId?: string;
      folderName?: string;
      documentId?: string;
      action: string;
      workType: string;
      durationSec?: number;
    };

    if (!userId) {
      return NextResponse.json({ error: "ユーザーIDが必要です" }, { status: 400 });
    }

    const workLog = await prisma.workLog.create({
      data: {
        sessionId: sessionId || null,
        userId: userId,
        userName: userName || "",
        userRole: userRole || "",
        folderId: folderId || null,
        folderName: folderName || "",
        documentId: documentId || null,
        action: action || "work_session",
        workType: workType || "preparation",
        durationSec: durationSec || 0,
      },
    });

    return NextResponse.json({ workLog });
  } catch (error) {
    console.error("WorkLog create error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "工数ログ作成に失敗しました", detail }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const userRole = searchParams.get("userRole");
    const folderId = searchParams.get("folderId");
    const sessionId = searchParams.get("sessionId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};

    // A型/B型は自分のデータのみ（クライアントからuserIdを渡す）
    if (userRole === "user_a" || userRole === "user_b") {
      if (userId) where.userId = userId;
    } else if (userId) {
      where.userId = userId;
    }

    if (folderId) where.folderId = folderId;
    if (sessionId) where.sessionId = sessionId;

    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to + "T23:59:59.999Z");
    }

    const workLogs = await prisma.workLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ workLogs });
  } catch (error) {
    console.error("WorkLog list error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "工数ログ一覧の取得に失敗しました", detail }, { status: 500 });
  }
}
