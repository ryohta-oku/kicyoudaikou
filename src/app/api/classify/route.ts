import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyWithAI, classifyText, parseOCRText } from "@/lib/classifier";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: "ドキュメントIDが必要です", code: "CLASSIFY_NO_DOCUMENT_ID" }, { status: 400 });
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "ドキュメントが見つかりません", code: "CLASSIFY_DOCUMENT_NOT_FOUND" }, { status: 404 });
    }

    // 既存の仕訳を削除
    await prisma.journalEntry.deleteMany({
      where: { documentId },
    });

    const entries = [];

    // 分類対象のページ（テキストが空のページは除外）
    const targetPages = document.pages.filter(
      (p) => (p.correctedText || p.ocrText).trim() !== ""
    );

    if (targetPages.length === 0) {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "classified" },
      });
      return NextResponse.json({ entries: [] });
    }

    // ページごとに分類する（1ページ＝1仕訳）。
    // 束ねてスキャンした複数枚の領収書が1件に合算されるのを防ぐため、
    // ページを結合せず個別にAIへ渡す。
    let useAI = true;
    const perPageEntries: {
      pageId: string;
      pageDate: string;
      item: Awaited<ReturnType<typeof classifyWithAI>>[number] | null;
    }[] = [];

    for (const page of targetPages) {
      const pageText = page.correctedText || page.ocrText;
      try {
        const result = await classifyWithAI(pageText);
        // 1ページにつき仕訳は1件。複数返っても先頭のみ採用する。
        perPageEntries.push({
          pageId: page.id,
          pageDate: page.date,
          item: result[0] || null,
        });
      } catch (error) {
        console.warn("AI classification failed, falling back to keyword-based:", error);
        useAI = false;
        break;
      }
    }

    if (useAI && perPageEntries.some((p) => p.item)) {
      const today = new Date().toISOString().split("T")[0];

      for (const { pageId, pageDate, item } of perPageEntries) {
        if (!item) continue;
        const entry = await prisma.journalEntry.create({
          data: {
            documentId,
            pageId,
            // 日付はAI→そのページのOCR日付→今日 の順でフォールバック
            date: item.date || pageDate || today,
            description: item.description,
            accountCode: item.accountCode,
            accountName: item.accountName,
            subAccountCode: item.subAccountCode,
            subAccountName: item.subAccountName,
            debitAmount: item.amount,
            creditAmount: 0,
            taxRate: item.taxRate || "",
            aiSuggested: true,
            aiReasoning: item.reasoning,
            isConfirmed: false,
          },
        });
        entries.push(entry);
      }
    } else {
      // フォールバック: キーワードベースの分類（1ドキュメント1仕訳ルール適用）
      const allPageText = document.pages
        .map((p) => p.correctedText || p.ocrText)
        .filter((t) => t.trim())
        .join("\n");
      const parsedItems = parseOCRText(allPageText);

      if (parsedItems.length > 0) {
        // 先頭1件のみ使用
        const item = parsedItems[0];
        const classification = await classifyText(item.description);
        const entry = await prisma.journalEntry.create({
          data: {
            documentId,
            pageId: document.pages[0]?.id || null,
            date: item.date,
            description: item.description,
            accountCode: classification.accountCode,
            accountName: classification.accountName,
            subAccountCode: classification.subAccountCode,
            subAccountName: classification.subAccountName,
            debitAmount: item.amount,
            creditAmount: 0,
            aiSuggested: classification.confidence > 0,
            isConfirmed: false,
          },
        });
        entries.push(entry);
      } else if (allPageText.trim()) {
        const classification = await classifyText(allPageText);
        const today = new Date().toISOString().split("T")[0];
        const entry = await prisma.journalEntry.create({
          data: {
            documentId,
            pageId: document.pages[0]?.id || null,
            date: today,
            description: allPageText.substring(0, 100),
            accountCode: classification.accountCode,
            accountName: classification.accountName,
            subAccountCode: classification.subAccountCode,
            subAccountName: classification.subAccountName,
            debitAmount: 0,
            creditAmount: 0,
            aiSuggested: classification.confidence > 0,
            isConfirmed: false,
          },
        });
        entries.push(entry);
      }
    }

    // ステータスを更新
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "classified" },
    });

    // WorkLog: 分類完了を記録
    try {
      const userSession = await auth();
      if (userSession?.user) {
        const effectiveRole = getEffectiveRole(userSession.user.role || "");
        await prisma.workLog.create({
          data: {
            userId: userSession.user.id!,
            userName: userSession.user.name || "",
            userRole: effectiveRole,
            folderId: document.folderId || null,
            documentId,
            action: "classify_complete",
            workType: "classify",
          },
        });
      }
    } catch (logError) {
      console.error("WorkLog create error (classify):", logError);
    }

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Classification error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "仕訳分類に失敗しました", code: "CLASSIFY_FAILED", detail }, { status: 500 });
  }
}
