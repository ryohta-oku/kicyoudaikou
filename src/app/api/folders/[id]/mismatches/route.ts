import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // フォルダ内の全ドキュメントのページとスナップショットを取得
    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        documents: {
          include: {
            pages: {
              include: { snapshot: true },
              orderBy: { pageNumber: "asc" },
            },
          },
        },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "フォルダが見つかりません" }, { status: 404 });
    }

    const COMPARE_FIELDS = ["date", "registrationNumber", "amount", "tax", "memo"] as const;
    const FIELD_LABELS: Record<string, string> = {
      date: "日付",
      registrationNumber: "登録番号",
      amount: "金額（税込）",
      tax: "消費税",
      memo: "メモ",
    };

    const mismatches: {
      pageId: string;
      pageNumber: number;
      documentFilename: string;
      field: string;
      fieldLabel: string;
      firstValue: string;
      secondValue: string;
    }[] = [];

    for (const doc of folder.documents) {
      for (const page of doc.pages) {
        if (!page.snapshot) continue;
        for (const field of COMPARE_FIELDS) {
          const firstValue = page.snapshot[field] || "";
          const secondValue = page[field] || "";
          if (firstValue !== secondValue) {
            mismatches.push({
              pageId: page.id,
              pageNumber: page.pageNumber,
              documentFilename: doc.filename,
              field,
              fieldLabel: FIELD_LABELS[field] || field,
              firstValue,
              secondValue,
            });
          }
        }
      }
    }

    return NextResponse.json({ mismatches, count: mismatches.length });
  } catch (error) {
    console.error("Error fetching mismatches:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "不一致の取得に失敗しました", detail }, { status: 500 });
  }
}
