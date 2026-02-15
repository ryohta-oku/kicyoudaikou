import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { targetId, sourceId } = await request.json();

    if (!targetId || !sourceId) {
      return NextResponse.json(
        { error: "targetId と sourceId は必須です" },
        { status: 400 }
      );
    }

    if (targetId === sourceId) {
      return NextResponse.json(
        { error: "統合先と統合元は異なる必要があります" },
        { status: 400 }
      );
    }

    // 両方の得意先が存在するか確認
    const [target, source] = await Promise.all([
      prisma.company.findUnique({ where: { id: targetId } }),
      prisma.company.findUnique({ where: { id: sourceId } }),
    ]);

    if (!target) {
      return NextResponse.json(
        { error: "統合先の得意先が見つかりません" },
        { status: 404 }
      );
    }
    if (!source) {
      return NextResponse.json(
        { error: "統合元の得意先が見つかりません" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. source の Folder を target に移動
      await tx.folder.updateMany({
        where: { clientId: sourceId },
        data: { clientId: targetId },
      });

      // 2. source の SubAccount を target に移動（競合チェック付き）
      const sourceSubAccounts = await tx.subAccount.findMany({
        where: { clientId: sourceId },
      });

      const targetSubAccounts = await tx.subAccount.findMany({
        where: { clientId: targetId },
      });

      // target 側に既存の (accountId, code) ペアのセット
      const targetKeys = new Set(
        targetSubAccounts.map((sa) => `${sa.accountId}:${sa.code}`)
      );

      for (const sa of sourceSubAccounts) {
        const key = `${sa.accountId}:${sa.code}`;
        if (targetKeys.has(key)) {
          // 競合 → source 側を削除（target 側を優先）
          await tx.subAccount.delete({ where: { id: sa.id } });
        } else {
          // 競合なし → target に移動
          await tx.subAccount.update({
            where: { id: sa.id },
            data: { clientId: targetId },
          });
        }
      }

      // 3. source の Company を削除
      await tx.company.delete({ where: { id: sourceId } });
    });

    return NextResponse.json({
      message: `「${source.name}」を「${target.name}」に統合しました`,
    });
  } catch (error) {
    console.error("Error merging clients:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "得意先の統合に失敗しました", detail },
      { status: 500 }
    );
  }
}
