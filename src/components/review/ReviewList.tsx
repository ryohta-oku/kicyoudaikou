"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, MessageSquareWarning, Loader2, CircleCheck, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { pdfHref, type EntryImageSource } from "@/lib/entry-image";
import PdfPageCanvas from "@/components/PdfPageCanvas";
import { EXPORT_FORMATS, downloadExport, type ExportFormat } from "@/lib/export-download";
import {
  mfInvoiceValue,
  normalizeTaxCategory,
  taxClassName,
  type InvoiceKind,
} from "@/lib/tax-class";

/** 伝票の1行（＝1仕訳） */
export interface ReviewLine {
  id: string;
  description: string;
  accountName: string;
  subAccountName: string;
  amount: number;
  taxRate: string;
  /** 貸方（相手科目）。CSVに実際に出るのはこの科目 */
  counterAccountName: string;
  /** 適格請求書の登録番号があったか。インボイス区分の判定に使う */
  hasRegistrationNumber: boolean;
  review: {
    status: string;
    comment: string;
    reviewedByName: string;
    reviewerKind: string;
  } | null;
}

/** レシート1枚＝伝票1つ。軽減税率が混ざると lines が複数になる */
export interface ReceiptGroup {
  key: string;
  date: string;
  filename: string;
  image: EntryImageSource;
  lines: ReviewLine[];
}

/**
 * 税理士の確認画面の中身。**左にレシート、右に伝票の表。**
 *
 * ## なぜ表なのか
 *
 * 軽減税率が混ざった1枚の領収書は複数の仕訳になる。1仕訳＝1カードで並べていた頃は、
 * **同じ1枚から出た2件**と**本物の重複**が同じ見た目になり、区別できなかった。
 *
 * 税理士さんは会計ソフトを日常的に使う人なので、会計ソフトの伝票と同じ読み方に寄せる。
 * 領収書・日付・判断のセルを `rowSpan` で縦につなぐのが、「1枚である」ことの
 * いちばん強い合図になる。
 *
 * ## 見せる語彙
 *
 * 税区分とインボイスは `@/lib/tax-class` の関数で写す。**CSVに実際に出る値**が
 * そのまま画面に出るので、税理士さんは取り込む前に中身を確かめられる。
 *
 * ## 左のレシート
 *
 * 以前はカーソルを合わせると拡大パネルを重ねていたが、拡大すると仕訳が隠れて
 * 「レシートを見る → 戻して仕訳を見る」の行き来が1件ごとに起きていた。
 * 確認は見比べる作業なので、同時に見えていないと成立しない。
 */

