import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCompanyName } from "@/lib/companyName";

export async function GET() {
  try {
    const clients = await prisma.company.findMany({
      orderBy: { createdAt: "asc" },
    });

    // 正規化名でグループ化
    const map = new Map<string, { id: string; name: string }[]>();
    for (const c of clients) {
      const normalized = normalizeCompanyName(c.name);
      if (!normalized) continue;
      const group = map.get(normalized) || [];
      group.push({ id: c.id, name: c.name });
      map.set(normalized, group);
    }

    // 2件以上あるグループのみ返す
    const groups = Array.from(map.entries())
      .filter(([, clients]) => clients.length >= 2)
      .map(([normalized, clients]) => ({ normalized, clients }));

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("Error detecting duplicates:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "重複検出に失敗しました", detail },
      { status: 500 }
    );
  }
}
