"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, MessageSquareWarning, Loader2, CircleCheck, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { pdfHref, type EntryImageSource } from "@/lib/entry-image";
import PdfPageCanvas from "@/components/PdfPageCanvas";

export interface ReviewRow {
  id: string;
  date: string;
  description: string;
  accountName: string;
  subAccountName: string;
  amount: number;
  taxRate: string;
  filename: string;
  image: EntryImageSource;
  review: {
    status: string;
    comment: string;
    reviewedByName: string;
    reviewerKind: string;
  } | null;
}

/**
 * 税理士の確認画面の中身。**左にレシート、右に仕訳の一覧。**
 *
 * 以前はカーソルを合わせると拡大パネルを重ねていたが、拡大すると仕訳が隠れて
 * 「レシートを見る → 戻して仕訳を見る」の行き来が1件ごとに起きていた。
 * 確認は見比べる作業なので、同時に見えていないと成立しない。
 *
 * 重ねるのをやめたことで、card-glass の backdrop-filter が行ごとに
 * 重なりの文脈を作る問題（拡大が次の行に潜り込む）も原因ごと消えている。
 */
const CSV_FORMATS = [
  { value: "generic", label: "汎用CSV" },
  { value: "yayoi", label: "弥生会計形式" },
  { value: "freee", label: "freee形式" },
] as const;

export default function ReviewList({
  folderId,
  folderName,
  rows,
  readOnly,
  readOnlyReason,
  initialStatus,
}: {
  folderId: string;
  folderName: string;
  rows: ReviewRow[];
  readOnly: boolean;
  readOnlyReason: string;
  initialStatus: string | null;
}) {
  const [state, setState] = useState<Record<string, ReviewRow["review"]>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.review]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [commenting, setCommenting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  /** 左に出しているレシートの行。カーソルが外れても戻さない */
  const [previewId, setPreviewId] = useState<string | null>(rows[0]?.id ?? null);

  const [folderStatus, setFolderStatus] = useState<string | null>(initialStatus);
  const [finishing, setFinishing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const okCount = rows.filter((r) => state[r.id]?.status === "ok").length;
  const fixCount = rows.filter((r) => state[r.id]?.status === "needs_fix").length;
  const allOk = rows.length > 0 && okCount === rows.length;

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

  const exportCsv = async (format: string) => {
    if (readOnly) return refuse("footer");
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, format }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "書き出せませんでした");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folderName}_${format}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } finally {
      setExporting(false);
    }
  };

  const save = async (entryId: string, status: "ok" | "needs_fix", text: string) => {
    if (readOnly) return refuse(entryId);
    setSaving(entryId);
    try {
      const res = await fetch("/api/review/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, entryId, status, comment: text }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setState((prev) => ({ ...prev, [entryId]: data.review }));
      setCommenting(null);
      setComment("");
    } catch {
      alert("保存できませんでした。もう一度お試しください。");
    } finally {
      setSaving(null);
    }
  };

  const shown = rows.find((r) => r.id === previewId) ?? rows[0];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <span className="text-gray-700">
          全 <strong>{rows.length}</strong> 件
        </span>
        <span className="text-green-700">
          このままでよい <strong>{okCount}</strong> 件
        </span>
        <span className="text-red-700">
          直してほしい <strong>{fixCount}</strong> 件
        </span>
      </div>

      {/*
        左にレシート、右に仕訳。**重ねない。**

        以前はカーソルを合わせると拡大パネルを重ねていたが、拡大すると
        仕訳の内容が隠れるので、1件ごとに「レシートを見る → 戻して仕訳を見る」
        の行き来が起きていた。確認は見比べる作業なので、同時に見えていないと
        成立しない。それぞれに場所を与える。
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,24rem)_1fr] gap-4 lg:gap-6">
        <ReceiptPane row={shown} />

        <ul className="space-y-3 min-w-0">
        {rows.map((row) => {
          const r = state[row.id];
          return (
            <li
              key={row.id}
              /*
                カーソルを合わせた行のレシートを左に出す。
                **外れても戻さない** ―― 「よい」を押しに行く途中で
                レシートが消えたら、見比べた意味がなくなる。
              */
              onMouseEnter={() => setPreviewId(row.id)}
              className={cn(
                "card-glass rounded-xl p-3 flex gap-3 transition-colors",
                previewId === row.id && "ring-2 ring-teal-400",
                r?.status === "ok" && "ring-1 ring-green-200 bg-green-50/40",
                r?.status === "needs_fix" && "ring-1 ring-red-200 bg-red-50/40"
              )}
            >
              {/* どの行かを見分けるための小さいレシート */}
              <div className="shrink-0">
                <Thumbnail image={row.image} alt={row.filename} />
              </div>

              {/* 右: 中身 */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-gray-700">{row.date || "日付なし"}</span>
                  <span className="font-bold text-foreground">{row.accountName || "勘定科目なし"}</span>
                  {row.subAccountName && (
                    <span className="text-sm text-gray-600">/ {row.subAccountName}</span>
                  )}
                </div>
                <p className="text-sm text-gray-700 mt-0.5 break-words">{row.description}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  <span className="font-mono font-bold text-foreground">
                    ¥{row.amount.toLocaleString()}
                  </span>
                  {row.taxRate && <span className="text-xs text-gray-600">{row.taxRate}</span>}
                  {/* ファイル名は左のレシート側に出す。横幅が減るので毎行には置かない */}
                </div>

                {r?.status === "needs_fix" && r.comment && (
                  <p className="mt-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {r.comment}
                  </p>
                )}
                {r && (
                  <p className="mt-1 text-xs text-gray-500">
                    {r.reviewedByName}
                    {r.reviewerKind === "office_as_advisor" && "（事業所・税理士として）"}
                  </p>
                )}

                {commenting === row.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      autoFocus
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="どこを直してほしいか書いてください"
                      className="flex-1 min-w-[16rem] px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                      onClick={() => save(row.id, "needs_fix", comment)}
                      disabled={!comment.trim() || saving === row.id}
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
                )}
              </div>

              {/* 右端: 判断 */}
              <div className="relative shrink-0 flex flex-col gap-1.5">
                <button
                  onClick={() => (readOnly ? refuse(row.id) : save(row.id, "ok", ""))}
                  disabled={saving === row.id}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors",
                    r?.status === "ok"
                      ? "bg-green-600 text-white"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-green-50 hover:border-green-400"
                  )}
                >
                  {saving === row.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : r?.status === "ok" ? (
                    <CircleCheck className="w-4 h-4" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  よい
                </button>
                <button
                  onClick={() => (readOnly ? refuse(row.id) : (setCommenting(row.id), setComment(r?.comment || "")))}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors",
                    r?.status === "needs_fix"
                      ? "bg-red-600 text-white"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-red-50 hover:border-red-400"
                  )}
                >
                  <MessageSquareWarning className="w-4 h-4" />
                  直して
                </button>

                {blocked === row.id && (
                  <div className="absolute right-0 top-full mt-1 whitespace-nowrap bg-red-500 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg z-20">
                    {readOnlyReason}
                    <div className="absolute right-3 bottom-full border-4 border-transparent border-b-red-500" />
                  </div>
                )}
              </div>
            </li>
          );
        })}
        </ul>
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
              {CSV_FORMATS.map((f) => (
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
            残り <strong>{rows.length - okCount - fixCount}</strong> 件です。
            1件ずつ「よい」か「直して」を選んでください。
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
function ReceiptPane({ row }: { row: ReviewRow | undefined }) {
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
