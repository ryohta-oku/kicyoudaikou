import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getClientScope, isClientAllowed, isExternalScope } from "@/lib/advisor";
import { resolveEntryImage } from "@/lib/entry-image";
import { findDuplicates } from "@/lib/duplicate";
import ReviewShell from "@/components/review/ReviewShell";
import ReviewList, { type ReceiptGroup } from "@/components/review/ReviewList";
import { INVOICE_KINDS, type InvoiceKind } from "@/lib/tax-class";
import { ADMIN_AREA_ROLES } from "@/lib/roles";
import { auth } from "@/lib/auth";
import { resolvePreview } from "../page";

export const dynamic = "force-dynamic";

/** DBの値を受け取る。想定外の文字列は既定に倒す（画面で嘘の区分を出さない） */
function normalizeInvoiceKind(raw: string | undefined): InvoiceKind {
  return INVOICE_KINDS.includes(raw as InvoiceKind) ? (raw as InvoiceKind) : "80%控除";
}

/**
 * 税理士の確認画面（本体）。
 *
 * マネーフォワードの外部記帳代行と同じ形にする ―― レシートが縦に並び、
 * カーソルを合わせると拡大され、その右に日付と勘定科目が出る。
 *
 * 読み込みはここ（サーバー）でやる。操作は ReviewList（client）に渡す。
 */
