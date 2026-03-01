import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        documents: {
          select: {
            id: true,
            folderId: true,
            filename: true,
            filepath: true,
            fileType: true,
            title: true,
            creator: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            pages: { select: { id: true, imagePath: true, pageNumber: true }, orderBy: { pageNumber: "asc" } },
            _count: { select: { journalEntries: true } },
            journalEntries: {
              orderBy: { date: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { error: "フォルダが見つかりません", code: "FOLDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Error fetching folder:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "フォルダの取得に失敗しました", code: "FOLDER_GET_FAILED", detail },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { handoffStatus, handoffBy } = body;

    const data: Record<string, unknown> = {};
    if (handoffStatus !== undefined) data.handoffStatus = handoffStatus;
    if (handoffBy !== undefined) data.handoffBy = handoffBy;
    if (handoffStatus === "handed_off") data.handoffAt = new Date();

    const folder = await prisma.folder.update({
      where: { id },
      data,
    });

    // WorkLog: 引き継ぎ完了を記録 + セッション自動完了
    if (handoffStatus === "handed_off") {
      try {
        const userSession = await auth();
        if (userSession?.user) {
          const effectiveRole = getEffectiveRole(userSession.user.role || "");
          await prisma.workLog.create({
            data: {
              userId: userSession.user.id!,
              userName: userSession.user.name || "",
              userRole: effectiveRole,
              folderId: id,
              action: "handoff",
              workType: "handoff",
            },
          });

          // B型のセッションを自動完了
          const activeSessions = await prisma.workSession.findMany({
            where: { userId: userSession.user.id!, status: "active" },
            include: { workLogs: true },
          });
          for (const ws of activeSessions) {
            const totalSec = ws.workLogs.reduce((sum, l) => sum + l.durationSec, 0);
            const folderData = await prisma.folder.findUnique({
              where: { id },
              include: { documents: { select: { id: true } } },
            });
            await prisma.workSession.update({
              where: { id: ws.id },
              data: {
                status: "completed",
                completedAt: new Date(),
                totalSec,
                documentCount: folderData?.documents.length || 0,
                folderId: id,
                folderName: folderData?.name || "",
              },
            });
          }
        }
      } catch (logError) {
        console.error("WorkLog create error (handoff):", logError);
      }
    }

    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Error updating folder:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "フォルダの更新に失敗しました", code: "FOLDER_UPDATE_FAILED", detail },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.folder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting folder:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "フォルダの削除に失敗しました", code: "FOLDER_DELETE_FAILED", detail },
      { status: 500 }
    );
  }
}
