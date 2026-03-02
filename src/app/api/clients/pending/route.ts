import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const detail = request.nextUrl.searchParams.get("detail");

    if (detail === "true") {
      const items = await prisma.company.findMany({
        where: { isApproved: false },
        include: {
          _count: { select: { folders: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ items, count: items.length });
    }

    const count = await prisma.company.count({
      where: { isApproved: false },
    });

    return NextResponse.json({ count });
  } catch (err) {
    console.error("Error fetching pending clients:", err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
