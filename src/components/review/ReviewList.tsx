"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, MessageSquareWarning, Loader2, FileText, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntryImageSource } from "@/lib/entry-image";

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
 * 1行 = 1仕訳。左にレシート、右に中身。
 *
 * **カーソルを合わせるとレシートが大きく出る。** 拡大は行の右側に重ねて出し、
 * 画面の下のほうの行では上向きに出す（下に出すと画面外に消えるため）。
 */
export default function ReviewList({
  folderId,
  rows,
  readOnly,
  readOnlyReason,
}: {
  folderId: string;
  rows: ReviewRow[];
  readOnly: boolean;
  readOnlyReason: string;
}) {
  const [state, setState] = useState<Record<string, ReviewRow["review"]>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.review]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [commenting, setCommenting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);

  const okCount = rows.filter((r) => state[r.id]?.status === "ok").length;
  const fixCount = rows.filter((r) => state[r.id]?.status === "needs_fix").length;

  const refuse = (id: string) => {
    setBlocked(id);
    setTimeout(() => setBlocked((b) => (b === id ? null : b)), 2500);
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

      <ul className="space-y-3">
        {rows.map((row, index) => {
          const r = state[row.id];
          const isLast = index >= rows.length - 2;
          return (
            <li
              key={row.id}
              className={cn(
                "card-glass rounded-xl p-3 flex gap-4",
                r?.status === "ok" && "ring-1 ring-green-200 bg-green-50/40",
                r?.status === "needs_fix" && "ring-1 ring-red-200 bg-red-50/40"
              )}
            >
              {/* 左: レシート。ホバーで拡大 */}
              <div className="relative group shrink-0">
                <Thumbnail image={row.image} alt={row.filename} />
                <Enlarged image={row.image} alt={row.filename} above={isLast} />
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
                  <span className="text-xs text-gray-400 truncate">{row.filename}</span>
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
  );
}

/** 行の左に置く小さいレシート */
function Thumbnail({ image, alt }: { image: EntryImageSource; alt: string }) {
  const box = "w-20 h-24 rounded-lg border border-gray-200 bg-white overflow-hidden flex items-center justify-center";

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
    // PDFにはページごとの画像が無いので、いまはアイコンで示す。
    // ブラウザで画像化して並べるのは次の段階
    return (
      <div className={cn(box, "flex-col gap-1 text-gray-500")}>
        <FileText className="w-7 h-7 text-teal-600" />
        <span className="text-[10px]">
          PDF{image.pageNumber ? ` ${image.pageNumber}ページ` : ""}
        </span>
      </div>
    );
  }

  return <div className={cn(box, "text-[10px] text-gray-400")}>画像なし</div>;
}

/** ホバーで出る大きいレシート */
function Enlarged({
  image,
  alt,
  above,
}: {
  image: EntryImageSource;
  alt: string;
  above: boolean;
}) {
  if (image.kind === "none") return null;

  return (
    <div
      className={cn(
        "hidden group-hover:block absolute left-full ml-3 z-30 pointer-events-none",
        above ? "bottom-0" : "top-0"
      )}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-2">
        {image.kind === "image" ? (
          <Image
            src={image.src}
            alt={alt}
            width={420}
            height={560}
            className="max-w-[420px] max-h-[70vh] w-auto h-auto object-contain"
            unoptimized
          />
        ) : (
          <div className="w-[420px] h-[520px]">
            <iframe src={image.src} className="w-full h-full rounded" title={alt} />
          </div>
        )}
      </div>
    </div>
  );
}
