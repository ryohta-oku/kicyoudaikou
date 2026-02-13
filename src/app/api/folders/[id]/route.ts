import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        documents: {
          include: {
            pages: { select: { id: true } },
            _count: { select: { journalEntries: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { error: "フォルダが見つかりません", code: "FOLDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Error fetching folder:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "フォルダの取得に失敗しました", code: "FOLDER_GET_FAILED", detail },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.folder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting folder:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "フォルダの削除に失敗しました", code: "FOLDER_DELETE_FAILED", detail },
      { status: 500 }
    );
  }
}
