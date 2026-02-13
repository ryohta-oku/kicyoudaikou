import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCSV, type CSVFormat } from "@/lib/csv";

export async function POST(request: NextRequest) {
  try {
    const { documentId, format = "generic" } = await request.json() as {
      documentId: string;
      format?: CSVFormat;
    };

    if (!documentId) {
      return NextResponse.json({ error: "ドキュメントIDが必要です" }, { status: 400 });
    }

    const entries = await prisma.journalEntry.findMany({
      where: { documentId, isConfirmed: true },
      orderBy: { date: "asc" },
    });

    if (entries.length === 0) {
      return NextResponse.json({ error: "確認済みの仕訳がありません" }, { status: 400 });
    }

    const csv = generateCSV(entries, format);

    // ドキュメントのステータスを更新
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "exported" },
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="journal_entries_${documentId}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "エクスポートに失敗しました" }, { status: 500 });
  }
}
