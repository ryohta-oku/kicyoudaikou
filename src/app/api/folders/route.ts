import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientScope } from "@/lib/advisor";

/** フォルダ内の仕訳アラート件数を計算 */
function computeAlertCount(
  documents: {
    id: string;
    status: string;
    journalEntries: {
      id: string;
      date: string;
      description: string;
      accountCode: string;
      accountName: string;
      debitAmount: number;
      creditAmount: number;
      taxRate: string;
      duplicateDismissed: boolean;
      deletionRequests: { id: string; status: string }[];
    }[];
  }[]
): number {
  // 仕訳済み以降のドキュメントのエントリのみ対象
  const classifiedDocs = documents.filter(
    (d) => d.status === "classified" || d.status === "reviewed" || d.status === "exported"
  );
  if (classifiedDocs.length === 0) return 0;

  const allEntries = classifiedDocs.flatMap((doc) =>
    doc.journalEntries.map((e) => ({ ...e, documentId: doc.id }))
  );
  if (allEntries.length === 0) return 0;

  // 削除依頼中のエントリID
  const pendingDeletionIds = new Set(
    allEntries
      .filter((e) => e.deletionRequests.some((dr) => dr.status === "pending"))
      .map((e) => e.id)
  );

  // 重複検知
  const duplicateIds = new Set<string>();
  for (let i = 0; i < allEntries.length; i++) {
    for (let j = i + 1; j < allEntries.length; j++) {
      const a = allEntries[i];
      const b = allEntries[j];
      if (a.duplicateDismissed || b.duplicateDismissed) continue;
      if (pendingDeletionIds.has(a.id) || pendingDeletionIds.has(b.id)) continue;
      const datesContradict = a.date && b.date && a.date !== b.date;
      if (
        a.documentId !== b.documentId &&
        !datesContradict &&
        a.accountCode && b.accountCode && a.accountCode === b.accountCode &&
        (a.debitAmount > 0 || a.creditAmount > 0) &&
        a.debitAmount === b.debitAmount &&
        a.creditAmount === b.creditAmount
      ) {
        duplicateIds.add(a.id);
        duplicateIds.add(b.id);
      }
    }
  }

  // アラート判定
  let alertCount = 0;
  for (const entry of allEntries) {
    const alerts: string[] = [];
    if (!entry.date) alerts.push("日付");
    if (!entry.description) alerts.push("摘要");
    if (entry.debitAmount <= 0 && entry.creditAmount <= 0) alerts.push("金額");
    if (!entry.accountCode && !entry.accountName) alerts.push("勘定科目");
    if (!entry.taxRate) alerts.push("税区分");
    if (duplicateIds.has(entry.id)) alerts.push("重複");
    if (pendingDeletionIds.has(entry.id)) alerts.push("削除依頼中");
    if (alerts.length > 0) alertCount++;
  }

  return alertCount;
}

export async function GET(request: NextRequest) {
  try {
    const scope = await getClientScope();
    if (!scope) {
      return NextResponse.json({ error: "認証が必要です", code: "FOLDERS_UNAUTHORIZED" }, { status: 401 });
    }

    const clientId = request.nextUrl.searchParams.get("clientId");

    /*
      社外の人（税理士）はクエリの得意先を信用せず、担当分に強制で絞る。
      得意先を指定してきた場合も、担当外なら空で返す（存在を教えない）。
    */
    let where: { clientId?: string | { in: string[] } } | undefined;
    if (scope.clientIds === null) {
      where = clientId ? { clientId } : undefined;
    } else if (clientId) {
      where = { clientId: scope.clientIds.includes(clientId) ? clientId : "__denied__" };
    } else {
      where = { clientId: { in: scope.clientIds } };
    }

    const folders = await prisma.folder.findMany({
      where,
      include: {
        documents: {
          select: {
            id: true,
            filename: true,
            status: true,
            journalEntries: {
              select: {
                id: true,
                date: true,
                description: true,
                accountCode: true,
                accountName: true,
                debitAmount: true,
                creditAmount: true,
                taxRate: true,
                duplicateDismissed: true,
                deletionRequests: {
                  select: { id: true, status: true },
                  where: { status: "pending" },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // レスポンスにアラート件数を追加し、journalEntries は除外
    const foldersWithAlerts = folders.map((folder) => {
      const alertCount = computeAlertCount(folder.documents);
      return {
        ...folder,
        alertCount,
        documents: folder.documents.map(({ journalEntries: _je, ...doc }) => doc),
      };
    });

    return NextResponse.json({ folders: foldersWithAlerts });
  } catch (error) {
    console.error("Error fetching folders:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "フォルダの取得に失敗しました", code: "FOLDER_LIST_FAILED", detail },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, creator, clientId } = await request.json();

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "フォルダ名を入力してください", code: "FOLDER_NO_NAME" },
        { status: 400 }
      );
    }

    const folder = await prisma.folder.create({
      data: {
        name: name.trim(),
        creator: creator || "",
        clientId: clientId || null,
      },
    });

    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Error creating folder:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "フォルダの作成に失敗しました", code: "FOLDER_CREATE_FAILED", detail },
      { status: 500 }
    );
  }
}
