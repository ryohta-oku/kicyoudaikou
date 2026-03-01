import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const detail = request.nextUrl.searchParams.get("detail");

    if (detail === "true") {
      const items = await prisma.subAccount.findMany({
        where: { isApproved: false },
        include: {
          account: { select: { code: true, name: true } },
          client: { select: { name: true } },
        },
        orderBy: { code: "asc" },
      });
      return NextResponse.json({ items, count: items.length });
    }

    const count = await prisma.subAccount.count({
      where: { isApproved: false },
    });

    return NextResponse.json({ count });
  } catch (err) {
    console.error("Error fetching pending sub accounts:", err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
