import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 未承認削除依頼の一覧/件数取得
export async function GET(request: NextRequest) {
  try {
    const detail = request.nextUrl.searchParams.get("detail");

    if (detail === "true") {
      const items = await prisma.deletionRequest.findMany({
        where: { status: "pending" },
        include: {
          entry: {
            select: {
              id: true,
              date: true,
              description: true,
              accountCode: true,
              accountName: true,
              debitAmount: true,
              creditAmount: true,
              taxRate: true,
              documentId: true,
            },
          },
          document: {
            select: {
              id: true,
              filename: true,
              filepath: true,
              fileType: true,
              pages: {
                select: { id: true, imagePath: true, pageNumber: true },
                orderBy: { pageNumber: "asc" },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ items, count: items.length });
    }

    const count = await prisma.deletionRequest.count({
      where: { status: "pending" },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error fetching pending deletion requests:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
