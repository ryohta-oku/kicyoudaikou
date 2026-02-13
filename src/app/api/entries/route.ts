import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 仕訳エントリの更新
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "エントリIDが必要です" }, { status: 400 });
    }

    const entry = await prisma.journalEntry.update({
      where: { id },
      data,
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Error updating entry:", error);
    return NextResponse.json({ error: "仕訳の更新に失敗しました" }, { status: 500 });
  }
}

// 仕訳エントリの新規作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const entry = await prisma.journalEntry.create({
      data: body,
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Error creating entry:", error);
    return NextResponse.json({ error: "仕訳の作成に失敗しました" }, { status: 500 });
  }
}

// 仕訳エントリの削除
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "エントリIDが必要です" }, { status: 400 });
    }

    await prisma.journalEntry.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting entry:", error);
    return NextResponse.json({ error: "仕訳の削除に失敗しました" }, { status: 500 });
  }
}
