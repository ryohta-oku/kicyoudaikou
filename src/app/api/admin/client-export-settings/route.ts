import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { INVOICE_KINDS, type InvoiceKind } from "@/lib/tax-class";

/**
 * 得意先ごとのCSV出力設定。
 *
 * ここで決まるのは2つだけだが、どちらも**無いとCSVが取り込めない/間違う**。
 *
 *  - 相手科目（貸方）… 弥生・マネーフォワード・freee のいずれも貸方勘定科目が必須。
 *    レシートは普通「現金」で払っているが、カード払い中心の顧問先は「未払金」になる。
 *  - 登録番号なしのインボイス区分 … マネーフォワードは**空欄を「適格」とみなす**ので、
 *    免税事業者の領収書が適格扱いになってしまう。必ず値を入れる。
 */

async function requireAdminOrInstructor() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (session.user.role !== "admin" && session.user.role !== "instructor") {
    return { error: NextResponse.json({ error: "管理者または指導者権限が必要です" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const clients = await prisma.company.findMany({
      where: { isApproved: true },
      select: {
        id: true,
        name: true,
        defaultCreditAccountCode: true,
        defaultCreditAccountName: true,
        nonQualifiedInvoiceKind: true,
      },
      orderBy: { name: "asc" },
    });

    // 相手科目の選択肢は勘定科目マスターから。資産・負債の科目だけを出す
    // （相手科目に費用や収益が来ることはない）
    const accounts = await prisma.account.findMany({
      where: { category: { in: ["資産", "負債"] } },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    });

    return NextResponse.json({ clients, accounts, invoiceKinds: INVOICE_KINDS });
  } catch (err) {
    console.error("client-export-settings GET error:", err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { clientId, creditAccountCode, nonQualifiedInvoiceKind } =
      (await request.json()) as {
        clientId?: string;
        creditAccountCode?: string;
        nonQualifiedInvoiceKind?: string;
      };

    if (!clientId) {
      return NextResponse.json({ error: "得意先IDが必要です" }, { status: 400 });
    }

    const data: {
      defaultCreditAccountCode?: string;
      defaultCreditAccountName?: string;
      nonQualifiedInvoiceKind?: string;
    } = {};

    if (creditAccountCode !== undefined) {
      // 勘定科目名はコードから引く。画面から来た名前は信用しない
      // （名前が違うと会計ソフト側でマッチせず、取り込み時に手作業が発生する）
      const account = await prisma.account.findUnique({
        where: { code: creditAccountCode },
        select: { code: true, name: true },
      });
      if (!account) {
        return NextResponse.json(
          { error: "その勘定科目コードは登録されていません" },
          { status: 400 }
        );
      }
      data.defaultCreditAccountCode = account.code;
      data.defaultCreditAccountName = account.name;
    }

    if (nonQualifiedInvoiceKind !== undefined) {
      if (!INVOICE_KINDS.includes(nonQualifiedInvoiceKind as InvoiceKind)) {
        return NextResponse.json({ error: "インボイス区分の値が不正です" }, { status: 400 });
      }
      data.nonQualifiedInvoiceKind = nonQualifiedInvoiceKind;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "変更する項目がありません" }, { status: 400 });
    }

    const client = await prisma.company.update({
      where: { id: clientId },
      data,
      select: {
        id: true,
        name: true,
        defaultCreditAccountCode: true,
        defaultCreditAccountName: true,
        nonQualifiedInvoiceKind: true,
      },
    });

    return NextResponse.json({ client });
  } catch (err) {
    console.error("client-export-settings PATCH error:", err);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
