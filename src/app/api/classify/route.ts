import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyText, parseOCRText } from "@/lib/classifier";

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: "ドキュメントIDが必要です" }, { status: 400 });
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "ドキュメントが見つかりません" }, { status: 404 });
    }

    // 既存の仕訳を削除
    await prisma.journalEntry.deleteMany({
      where: { documentId },
    });

    const entries = [];

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

      // テキスト全体からも推測（parsedItemsが空の場合）
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

    // ステータスを更新
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "classified" },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Classification error:", error);
    return NextResponse.json({ error: "仕訳分類に失敗しました" }, { status: 500 });
  }
}
