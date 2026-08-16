import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCSV, type CSVFormat } from "@/lib/csv";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";
import { getClientScope, isFolderAllowed, isDocumentAllowed } from "@/lib/advisor";

export async function POST(request: NextRequest) {
  try {
    const { documentId, folderId, format = "generic" } = await request.json() as {
      documentId?: string;
      folderId?: string;
      format?: CSVFormat;
    };

    if (!documentId && !folderId) {
      return NextResponse.json({ error: "ドキュメントIDまたはフォルダIDが必要です", code: "EXPORT_NO_ID" }, { status: 400 });
    }

    /*
      持ち主の確認。**ここが抜けていた。**
      渡された folderId / documentId をそのまま使っていたので、担当外の得意先の
      帳簿をCSVに書き出せてしまう状態だった。読めないものは出せないようにする。
    */
    const scope = await getClientScope();
    if (!scope) {
      return NextResponse.json({ error: "認証が必要です", code: "EXPORT_UNAUTHORIZED" }, { status: 401 });
    }
    const allowed = folderId
      ? await isFolderAllowed(scope, folderId)
      : await isDocumentAllowed(scope, documentId!);
    if (!allowed) {
      return NextResponse.json({ error: "権限がありません", code: "EXPORT_FORBIDDEN" }, { status: 403 });
    }

    let entries;
    let exportFolderId = folderId || null;
    let folderName = "";

    if (folderId) {
      // フォルダ単位エクスポート: フォルダ内の全確認済み仕訳を取得
      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: { name: true, documents: { select: { id: true } } },
      });
      if (!folder) {
        return NextResponse.json({ error: "フォルダが見つかりません", code: "EXPORT_FOLDER_NOT_FOUND" }, { status: 404 });
      }
      folderName = folder.name;
      const docIds = folder.documents.map((d) => d.id);
      entries = await prisma.journalEntry.findMany({
        where: { documentId: { in: docIds }, isConfirmed: true },
        orderBy: { date: "asc" },
      });

      // 全ドキュメントのステータスを更新
      await prisma.document.updateMany({
        where: { id: { in: docIds }, status: { not: "exported" } },
        data: { status: "exported" },
      });
    } else {
      // 単一ドキュメントエクスポート（後方互換）
      entries = await prisma.journalEntry.findMany({
        where: { documentId: documentId!, isConfirmed: true },
        orderBy: { date: "asc" },
      });

      await prisma.document.update({
        where: { id: documentId! },
        data: { status: "exported" },
      });

      const doc = await prisma.document.findUnique({
        where: { id: documentId! },
        select: { folderId: true },
      });
      exportFolderId = doc?.folderId || null;
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: "確認済みの仕訳がありません", code: "EXPORT_NO_ENTRIES" }, { status: 400 });
    }

    const csv = generateCSV(entries, format);

    // WorkLog: エクスポート完了を記録 + セッション自動完了
    try {
      const userSession = await auth();
      if (userSession?.user) {
        const effectiveRole = getEffectiveRole(userSession.user.role || "");
        await prisma.workLog.create({
          data: {
            userId: userSession.user.id!,
            userName: userSession.user.name || "",
            userRole: effectiveRole,
            folderId: exportFolderId,
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
          const folderData = exportFolderId
            ? await prisma.folder.findUnique({
                where: { id: exportFolderId },
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
              folderId: exportFolderId,
              folderName: folderData?.name || folderName,
            },
          });
        }
      }
    } catch (logError) {
      console.error("WorkLog create error (export):", logError);
    }

    const filename = folderId
      ? `journal_entries_folder_${format}.csv`
      : `journal_entries_${format}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "エクスポートに失敗しました", code: "EXPORT_FAILED", detail }, { status: 500 });
  }
}
