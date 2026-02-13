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
      return NextResponse.json({ error: "ドキュメントが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json({ error: "ドキュメントの取得に失敗しました" }, { status: 500 });
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

    return NextResponse.json({ document });
  } catch (error) {
    console.error("Error updating document:", error);
    return NextResponse.json({ error: "ドキュメントの更新に失敗しました" }, { status: 500 });
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
    return NextResponse.json({ error: "ドキュメントの削除に失敗しました" }, { status: 500 });
  }
}
