import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyWithAI, classifyText, parseOCRText } from "@/lib/classifier";
import { normalizeTaxLines, type TaxLine } from "@/lib/ocr/schema";
import { auth } from "@/lib/auth";
import { getEffectiveRole } from "@/lib/roleSimulation";

/** 返す中身。同時実行をまとめる都合で、Response そのものは使い回さない */
type ClassifyResult = { status: number; body: unknown };

/**
 * いま分類中の書類。**同じ書類を同時に2本走らせないための鍵。**
 *
 * この処理は冒頭で既存の仕訳を deleteMany してから AI を呼ぶ。AI の応答に
 * 数秒かかるので、その間に2本目が入ると「両方が削除を終えてから、両方が作成する」
 * 形になり、**同じ経費が二重に記帳される**。
 *
 * 実際に踏める経路がある: 「ダブルチェック完了」は押すと各書類へ
 * `/api/classify` を投げるが、ボタンの disabled は再レンダー後にしか効かないため、
 * 反応がないと思って素早く2回押すと2本走る。同時実行で3件→6件になることを確認済み。
 *
 * 本番の PM2 は1プロセスなので、プロセス内の Map で足りる。
 */
const inFlight = new Map<string, Promise<ClassifyResult>>();

export async function POST(request: NextRequest) {
  let documentId: string | undefined;
  try {
    ({ documentId } = await request.json());
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が不正です", code: "CLASSIFY_BAD_REQUEST" },
      { status: 400 }
    );
  }

  if (!documentId) {
    return NextResponse.json({ error: "ドキュメントIDが必要です", code: "CLASSIFY_NO_DOCUMENT_ID" }, { status: 400 });
  }

  // 既に走っていれば、その結果をそのまま返す（2本目は新たに分類しない）
  const running = inFlight.get(documentId);
  if (running) {
    const result = await running;
    return NextResponse.json(result.body, { status: result.status });
  }

  const id = documentId;
  const task = runClassify(id).finally(() => inFlight.delete(id));
  inFlight.set(id, task);

  const result = await task;
  return NextResponse.json(result.body, { status: result.status });
}

