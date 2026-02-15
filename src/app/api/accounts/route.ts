import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get("clientId");

    const accounts = await prisma.account.findMany({
      include: {
        subAccounts: clientId
          ? { where: { clientId } }
          : true,
      },
      orderBy: { code: "asc" },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "勘定科目の取得に失敗しました", code: "ACCOUNT_LIST_FAILED", detail }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name, category } = body;

    if (!code || !name || !category) {
      return NextResponse.json({ error: "コード、名前、区分は必須です", code: "ACCOUNT_MISSING_FIELDS" }, { status: 400 });
    }

    const account = await prisma.account.create({
      data: { code, name, category },
    });

    return NextResponse.json({ account });
  } catch (error) {
    console.error("Error creating account:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "勘定科目の作成に失敗しました", code: "ACCOUNT_CREATE_FAILED", detail }, { status: 500 });
  }
}
