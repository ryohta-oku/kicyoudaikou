import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
        journalEntries: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "ドキュメントが見つかりません", code: "DOC_NOT_FOUND" }, { status: 404 });
    }

    // fileData / imageData はバイナリで巨大なためレスポンスから除外
    const { fileData: _, ...docWithoutFileData } = document;
    const sanitizedPages = document.pages.map(({ imageData: __, ...page }) => page);

    return NextResponse.json({ document: { ...docWithoutFileData, pages: sanitizedPages } });
  } catch (error) {
    console.error("Error fetching document:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ドキュメントの取得に失敗しました", code: "DOC_FETCH_FAILED", detail }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const document = await prisma.document.update({
      where: { id },
      data: body,
    });

    // fileData はバイナリで巨大なためレスポンスから除外
    const { fileData: _, ...docWithout } = document;
    return NextResponse.json({ document: docWithout });
  } catch (error) {
    console.error("Error updating document:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ドキュメントの更新に失敗しました", code: "DOC_UPDATE_FAILED", detail }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.document.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ドキュメントの削除に失敗しました", code: "DOC_DELETE_FAILED", detail }, { status: 500 });
  }
}
