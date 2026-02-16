import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, name, clientId } = body;

    if (!accountId || !name) {
      return NextResponse.json(
        { error: "勘定科目IDと補助科目名は必須です", code: "SUB_ACCOUNT_MISSING_FIELDS" },
        { status: 400 }
      );
    }

    // 勘定科目の存在チェック
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json(
        { error: "指定された勘定科目が見つかりません", code: "ACCOUNT_NOT_FOUND" },
        { status: 404 }
      );
    }

    // 同一勘定科目内でname重複チェック
    const existing = await prisma.subAccount.findFirst({
      where: { accountId, name, clientId: clientId || null },
    });
    if (existing) {
      return NextResponse.json(
        { error: "同じ名前の補助科目が既に存在します", code: "SUB_ACCOUNT_DUPLICATE" },
        { status: 409 }
      );
    }

    // 自動採番: 既存の最大code + 1
    const maxSub = await prisma.subAccount.findFirst({
      where: { accountId },
      orderBy: { code: "desc" },
    });
    const nextCode = maxSub ? String(parseInt(maxSub.code) + 1).padStart(3, "0") : "001";

    const subAccount = await prisma.subAccount.create({
      data: {
        accountId,
        code: nextCode,
        name,
        clientId: clientId || null,
      },
    });

    return NextResponse.json({ subAccount });
  } catch (error) {
    console.error("Error creating sub account:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "補助科目の作成に失敗しました", code: "SUB_ACCOUNT_CREATE_FAILED", detail },
      { status: 500 }
    );
  }
}
