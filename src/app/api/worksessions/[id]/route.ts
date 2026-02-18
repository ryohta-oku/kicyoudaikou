import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workSession = await prisma.workSession.findUnique({
      where: { id },
      include: { workLogs: { orderBy: { createdAt: "asc" } } },
    });

    if (!workSession) {
      return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ workSession });
  } catch (error) {
    console.error("WorkSession get error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "セッション取得に失敗しました", detail }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, totalSec, documentCount, folderId, folderName } = body;

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (totalSec !== undefined) data.totalSec = totalSec;
    if (documentCount !== undefined) data.documentCount = documentCount;
    if (folderId !== undefined) data.folderId = folderId;
    if (folderName !== undefined) data.folderName = folderName;
    if (status === "completed") data.completedAt = new Date();

    const workSession = await prisma.workSession.update({
      where: { id },
      data,
    });

    return NextResponse.json({ workSession });
  } catch (error) {
    console.error("WorkSession update error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "セッション更新に失敗しました", detail }, { status: 500 });
  }
}
