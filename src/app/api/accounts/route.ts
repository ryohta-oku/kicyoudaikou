import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      include: { subAccounts: true },
      orderBy: { code: "asc" },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "勘定科目の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name, category } = body;

    if (!code || !name || !category) {
      return NextResponse.json({ error: "コード、名前、区分は必須です" }, { status: 400 });
    }

    const account = await prisma.account.create({
      data: { code, name, category },
    });

    return NextResponse.json({ account });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json({ error: "勘定科目の作成に失敗しました" }, { status: 500 });
  }
}