/** DBに入っている税率の内訳（JSON文字列）を読む。壊れていれば空扱い */
function parseTaxLines(raw: string): TaxLine[] {
  if (!raw) return [];
  try {
    return normalizeTaxLines(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** 税率の内訳をOCRテキストに添えて、AIが税率ごとに分けられるようにする */
function withTaxLines(ocrText: string, lines: TaxLine[]): string {
  const rows = lines
    .map((l) => `- 税率${l.rate}% / 対象額（税込）${l.amount}円 / 消費税${l.tax || "不明"}円 / 品目: ${l.items || "不明"}`)
    .join("\n");
  return `${ocrText}\n\n---\n税率ごとの内訳（この数だけ仕訳を分けること）:\n${rows}`;
}

/**
 * 分けた仕訳の合計が、読み取った税込合計と合っているか。
 *
 * **合わないものは分けない。** 片方の金額をAIが取り違えると、
 * 合計が狂った仕訳が2件できてしまう。1件のまま人に見てもらうほうが安全。
 */
function sumMatches(items: { amount: number }[], pageAmount: string): boolean {
  const total = Number(String(pageAmount).replace(/[^\d]/g, ""));
  if (!total) return false;
  const sum = items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  return sum === total;
}

async function runClassify(documentId: string): Promise<ClassifyResult> {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
      },
    });

    if (!document) {
      return { status: 404, body: { error: "ドキュメントが見つかりません", code: "CLASSIFY_DOCUMENT_NOT_FOUND" } };
    }

    // 既存の仕訳を削除
    await prisma.journalEntry.deleteMany({
      where: { documentId },
    });

    const entries = [];

    // 分類対象のページ（テキストが空のページは除外）
    const targetPages = document.pages.filter(
      (p) => (p.correctedText || p.ocrText).trim() !== ""
    );

    if (targetPages.length === 0) {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "classified" },
      });
      return { status: 200, body: { entries: [] } };
    }

    // ページごとに分類する（1ページ＝1仕訳）。
    // 束ねてスキャンした複数枚の領収書が1件に合算されるのを防ぐため、
    // ページを結合せず個別にAIへ渡す。
    let useAI = true;
    const perPageEntries: {
      pageId: string;
      pageDate: string;
      item: Awaited<ReturnType<typeof classifyWithAI>>[number] | null;
    }[] = [];

    for (const page of targetPages) {
      const pageText = page.correctedText || page.ocrText;
      const taxLines = parseTaxLines(page.taxLines);

      try {
        const result = await classifyWithAI(
          taxLines.length > 0 ? withTaxLines(pageText, taxLines) : pageText
        );

        /*
          **原則は1ページ1仕訳。** 束ねてスキャンした領収書が1件に合算される
          事故を防ぐため、複数返っても先頭だけを採る。

          例外は税率が混在する場合。コンビニの領収書のように軽減税率8%と
          標準税率10%が1枚に混ざると、1件にまとめた時点で片方の税率が
          間違いになり、消費税額も合わなくなる。そこだけ内訳の数まで許す。
        */
        const allowed = taxLines.length > 0 ? taxLines.length : 1;
        const picked = result.slice(0, allowed);

        // 分けた結果の合計が読み取った税込合計と食い違うなら、分けない。
        // 中途半端に分かれるより、1件のまま人に確認してもらうほうが安全
        if (picked.length > 1 && !sumMatches(picked, page.amount)) {
          console.warn("税率ごとの合計が一致しないため1件にまとめます", { pageId: page.id });
          perPageEntries.push({ pageId: page.id, pageDate: page.date, item: result[0] || null });
          continue;
        }

        for (const item of picked) {
          perPageEntries.push({ pageId: page.id, pageDate: page.date, item });
        }
        if (picked.length === 0) {
          perPageEntries.push({ pageId: page.id, pageDate: page.date, item: null });
        }
      } catch (error) {
        console.warn("AI classification failed, falling back to keyword-based:", error);
        useAI = false;
        break;
      }
    }

    if (useAI && perPageEntries.some((p) => p.item)) {
      const today = new Date().toISOString().split("T")[0];

      for (const { pageId, pageDate, item } of perPageEntries) {
        if (!item) continue;
        const entry = await prisma.journalEntry.create({
          data: {
            documentId,
            pageId,
            // 日付はAI→そのページのOCR日付→今日 の順でフォールバック
            date: item.date || pageDate || today,
            description: item.description,
            accountCode: item.accountCode,
            accountName: item.accountName,
            subAccountCode: item.subAccountCode,
            subAccountName: item.subAccountName,
            debitAmount: item.amount,
            creditAmount: 0,
            taxRate: item.taxRate || "",
            aiSuggested: true,
            aiReasoning: item.reasoning,
            isConfirmed: false,
          },
        });
        entries.push(entry);
      }
    } else {
      // フォールバック: キーワードベースの分類（1ドキュメント1仕訳ルール適用）
      const allPageText = document.pages
        .map((p) => p.correctedText || p.ocrText)
        .filter((t) => t.trim())
        .join("\n");
      const parsedItems = parseOCRText(allPageText);

      if (parsedItems.length > 0) {
        // 先頭1件のみ使用
        const item = parsedItems[0];
        const classification = await classifyText(item.description);
        const entry = await prisma.journalEntry.create({
          data: {
            documentId,
            pageId: document.pages[0]?.id || null,
            date: item.date,
            description: item.description,
            accountCode: classification.accountCode,
            accountName: classification.accountName,
            subAccountCode: classification.subAccountCode,
            subAccountName: classification.subAccountName,
            debitAmount: item.amount,
            creditAmount: 0,
            aiSuggested: classification.confidence > 0,
            isConfirmed: false,
          },
        });
        entries.push(entry);
      } else if (allPageText.trim()) {
        const classification = await classifyText(allPageText);
        const today = new Date().toISOString().split("T")[0];
        const entry = await prisma.journalEntry.create({
          data: {
            documentId,
            pageId: document.pages[0]?.id || null,
            date: today,
            description: allPageText.substring(0, 100),
            accountCode: classification.accountCode,
            accountName: classification.accountName,
            subAccountCode: classification.subAccountCode,
            subAccountName: classification.subAccountName,
            debitAmount: 0,
            creditAmount: 0,
            aiSuggested: classification.confidence > 0,
            isConfirmed: false,
          },
        });
        entries.push(entry);
      }
    }

    // ステータスを更新
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "classified" },
    });

    // WorkLog: 分類完了を記録
    try {
      const userSession = await auth();
      if (userSession?.user) {
        const effectiveRole = getEffectiveRole(userSession.user.role || "");
        await prisma.workLog.create({
          data: {
            userId: userSession.user.id!,
            userName: userSession.user.name || "",
            userRole: effectiveRole,
            folderId: document.folderId || null,
            documentId,
            action: "classify_complete",
            workType: "classify",
          },
        });
      }
    } catch (logError) {
      console.error("WorkLog create error (classify):", logError);
    }

    return { status: 200, body: { entries } };
  } catch (error) {
    console.error("Classification error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return { status: 500, body: { error: "仕訳分類に失敗しました", code: "CLASSIFY_FAILED", detail } };
  }
}
