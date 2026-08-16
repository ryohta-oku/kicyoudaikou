/**
 * 仕訳CSVのダウンロード（画面側）。
 *
 * **ファイル名はサーバーが決める。** 弥生会計だけは Shift_JIS のテキスト（.txt）で、
 * 他はUTF-8のCSV。画面側で `.csv` を付けていた頃は、弥生のファイルが
 * `.csv` という名前で降りてきて、開くと文字化けして見えていた。
 */

/** 会計ソフトごとの出力形式。ラベルは3つの画面で同じものを使う */
export const EXPORT_FORMATS = [
  {
    value: "mf",
    label: "マネーフォワード クラウド会計",
    description: "「会計帳簿」＞「仕訳帳」＞インポート に、そのまま取り込めます",
  },
  {
    value: "freee",
    label: "freee会計",
    description: "「振替伝票」＞インポート＞他社会計ソフトインポート に取り込めます",
  },
  {
    value: "yayoi",
    label: "弥生会計",
    description: "仕訳データのインポート形式（Shift_JISのテキスト）で書き出します",
  },
  {
    value: "generic",
    label: "汎用形式",
    description: "中身を確かめるための一覧。会計ソフトへの取り込み用ではありません",
  },
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number]["value"];

/** Content-Disposition からファイル名を取り出す。読めなければ null */
function filenameFromResponse(res: Response): string | null {
  const header = res.headers.get("Content-Disposition");
  if (!header) return null;
  const match = header.match(/filename="([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * エクスポートして、そのままダウンロードする。
 * 失敗したらエラーメッセージを返す（成功時は null）。
 */
export async function downloadExport(
  body: { folderId?: string; documentId?: string; format: ExportFormat },
  fallbackBaseName = "journal_entries"
): Promise<string | null> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as { error?: string; code?: string }));
    const code = data.code ? `[${data.code}] ` : "";
    return `${code}${data.error || "エクスポートに失敗しました"}`;
  }

  const extension = body.format === "yayoi" ? "txt" : "csv";
  const filename =
    filenameFromResponse(res) || `${fallbackBaseName}_${body.format}.${extension}`;

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  window.document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
  return null;
}
