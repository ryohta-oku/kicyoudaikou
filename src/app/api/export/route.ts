import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_EXPORT_SETTINGS,
  generateExportFile,
  type CsvFormat,
  type ExportSettings,
  type JournalEntryForExport,
} from "@/lib/csv";
import { INVOICE_KINDS, type InvoiceKind } from "@/lib/tax-class";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";
import { getClientScope, isFolderAllowed, isDocumentAllowed } from "@/lib/advisor";

/**
 * 得意先ごとの出力設定を読む。
 *
 * 相手科目（貸方）は3社とも必須項目で、空だとCSVを取り込めない。
 * 得意先が付いていないフォルダもあり得るので、そのときは既定値
 * （現金・80%控除）で通す ―― 出せないよりは出したほうがよい。
 */
async function loadExportSettings(clientId: string | null): Promise<ExportSettings> {
  if (!clientId) return DEFAULT_EXPORT_SETTINGS;

  const client = await prisma.company.findUnique({
    where: { id: clientId },
    select: {
      defaultCreditAccountCode: true,
      defaultCreditAccountName: true,
      nonQualifiedInvoiceKind: true,
    },
  });
  if (!client) return DEFAULT_EXPORT_SETTINGS;

  const kind = INVOICE_KINDS.includes(client.nonQualifiedInvoiceKind as InvoiceKind)
    ? (client.nonQualifiedInvoiceKind as InvoiceKind)
    : DEFAULT_EXPORT_SETTINGS.nonQualifiedInvoiceKind;

  return {
    defaultCounterAccountCode:
      client.defaultCreditAccountCode || DEFAULT_EXPORT_SETTINGS.defaultCounterAccountCode,
    defaultCounterAccountName:
      client.defaultCreditAccountName || DEFAULT_EXPORT_SETTINGS.defaultCounterAccountName,
    nonQualifiedInvoiceKind: kind,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { documentId, folderId, format = "generic" } = await request.json() as {
      documentId?: string;
      folderId?: string;
      format?: CsvFormat;
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

    /*
      仕訳と一緒に、その元になった領収書の**登録番号の有無**も取る。
      インボイスの区分（適格 / 80%控除 など）はこれで決まる。
      DocumentPage には imageData（画像の実体）があるので、
      include ではなく select で必要な列だけを指定する。
    */
    const ENTRY_SELECT = {
      date: true,
      description: true,
      accountCode: true,
      accountName: true,
      subAccountCode: true,
      subAccountName: true,
      debitAmount: true,
      creditAmount: true,
      taxRate: true,
      creditAccountCode: true,
      creditAccountName: true,
      page: { select: { registrationNumber: true, noRegistrationNumber: true } },
    } as const;

    let rows;
    let exportFolderId = folderId || null;
    let folderName = "";
    let clientId: string | null = null;

    if (folderId) {
      // フォルダ単位エクスポート: フォルダ内の全確認済み仕訳を取得
      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: { name: true, clientId: true, documents: { select: { id: true } } },
      });
      if (!folder) {
        return NextResponse.json({ error: "フォルダが見つかりません", code: "EXPORT_FOLDER_NOT_FOUND" }, { status: 404 });
      }
      folderName = folder.name;
      clientId = folder.clientId;
      const docIds = folder.documents.map((d) => d.id);
      rows = await prisma.journalEntry.findMany({
        where: { documentId: { in: docIds }, isConfirmed: true },
        orderBy: { date: "asc" },
        select: ENTRY_SELECT,
      });

      // 全ドキュメントのステータスを更新
      await prisma.document.updateMany({
        where: { id: { in: docIds }, status: { not: "exported" } },
        data: { status: "exported" },
      });
    } else {
      // 単一ドキュメントエクスポート（後方互換）
      rows = await prisma.journalEntry.findMany({
        where: { documentId: documentId!, isConfirmed: true },
        orderBy: { date: "asc" },
        select: ENTRY_SELECT,
      });

      await prisma.document.update({
        where: { id: documentId! },
        data: { status: "exported" },
      });

      const doc = await prisma.document.findUnique({
        where: { id: documentId! },
        select: { folderId: true, folder: { select: { clientId: true } } },
      });
      exportFolderId = doc?.folderId || null;
      clientId = doc?.folder?.clientId ?? null;
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "確認済みの仕訳がありません", code: "EXPORT_NO_ENTRIES" }, { status: 400 });
    }

    const settings = await loadExportSettings(clientId);

    const entries: JournalEntryForExport[] = rows.map((row) => ({
      date: row.date,
      description: row.description,
      accountCode: row.accountCode,
      accountName: row.accountName,
      subAccountCode: row.subAccountCode,
      subAccountName: row.subAccountName,
      debitAmount: row.debitAmount,
      creditAmount: row.creditAmount,
      taxRate: row.taxRate,
      creditAccountCode: row.creditAccountCode,
      creditAccountName: row.creditAccountName,
      // 「読み取れなかっただけ」と「人が見て無かった」を区別しない ――
      // どちらも適格請求書として扱わないのが安全側
      hasRegistrationNumber: row.page ? row.page.registrationNumber !== "" : null,
    }));

    const file = generateExportFile(
      entries,
      format,
      settings,
      folderId ? `journal_entries_folder` : `journal_entries`
    );

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

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        // fetch でダウンロードする画面がファイル名を読めるようにする
        "Access-Control-Expose-Headers": "Content-Disposition",
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "エクスポートに失敗しました", code: "EXPORT_FAILED", detail }, { status: 500 });
  }
}
