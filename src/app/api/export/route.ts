import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCSV, type CSVFormat } from "@/lib/csv";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";

export async function POST(request: NextRequest) {
  try {
    const { documentId, format = "generic" } = await request.json() as {
      documentId: string;
      format?: CSVFormat;
    };

    if (!documentId) {
      return NextResponse.json({ error: "ドキュメントIDが必要です", code: "EXPORT_NO_DOCUMENT_ID" }, { status: 400 });
    }

    const entries = await prisma.journalEntry.findMany({
      where: { documentId, isConfirmed: true },
      orderBy: { date: "asc" },
    });

    if (entries.length === 0) {
      return NextResponse.json({ error: "確認済みの仕訳がありません", code: "EXPORT_NO_ENTRIES" }, { status: 400 });
    }

    const csv = generateCSV(entries, format);

    // ドキュメントのステータスを更新
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "exported" },
    });

    // WorkLog: エクスポート完了を記録 + セッション自動完了
    try {
      const userSession = await auth();
      if (userSession?.user) {
        const effectiveRole = getEffectiveRole(userSession.user.role || "");
        const doc = await prisma.document.findUnique({
          where: { id: documentId },
          select: { folderId: true },
        });
        await prisma.workLog.create({
          data: {
            userId: userSession.user.id!,
            userName: userSession.user.name || "",
            userRole: effectiveRole,
            folderId: doc?.folderId || null,
            documentId,
            action: "export",
            workType: "export",
          },
        });

        // A型のセッションを自動完了
        const activeSessions = await prisma.workSession.findMany({
          where: { userId: userSession.user.id!, status: "active" },
          include: { workLogs: true },
        });
        for (const ws of activeSessions) {
          const totalSec = ws.workLogs.reduce((sum, l) => sum + l.durationSec, 0);
          const folderData = doc?.folderId
            ? await prisma.folder.findUnique({
                where: { id: doc.folderId },
                include: { documents: { select: { id: true } } },
              })
            : null;
          await prisma.workSession.update({
            where: { id: ws.id },
            data: {
              status: "completed",
              completedAt: new Date(),
              totalSec,
              documentCount: folderData?.documents.length || 0,
              folderId: doc?.folderId || null,
              folderName: folderData?.name || "",
            },
          });
        }
      }
    } catch (logError) {
      console.error("WorkLog create error (export):", logError);
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="journal_entries_${documentId}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "エクスポートに失敗しました", code: "EXPORT_FAILED", detail }, { status: 500 });
  }
}
