import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const documents = await prisma.document.findMany({
      include: {
        pages: true,
        _count: {
          select: { journalEntries: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json({ error: "ドキュメントの取得に失敗しました" }, { status: 500 });
  }
}
