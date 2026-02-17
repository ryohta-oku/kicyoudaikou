import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyWithAI, classifyText, parseOCRText } from "@/lib/classifier";

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

    // 全ページのOCRテキストを結合
    const allText = document.pages
      .map((p) => p.correctedText || p.ocrText)
      .filter((t) => t.trim())
      .join("\n---\n");

    if (!allText.trim()) {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "classified" },
      });
      return NextResponse.json({ entries: [] });
    }

    // AI分類を試行、失敗したらキーワードベースにフォールバック
    let useAI = true;
    let aiEntries: Awaited<ReturnType<typeof classifyWithAI>> = [];

    try {
      aiEntries = await classifyWithAI(allText);
    } catch (error) {
      console.warn("AI classification failed, falling back to keyword-based:", error);
      useAI = false;
    }

    if (useAI && aiEntries.length > 0) {
      // AI分類の結果をDB保存
      // ページのOCR日付をフォールバック用に収集
      const pageDates = document.pages
        .map((p) => p.date)
        .filter((d) => d && d.trim() !== "");
      const fallbackDate = pageDates[0] || new Date().toISOString().split("T")[0];

      for (const item of aiEntries) {
        const entry = await prisma.journalEntry.create({
          data: {
            documentId,
            pageId: document.pages[0]?.id || null,
            date: item.date || fallbackDate,
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
      // フォールバック: キーワードベースの分類
      for (const page of document.pages) {
        const text = page.correctedText || page.ocrText;
        const parsedItems = parseOCRText(text);

        for (const item of parsedItems) {
          const classification = await classifyText(item.description);
          const entry = await prisma.journalEntry.create({
            data: {
              documentId,
              pageId: page.id,
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
        }

        if (parsedItems.length === 0 && text.trim()) {
          const classification = await classifyText(text);
          const today = new Date().toISOString().split("T")[0];
          const entry = await prisma.journalEntry.create({
            data: {
              documentId,
              pageId: page.id,
              date: today,
              description: text.substring(0, 100),
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
    }

    // ステータスを更新
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "classified" },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Classification error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "仕訳分類に失敗しました", code: "CLASSIFY_FAILED", detail }, { status: 500 });
  }
}
