import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getClientScope, isClientAllowed } from "@/lib/advisor";
import { resolveEntryImage } from "@/lib/entry-image";
import ReviewShell from "@/components/review/ReviewShell";
import ReviewList, { type ReceiptGroup } from "@/components/review/ReviewList";
import { INVOICE_KINDS, type InvoiceKind } from "@/lib/tax-class";
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
              accountName: true,
              subAccountName: true,
              debitAmount: true,
              taxRate: true,
              creditAccountName: true,
              isConfirmed: true,
              page: { select: { registrationNumber: true } },
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
        accountName: e.accountName,
        subAccountName: e.subAccountName,
        amount: e.debitAmount,
        taxRate: e.taxRate,
        // 行ごとの上書きが無ければ得意先の既定値。CSVの組み立てと同じ順番
        counterAccountName: e.creditAccountName || counterAccount,
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

  const receipts = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ReviewShell previewName={preview?.name} actingAsAdvisor={!!effective.actingAsAdvisor}>
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
        readOnly={!!preview}
        readOnlyReason={preview ? "プレビューでは操作できません" : ""}
      />
    </ReviewShell>
  );
}