export default function ReviewList({
  folderId,
  folderName,
  receipts,
  nonQualifiedInvoiceKind,
  readOnly,
  readOnlyReason,
  initialStatus,
}: {
  folderId: string;
  folderName: string;
  receipts: ReceiptGroup[];
  nonQualifiedInvoiceKind: InvoiceKind;
  readOnly: boolean;
  readOnlyReason: string;
  initialStatus: string | null;
}) {
  const allLines = receipts.flatMap((g) => g.lines);

  const [state, setState] = useState<Record<string, ReviewLine["review"]>>(() =>
    Object.fromEntries(allLines.map((l) => [l.id, l.review]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [commenting, setCommenting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  /** 左に出しているレシート。カーソルが外れても戻さない */
  const [previewId, setPreviewId] = useState<string | null>(receipts[0]?.key ?? null);

  const [folderStatus, setFolderStatus] = useState<string | null>(initialStatus);
  const [finishing, setFinishing] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** 伝票の状態。全行そろって初めてその状態とみなす（中途半端は「未確認」） */
  const groupStatus = (g: ReceiptGroup): string | null => {
    const statuses = g.lines.map((l) => state[l.id]?.status);
    if (statuses.every((s) => s === "ok")) return "ok";
    if (statuses.some((s) => s === "needs_fix")) return "needs_fix";
    return null;
  };

  const okCount = allLines.filter((l) => state[l.id]?.status === "ok").length;
  const fixCount = allLines.filter((l) => state[l.id]?.status === "needs_fix").length;
  const allOk = allLines.length > 0 && okCount === allLines.length;

  const refuse = (id: string) => {
    setBlocked(id);
    setTimeout(() => setBlocked((b) => (b === id ? null : b)), 2500);
  };

  const finish = async (action: "approve" | "return") => {
    if (readOnly) return refuse("footer");
    setFinishing(true);
    try {
      const res = await fetch("/api/review/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "保存できませんでした");
        return;
      }
      setFolderStatus(data.taxReviewStatus);
    } finally {
      setFinishing(false);
    }
  };

  const exportCsv = async (format: ExportFormat) => {
    if (readOnly) return refuse("footer");
    setExporting(true);
    try {
      const error = await downloadExport({ folderId, format }, folderName);
      if (error) alert(error);
    } finally {
      setExporting(false);
    }
  };

  /**
   * 伝票（レシート1枚）ごとにまとめて保存する。
   *
   * 会計ソフトの承認と同じく、判断の単位は1枚。1枚が2仕訳に分かれていても、
   * 押すのは1回。記録は仕訳ごとに残るので、後から見たときの粒度は変わらない。
   */
  const save = async (group: ReceiptGroup, status: "ok" | "needs_fix", text: string) => {
    if (readOnly) return refuse(group.key);
    setSaving(group.key);
    try {
      const res = await fetch("/api/review/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId,
          entryIds: group.lines.map((l) => l.id),
          status,
          comment: text,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setState((prev) => ({ ...prev, ...data.reviews }));
      setCommenting(null);
      setComment("");
    } catch {
      alert("保存できませんでした。もう一度お試しください。");
    } finally {
      setSaving(null);
    }
  };

  const shown = receipts.find((g) => g.key === previewId) ?? receipts[0];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <span className="text-gray-700">
          全 <strong>{receipts.length}</strong> 枚（<strong>{allLines.length}</strong> 仕訳）
        </span>
        <span className="text-green-700">
          このままでよい <strong>{okCount}</strong> 仕訳
        </span>
        <span className="text-red-700">
          直してほしい <strong>{fixCount}</strong> 仕訳
        </span>
      </div>

      {/*
        左にレシート、右に仕訳。**重ねない。**

        以前はカーソルを合わせると拡大パネルを重ねていたが、拡大すると
        仕訳の内容が隠れるので、1件ごとに「レシートを見る → 戻して仕訳を見る」
        の行き来が起きていた。確認は見比べる作業なので、同時に見えていないと
        成立しない。それぞれに場所を与える。
      */}
      {/*
        左の幅は画面に合わせて変える。**ルートのフォントが18pxなので rem は
        見た目より12.5%大きい** ―― 24rem 固定のままだと 1280px の画面で
        右の表が入りきらず、表だけが横スクロールしていた。
        広い画面ではレシートを大きく見せたいので、2xl（1536px）で元の幅に戻す。
        xl だと 1280px ちょうどで効いてしまい、いちばん狭いデスクトップで
        表が入りきらない（メディアクエリの rem は常に16px基準で、
        ルートの18pxとは別物）。
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_1fr] 2xl:grid-cols-[minmax(0,24rem)_1fr] gap-4 lg:gap-6">
        <ReceiptPane row={shown} />

        {/*
          幅が足りないときは**表だけ**を横に流す。ページ全体が横スクロールすると
          左のレシートまで動いてしまい、見比べられなくなる。
        */}
        <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-600">
              <th className="w-16 px-2 pb-2 font-medium">領収書</th>
              <th className="w-24 px-2 pb-2 font-medium">日付</th>
              <th className="px-2 pb-2 font-medium">支払先・内容</th>
              <th className="w-24 px-2 pb-2 font-medium text-right">金額（税込）</th>
              <th className="w-24 px-2 pb-2 font-medium">勘定科目</th>
              <th className="w-28 px-2 pb-2 font-medium">税区分 / インボイス</th>
              <th className="w-24 px-2 pb-2 font-medium">判断</th>
            </tr>
          </thead>

          {receipts.map((group) => {
            const lines = group.lines;
            const status = groupStatus(group);
            const isSaving = saving === group.key;

            const savedComment = lines.map((l) => state[l.id]?.comment).find(Boolean) || "";
            const reviewer = lines.map((l) => state[l.id]).find(Boolean);
            const editing = commenting === group.key;
            /* 差し戻しの理由・入力欄は、伝票の下にもう1行として置く */
            const extraRow = editing || (status === "needs_fix" && savedComment) ? 1 : 0;
            /* 明細＋締め行（＋あれば理由の行）を、左右のセルが縦につなぐ */
            const span = lines.length + 1 + extraRow;

            const total = lines.reduce((sum, l) => sum + l.amount, 0);

            const tint =
              status === "ok" ? "bg-green-50/70" : status === "needs_fix" ? "bg-red-50/60" : "bg-white/85";
            const edge =
              previewId === group.key
                ? "border-teal-400"
                : status === "ok"
                  ? "border-green-200"
                  : status === "needs_fix"
                    ? "border-red-200"
                    : "border-gray-200";
            const cell = cn("px-2 py-2 align-top", tint, edge);

            return (
              <tbody
                key={group.key}
                /*
                  カーソルを合わせた伝票のレシートを左に出す。
                  **外れても戻さない** ―― 「よい」を押しに行く途中で
                  レシートが消えたら、見比べた意味がなくなる。
                */
                onMouseEnter={() => setPreviewId(group.key)}
              >
                {lines.map((line, i) => {
                  const category = normalizeTaxCategory(line.taxRate);
                  const invoice = line.hasRegistrationNumber ? "適格" : nonQualifiedInvoiceKind;
                  const isLast = i === lines.length - 1;
                  return (
                    <tr key={line.id}>
                      {i === 0 && (
                        <>
                          <td rowSpan={span} className={cn(cell, "border-l border-t border-b rounded-l-xl")}>
                            <Thumbnail image={group.image} alt={group.filename} />
                          </td>
                          <td rowSpan={span} className={cn(cell, "border-t border-b")}>
                            <div className="font-mono text-gray-800">{group.date || "日付なし"}</div>
                            <div className="text-[0.7rem] text-gray-400 mt-1 break-all">
                              {group.filename}
                            </div>
                            {/* いちばん誤解されやすいところなので、言葉でも書く */}
                            {lines.length > 1 && (
                              <div className="mt-1.5 inline-block text-[0.7rem] leading-tight text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                                1枚を税率で
                                <br />
                                {lines.length}件に分けています
                              </div>
                            )}
                          </td>
                        </>
                      )}

                      <td className={cn(cell, i === 0 && "border-t", !isLast && "border-b border-b-gray-100")}>
                        <div className="font-medium text-foreground">{line.subAccountName || "—"}</div>
                        <div className="text-xs text-gray-600 break-words">{line.description}</div>
                      </td>
                      <td
                        className={cn(
                          cell,
                          i === 0 && "border-t",
                          !isLast && "border-b border-b-gray-100",
                          "text-right font-mono font-bold tabular-nums text-foreground whitespace-nowrap"
                        )}
                      >
                        ¥{line.amount.toLocaleString()}
                      </td>
                      <td className={cn(cell, i === 0 && "border-t", !isLast && "border-b border-b-gray-100")}>
                        {line.accountName || "—"}
                      </td>
                      <td className={cn(cell, i === 0 && "border-t", !isLast && "border-b border-b-gray-100")}>
                        {/* CSVに実際に出る文字列をそのまま見せる */}
                        <div className="text-gray-800">{taxClassName(category, "purchase", "mf")}</div>
                        <div className="text-xs text-gray-500">
                          {mfInvoiceValue(category, "purchase", invoice) || "—"}
                        </div>
                      </td>

                      {i === 0 && (
                        <td rowSpan={span} className={cn(cell, "relative border-r border-t border-b rounded-r-xl")}>
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => (readOnly ? refuse(group.key) : save(group, "ok", ""))}
                              disabled={isSaving}
                              className={cn(
                                "inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors",
                                status === "ok"
                                  ? "bg-green-600 text-white"
                                  : "bg-white border border-gray-300 text-gray-700 hover:bg-green-50 hover:border-green-400"
                              )}
                            >
                              {isSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : status === "ok" ? (
                                <CircleCheck className="w-4 h-4" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                              よい
                            </button>
                            <button
                              onClick={() =>
                                readOnly
                                  ? refuse(group.key)
                                  : (setCommenting(group.key), setComment(savedComment))
                              }
                              className={cn(
                                "inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors",
                                status === "needs_fix"
                                  ? "bg-red-600 text-white"
                                  : "bg-white border border-gray-300 text-gray-700 hover:bg-red-50 hover:border-red-400"
                              )}
                            >
                              <MessageSquareWarning className="w-4 h-4" />
                              直して
                            </button>
                          </div>

                          {blocked === group.key && (
                            <div className="absolute right-2 top-full -mt-1 whitespace-nowrap bg-red-500 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg z-20">
                              {readOnlyReason}
                              <div className="absolute right-3 bottom-full border-4 border-transparent border-b-red-500" />
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/*
                  締め行。**1行だけのレシートでも必ず出す。**
                  相手科目（現金か未払金か）はCSVにそのまま出るもので、
                  税理士さんがいちばん直したくなる場所。見えていないと直せない。
                */}
                <tr>
                  <td
                    colSpan={4}
                    className={cn(
                      cell,
                      "border-t border-t-gray-200",
                      extraRow === 0 && "border-b"
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-gray-700">
                        <span className="text-xs text-gray-500 mr-1.5">貸方</span>
                        {[...new Set(lines.map((l) => l.counterAccountName))].join("・")}
                        <span className="text-xs text-gray-500 ml-1.5">対象外</span>
                      </span>
                      <span className="font-mono font-bold tabular-nums text-foreground">
                        合計 ¥{total.toLocaleString()}
                      </span>
                    </div>
                    {reviewer && (
                      <p className="mt-1 text-xs text-gray-500">
                        {reviewer.reviewedByName}
                        {reviewer.reviewerKind === "office_as_advisor" && "（事業所・税理士として）"}
                      </p>
                    )}
                  </td>
                </tr>

                {extraRow === 1 && (
                  <tr>
                    <td colSpan={4} className={cn(cell, "border-b")}>
                      {editing ? (
                        <div className="flex flex-wrap gap-2">
                          <input
                            autoFocus
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="どこを直してほしいか書いてください"
                            className="flex-1 min-w-[14rem] px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                          <button
                            onClick={() => save(group, "needs_fix", comment)}
                            disabled={!comment.trim() || isSaving}
                            className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                          >
                            差し戻す
                          </button>
                          <button
                            onClick={() => { setCommenting(null); setComment(""); }}
                            className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                          >
                            やめる
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          {savedComment}
                        </p>
                      )}
                    </td>
                  </tr>
                )}

                {/* 伝票と伝票のあいだの隙間。中の行はぴったり詰めたままにする */}
                <tr aria-hidden>
                  <td colSpan={7} className="h-3" />
                </tr>
              </tbody>
            );
          })}
        </table>
        </div>
      </div>

      {/* 全部見終わったあとの一手。**同時に光るものは一つだけにする** */}
      <div className="mt-6 card-glass rounded-xl p-4 relative">
        {folderStatus === "approved" ? (
          <div>
            <p className="font-bold text-green-800 mb-1">確認が終わりました</p>
            <p className="text-sm text-gray-600 mb-3">
              お使いの会計ソフトの形式でCSVを書き出せます。
            </p>
            <div className="flex flex-wrap gap-2">
              {EXPORT_FORMATS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => exportCsv(f.value)}
                  disabled={exporting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        ) : folderStatus === "returned" ? (
          <div>
            <p className="font-bold text-red-800 mb-1">事業所に差し戻しました</p>
            <p className="text-sm text-gray-600">
              直したら、また確認のお願いが届きます。
            </p>
          </div>
        ) : fixCount > 0 ? (
          <div>
            <p className="text-sm text-gray-700 mb-3">
              直してほしい仕訳が <strong>{fixCount}</strong> 件あります。事業所に戻しましょう。
            </p>
            <button
              onClick={() => finish("return")}
              disabled={finishing}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {finishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquareWarning className="w-4 h-4" />}
              事業所に差し戻す
            </button>
          </div>
        ) : allOk ? (
          <div>
            <p className="text-sm text-gray-700 mb-3">
              全部の仕訳を見終わりました。確認を完了してください。
            </p>
            <button
              onClick={() => finish("approve")}
              disabled={finishing}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold disabled:opacity-50"
            >
              {finishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CircleCheck className="w-5 h-5" />}
              確認を完了する
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            残り <strong>{allLines.length - okCount - fixCount}</strong> 仕訳です。
            領収書1枚ずつ「よい」か「直して」を選んでください。
          </p>
        )}

        {blocked === "footer" && (
          <div className="absolute left-4 bottom-full mb-2 whitespace-nowrap bg-red-500 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg z-20">
            {readOnlyReason}
            <div className="absolute left-4 top-full border-4 border-transparent border-t-red-500" />
          </div>
        )}
      </div>
    </div>
  );
}

/** 行の左に置く小さいレシート */
function Thumbnail({ image, alt }: { image: EntryImageSource; alt: string }) {
  const box = "w-14 h-[4.5rem] rounded-lg border border-gray-200 bg-white overflow-hidden flex items-center justify-center";

  if (image.kind === "image") {
    return (
      <div className={box}>
        <Image
          src={image.src}
          alt={alt}
          width={80}
          height={96}
          className="object-cover w-full h-full"
          unoptimized
        />
      </div>
    );
  }

  if (image.kind === "pdf") {
    // PDFにはページごとの画像が無いので、その場で描く
    return (
      <div className={box}>
        <PdfPageCanvas
          src={image.src}
          pageNumber={image.pageInFile}
          maxWidth={80}
          className="w-full h-full"
          label={`PDF ${image.pageNumber ?? 1}ページ`}
        />
      </div>
    );
  }

  return <div className={cn(box, "text-[10px] text-gray-400")}>画像なし</div>;
}

/**
 * 左に固定するレシート。
 *
 * **仕訳と重ならない場所を持つ**のが要。カーソルを合わせた行のものを出し、
 * 一覧をスクロールしても貼り付いたままにする。
 *
 * 画面が狭いときは上に積む（`lg:` の指定が外れる）。高さを抑えて、
 * 下の一覧が読めなくならないようにする。
 */
function ReceiptPane({ row }: { row: ReceiptGroup | undefined }) {
  if (!row) return null;
  const { image } = row;

  return (
    <div className="lg:sticky lg:top-4 self-start w-full">
      <div className="card-glass rounded-xl p-3">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-sm font-bold text-foreground truncate">{row.date || "日付なし"}</p>
          <p className="text-xs text-gray-500 truncate">{row.filename}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white overflow-auto max-h-[40vh] lg:max-h-[70vh] flex items-start justify-center">
          {image.kind === "image" ? (
            <Image
              src={image.src}
              alt={row.filename}
              width={700}
              height={950}
              className="w-full h-auto object-contain"
              unoptimized
            />
          ) : image.kind === "pdf" ? (
            <PdfPageCanvas
              src={image.src}
              pageNumber={image.pageInFile}
              /* 広めに描いて CSS で収める。幅が変わっても描き直さずに済む */
              maxWidth={700}
              className="w-full"
              label={`PDF ${image.pageNumber ?? 1}ページ`}
            />
          ) : (
            <p className="text-sm text-gray-400 py-10">画像がありません</p>
          )}
        </div>

        {image.kind !== "none" && (
          <a
            href={image.kind === "pdf" ? pdfHref(image.src, image.pageInFile) : image.src}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900"
          >
            <ExternalLink className="w-4 h-4" />
            元のファイルを開く（拡大して見る）
          </a>
        )}
      </div>
    </div>
  );
}
