import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getClientScope, isFolderAllowed, isExternalScope } from "@/lib/advisor";

/**
 * 税理士がその場で仕訳を直す。
 *
 * ## 既存の `/api/entries` を使わない理由
 *
 * あちらは `{ id, ...data }` を**そのまま prisma に流している**。
 * 社内だけで使っている間は成立していたが、社外の人が叩く口としては使えない ――
 * `isConfirmed` でも `documentId` でも、何でも書き換えられてしまう。
 *
 * ここでは**直してよい項目だけを名指しで受ける**。増やすときは、この配列に
 * 足すこと自体が「社外の人に触らせてよいか」を考える機会になる。
 *
 * ## 履歴を必ず残す
 *
 * 社外の人が帳簿を書き換えるので、何を誰がいつ変えたかを `EntryRevision` に残す。
 * 記録が無いと、あとで数字が違ったときに「元がこうだったのか、直したのか」が
 * 分からなくなる。
 */

/** 直してよい項目。**ここに無いものは受け取らない。** */
const EDITABLE = [
  { field: "date", label: "取引日", kind: "text" },
  { field: "description", label: "摘要", kind: "text" },
  { field: "accountCode", label: "勘定科目コード", kind: "text" },
  { field: "accountName", label: "勘定科目", kind: "text" },
  { field: "subAccountCode", label: "補助科目コード", kind: "text" },
  { field: "subAccountName", label: "補助科目", kind: "text" },
  { field: "creditAccountCode", label: "貸方コード", kind: "text" },
  { field: "creditAccountName", label: "貸方勘定科目", kind: "text" },
  { field: "taxRate", label: "税区分", kind: "text" },
  { field: "debitAmount", label: "金額", kind: "int" },
] as const;

type EditableField = (typeof EDITABLE)[number]["field"];

/** 履歴に残さない項目（コードは名称と対で動くので、名称だけ見せれば足りる） */
const HIDDEN_IN_HISTORY: EditableField[] = [
  "accountCode",
  "subAccountCode",
  "creditAccountCode",
];

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const scope = await getClientScope();
    if (!session?.user || !scope) {
      return NextResponse.json({ error: "認証が必要です", code: "EDIT_UNAUTHORIZED" }, { status: 401 });
    }

    // 税理士の立場で見ているときだけ直せる。事業所の画面には別の編集経路がある
    if (!isExternalScope(scope)) {
      return NextResponse.json(
        { error: "税理士として操作しているときだけ直せます", code: "EDIT_NOT_ADVISOR" },
        { status: 403 }
      );
    }

    const { folderId, entryId, patch } = (await request.json()) as {
      folderId?: string;
      entryId?: string;
      patch?: Record<string, unknown>;
    };

    if (!folderId || !entryId || !patch || typeof patch !== "object") {
      return NextResponse.json({ error: "入力が不正です", code: "EDIT_BAD_REQUEST" }, { status: 400 });
    }

    if (!(await isFolderAllowed(scope, folderId))) {
      return NextResponse.json({ error: "権限がありません", code: "EDIT_FORBIDDEN" }, { status: 403 });
    }

    const before = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: {
        date: true,
        description: true,
        accountCode: true,
        accountName: true,
        subAccountCode: true,
        subAccountName: true,
        creditAccountCode: true,
        creditAccountName: true,
        taxRate: true,
        debitAmount: true,
        document: { select: { folderId: true } },
      },
    });
    // このフォルダの仕訳でなければ、存在ごと知らせない
    if (!before || before.document.folderId !== folderId) {
      return NextResponse.json({ error: "仕訳が見つかりません", code: "EDIT_ENTRY_NOT_FOUND" }, { status: 404 });
    }

    /*
      受け取った値を1項目ずつ確かめて、**本当に変わったものだけ**を集める。
      変わっていない項目まで履歴に載せると、あとで見たときに何が起きたのか
      読み取れなくなる。
    */
    const data: Record<string, string | number> = {};
    const changes: { field: string; label: string; before: string; after: string }[] = [];

    for (const spec of EDITABLE) {
      if (!(spec.field in patch)) continue;
      const raw = patch[spec.field];
      const current = before[spec.field];

      if (spec.kind === "int") {
        const value = Number(String(raw ?? "").replace(/[^\d-]/g, ""));
        if (!Number.isFinite(value) || value < 0) {
          return NextResponse.json(
            { error: `${spec.label}は0以上の数字で入れてください`, code: "EDIT_BAD_VALUE" },
            { status: 400 }
          );
        }
        if (value === current) continue;
        data[spec.field] = value;
        changes.push({
          field: spec.field,
          label: spec.label,
          before: String(current),
          after: String(value),
        });
        continue;
      }

      const value = String(raw ?? "").trim();
      // 長すぎるものは会計ソフト側で切られるので、ここで止める
      if (value.length > 255) {
        return NextResponse.json(
          { error: `${spec.label}が長すぎます`, code: "EDIT_TOO_LONG" },
          { status: 400 }
        );
      }
      if (value === current) continue;
      data[spec.field] = value;
      if (!HIDDEN_IN_HISTORY.includes(spec.field)) {
        changes.push({
          field: spec.field,
          label: spec.label,
          before: String(current) || "（空）",
          after: value || "（空）",
        });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "変わったところがありません", code: "EDIT_NO_CHANGE" }, { status: 400 });
    }

    const changedByKind = scope.actingAsAdvisor ? "office_as_advisor" : "tax_advisor";

    const [entry] = await prisma.$transaction([
      prisma.journalEntry.update({
        where: { id: entryId },
        data,
        select: {
          id: true,
          date: true,
          description: true,
          accountCode: true,
          accountName: true,
          subAccountCode: true,
          subAccountName: true,
          creditAccountCode: true,
          creditAccountName: true,
          taxRate: true,
          debitAmount: true,
        },
      }),
      // コードだけが変わった場合も、直したこと自体は記録に残す
      prisma.entryRevision.create({
        data: {
          entryId,
          changedBy: session.user.id!,
          changedByName: session.user.name || "",
          changedByKind,
          changes: JSON.stringify(changes),
        },
      }),
    ]);

    return NextResponse.json({ entry, changes, changedByName: session.user.name || "" });
  } catch (error) {
    console.error("Tax review edit error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "保存に失敗しました", code: "EDIT_FAILED", detail }, { status: 500 });
  }
}