export default async function ReviewFolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ folderId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { folderId } = await params;
  const { as } = await searchParams;

  const scope = await getClientScope();
  if (!scope) redirect("/login");
  const userName = (await auth())?.user?.name || undefined;

  const preview = await resolvePreview(scope, as);
  const effective = preview?.scope ?? scope;

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: {
      id: true,
      name: true,
      taxReviewStatus: true,
      clientId: true,
      client: {
        select: {
          name: true,
          // 貸方（相手科目）の既定値。CSVに実際に出るのはこの科目なので、
          // 税理士さんが画面で確かめられるように渡す
          defaultCreditAccountCode: true,
          defaultCreditAccountName: true,
          // 登録番号が無い領収書のインボイス区分。画面とCSVで同じ値を出す
          nonQualifiedInvoiceKind: true,
        },
      },
      documents: {
        select: {
          id: true,
          filename: true,
          filepath: true,
          fileType: true,
          pages: {
            select: { id: true, imagePath: true, pageNumber: true },
            orderBy: { pageNumber: "asc" },
          },
          journalEntries: {
            select: {
              id: true,
              pageId: true,
              date: true,
              description: true,
              accountCode: true,
              accountName: true,
              subAccountName: true,
              debitAmount: true,
              taxRate: true,
              creditAccountCode: true,
              creditAccountName: true,
              isConfirmed: true,
              // 事業所が「重複ではない」と判断済みか。**警告を消すためではなく、
              // 添えて出すため**（判断の経緯を税理士さんに伝える）
              duplicateDismissed: true,
              // 登録番号は「適格かどうか」に、レシート番号は重複の判定に使う
              page: { select: { registrationNumber: true, receiptNumber: true } },
              // 直したことがあるか。いちばん新しい1件だけあれば「誰が直したか」は出せる
              revisions: {
                select: { changedByName: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
              taxReview: {
                select: { status: true, comment: true, reviewedByName: true, reviewerKind: true },
              },
            },
            orderBy: { date: "asc" },
          },
        },
      },
    },
  });

  if (!folder) notFound();
  // 担当外は「無い」ものとして扱う。存在を教えない
  if (!isClientAllowed(effective, folder.clientId)) notFound();

  const counterAccount = folder.client?.defaultCreditAccountName || "現金";
  const counterAccountCode = folder.client?.defaultCreditAccountCode || "1111";
  const invoiceKind = normalizeInvoiceKind(folder.client?.nonQualifiedInvoiceKind);

  /*
    **レシート単位にまとめてから画面に渡す。**

    軽減税率が混ざった1枚の領収書は複数の仕訳になる（お茶8%＝会議費、
    コピー用紙10%＝消耗品費）。1仕訳ずつ並べると、同じ1枚から出たものと
    本物の重複が同じ見た目になり、税理士さんが取り違える。

    まとめる鍵はページ（＝レシート1枚）。ページが無い古い行は書類でまとめる。
  */
  const groups = new Map<string, ReceiptGroup>();

  for (const doc of folder.documents) {
    for (const e of doc.journalEntries) {
      const key = e.pageId ?? `doc:${doc.id}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          date: e.date,
          filename: doc.filename,
          image: resolveEntryImage({
            pageId: e.pageId,
            filepath: doc.filepath,
            fileType: doc.fileType,
            pages: doc.pages,
          }),
          lines: [],
        };
        groups.set(key, group);
      }
      group.lines.push({
        id: e.id,
        description: e.description,
        accountCode: e.accountCode,
        accountName: e.accountName,
        subAccountName: e.subAccountName,
        amount: e.debitAmount,
        taxRate: e.taxRate,
        // 行ごとの上書きが無ければ得意先の既定値。CSVの組み立てと同じ順番
        counterAccountCode: e.creditAccountCode || counterAccountCode,
        counterAccountName: e.creditAccountName || counterAccount,
        editedByName: e.revisions[0]?.changedByName || undefined,
        // 「読み取れなかっただけ」と「元から無い」を区別しない ――
        // どちらも適格請求書として扱わないのが安全側（CSV側と同じ判断）
        hasRegistrationNumber: e.page ? e.page.registrationNumber !== "" : false,
        review: e.taxReview
          ? {
              status: e.taxReview.status,
              comment: e.taxReview.comment,
              reviewedByName: e.taxReview.reviewedByName,
              reviewerKind: e.taxReview.reviewerKind,
            }
          : null,
      });
    }
  }

  /*
    同じ領収書を2回入れていないか。

    **税理士さんは帳簿に載る前の最後の関門。** 同じ領収書の二重計上は
    記帳でいちばん起きやすい間違いで、ここで止められるのがいちばん効く。
    事業所側では利用者さんにしか出していないので、**利用者さんが見落とすと
    誰の目にも触れないままCSVになる** ―― その穴をここで塞ぐ。

    判定は事業所側とまったく同じ関数（[lib/duplicate.ts](@/lib/duplicate)）。
    画面によって答えが変わると、どちらを信じてよいか分からなくなる。
  */
  const groupOfEntry = new Map<string, string>();
  /** 事業所が「重複ではない」と判断済みの仕訳 */
  const dismissedIds = new Set<string>();
  const { findings } = findDuplicates(
    folder.documents.flatMap((doc) =>
      doc.journalEntries.map((e) => {
        const key = e.pageId ?? `doc:${doc.id}`;
        groupOfEntry.set(e.id, key);
        if (e.duplicateDismissed) dismissedIds.add(e.id);
        return {
          id: e.id,
          documentId: doc.id,
          accountCode: e.accountCode,
          debitAmount: e.debitAmount,
          creditAmount: 0,
          date: e.date,
          receiptNumber: e.page?.receiptNumber ?? "",
          registrationNumber: e.page?.registrationNumber ?? "",
          /*
            **`dismissed` は渡さない。** 事業所側では「重複ではない」と押した組を
            もう出さないが、ここでは出す ―― 利用者さんが見落として消してしまうと、
            そのまま帳簿に載る。それを止めるのがこの画面の役目。

            代わりに「事業所はこう判断した」と添える（下の `dismissedIds`）。
            黙って警告だけ出すと、済んだ話を蒸し返しているように見える。
          */
        };
      })
    )
  );

  for (const [entryId, finding] of findings) {
    const group = groups.get(groupOfEntry.get(entryId) ?? "");
    if (!group) continue;
    // 1枚から複数の仕訳が出るので、いちばん強い言い分を領収書の印にする
    if (group.duplicate?.level === "certain") continue;
    group.duplicate = {
      level: finding.level,
      reason: finding.reason,
      advice: finding.advice,
      officeDismissed: dismissedIds.has(entryId),
      /** 相手の領収書。**自分自身は入れない**（1枚の中の別の行が相手になることはない） */
      partnerFilenames: [
        ...new Set(
          finding.partnerIds
            .map((id) => groups.get(groupOfEntry.get(id) ?? "")?.filename)
            .filter((name): name is string => !!name && name !== group.filename)
        ),
      ],
    };
  }

  const receipts = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ReviewShell
      previewName={preview?.name}
      actingAsAdvisor={!!effective.actingAsAdvisor}
      canReturnToOffice={ADMIN_AREA_ROLES.includes(scope.role)}
      userName={userName}
    >
      <Link
        href={preview ? `/review?as=${preview.userId}` : "/review"}
        className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-900 mb-3"
      >
        <ArrowLeft className="w-4 h-4" />
        書類の一覧に戻る
      </Link>

      <h1 className="text-2xl font-black text-foreground">{folder.name}</h1>
      <p className="text-sm text-gray-600 mb-6">{folder.client?.name ?? "得意先なし"}</p>

      <ReviewList
        folderId={folder.id}
        folderName={folder.name}
        initialStatus={folder.taxReviewStatus}
        receipts={receipts}
        nonQualifiedInvoiceKind={invoiceKind}
        /*
          **税理士の立場で見ていないときは操作させない。**
          事業所の管理者はこの画面を開けるが、確認や修正のAPIは
          税理士の立場でないと 403 で断る。押せてしまうと、
          押してからエラーで気づくことになる。
        */
        readOnly={!!preview || !isExternalScope(effective)}
        readOnlyReason={
          preview
            ? "プレビューでは操作できません"
            : "「税理士として確認」に切り替えてから操作してください"
        }
      />
    </ReviewShell>
  );
}
