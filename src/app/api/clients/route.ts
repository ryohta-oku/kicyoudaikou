import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 会社名を正規化して比較用文字列を生成 */
function normalizeCompanyName(name: string): string {
  let s = name.trim();

  // 全角英数→半角英数
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );

  // 全角スペース→半角スペース
  s = s.replace(/　/g, " ");

  // 法人格の表記揺れを除去
  const corporateTypes = [
    "株式会社", "（株）", "(株)", "㈱",
    "有限会社", "（有）", "(有)", "㈲",
    "合同会社", "（合）", "(合)",
    "合資会社", "合名会社",
    "一般社団法人", "一般財団法人",
    "公益社団法人", "公益財団法人",
    "NPO法人", "特定非営利活動法人",
    "医療法人", "社会福祉法人",
    "学校法人", "宗教法人",
  ];
  for (const ct of corporateTypes) {
    s = s.replace(new RegExp(ct.replace(/[()（）]/g, "\\$&"), "g"), "");
  }

  // 空白除去、小文字化
  s = s.replace(/\s+/g, "").toLowerCase();

  return s;
}

export async function GET() {
  try {
    const clients = await prisma.company.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ clients });
  } catch (error) {
    console.error("Error fetching clients:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "得意先の取得に失敗しました", code: "CLIENT_LIST_FAILED", detail },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, force } = await request.json();

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "得意先名を入力してください", code: "CLIENT_NO_NAME" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // force でない場合、類似名チェック
    if (!force) {
      const normalized = normalizeCompanyName(trimmedName);
      if (normalized) {
        const allClients = await prisma.company.findMany();
        const similar = allClients.filter(
          (c) => normalizeCompanyName(c.name) === normalized
        );

        if (similar.length > 0) {
          return NextResponse.json(
            {
              code: "CLIENT_SIMILAR_EXISTS",
              similarClients: similar.map((c) => ({ id: c.id, name: c.name })),
            },
            { status: 409 }
          );
        }
      }
    }

    const client = await prisma.company.create({
      data: { name: trimmedName },
    });

    return NextResponse.json({ client });
  } catch (error) {
    console.error("Error creating client:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "得意先の作成に失敗しました", code: "CLIENT_CREATE_FAILED", detail },
      { status: 500 }
    );
  }
}
