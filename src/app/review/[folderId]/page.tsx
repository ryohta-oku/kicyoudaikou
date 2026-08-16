import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getClientScope, isClientAllowed } from "@/lib/advisor";
import { resolveEntryImage } from "@/lib/entry-image";
import ReviewShell from "@/components/review/ReviewShell";
import ReviewList, { type ReviewRow } from "@/components/review/ReviewList";
import { resolvePreview } from "../page";

export const dynamic = "force-dynamic";

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
      client: { select: { name: true } },
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
              isConfirmed: true,
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

  const rows: ReviewRow[] = folder.documents
    .flatMap((doc) =>
      doc.journalEntries.map((e) => ({
        id: e.id,
        date: e.date,
        description: e.description,
        accountName: e.accountName,
        subAccountName: e.subAccountName,
        amount: e.debitAmount,
        taxRate: e.taxRate,
        filename: doc.filename,
        image: resolveEntryImage({
          pageId: e.pageId,
          filepath: doc.filepath,
          fileType: doc.fileType,
          pages: doc.pages,
        }),
        review: e.taxReview
          ? {
              status: e.taxReview.status,
              comment: e.taxReview.comment,
              reviewedByName: e.taxReview.reviewedByName,
              reviewerKind: e.taxReview.reviewerKind,
            }
          : null,
      }))
    )
    .sort((a, b) => a.date.localeCompare(b.date));

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
        rows={rows}
        readOnly={!!preview}
        readOnlyReason={preview ? "プレビューでは操作できません" : ""}
      />
    </ReviewShell>
  );
}
