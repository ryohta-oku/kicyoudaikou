import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SEED_ACCOUNTS } from "@/lib/accountSeed";

export async function POST() {
  try {
    let created = 0;
    let skipped = 0;

    for (const account of SEED_ACCOUNTS) {
      const existing = await prisma.account.findUnique({
        where: { code: account.code },
      });

      if (!existing) {
        await prisma.account.create({ data: account });
        created++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      message: `勘定科目マスターを登録しました (新規: ${created}, スキップ: ${skipped})`,
      created,
      skipped,
    });
  } catch (error) {
    console.error("Error seeding accounts:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "勘定科目の登録に失敗しました", code: "ACCOUNT_SEED_FAILED", detail }, { status: 500 });
  }
}
