import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const documents = await prisma.document.findMany({
      include: {
        pages: {
          select: { id: true, pageNumber: true, imagePath: true, ocrText: true, correctedText: true, date: true, registrationNumber: true, amount: true, tax: true, memo: true, isConfirmed: true },
        },
        _count: {
          select: { journalEntries: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // fileData はバイナリで巨大なためレスポンスから除外
    const sanitized = documents.map(({ fileData: _, ...doc }) => doc);

    return NextResponse.json({ documents: sanitized });
  } catch (error) {
    console.error("Error fetching documents:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ドキュメントの取得に失敗しました", code: "DOC_LIST_FAILED", detail }, { status: 500 });
  }
}
