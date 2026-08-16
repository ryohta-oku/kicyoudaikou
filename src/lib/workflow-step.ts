/**
 * いまどの工程にいるかの判定。
 *
 * **もとは `WorkflowProgressBar` の中にあった。** 工程バーだけが使っていたが、
 * 説明のパネル（`GuidePanel`）も同じ判定を要るようになったので切り出した。
 * **中身は動かしていない** ―― 2か所に別々の判定を書くと、
 * バーは「仕訳分類」なのに説明は「最終確認」を出す、という形の食い違いになる。
 */

export interface FolderInfo {
  handoffStatus: string | null;
  doubleCheckStatus: string | null;
  needsDoubleCheck: boolean;
  taxReviewStatus?: string | null;
  documents: { status: string }[];
}

/** ステップの順序マップ（大きいほど進んでいる） */
export const STEP_ORDER: Record<string, number> = {
  upload: 0,
  ocr: 1,
  ocr_confirm: 2,
  double_check: 3,
  classify: 4,
  review: 5,
  final_review: 6,
  tax_review: 7,
  done: 8,
  handoff: 4, // B型の引き継ぎはダブルチェックの次
};

/** フォルダ内ドキュメントの実際のステータスから現在のステップを算出 */
export function computeCurrentStep(
  folder: FolderInfo,
  isTypeB: boolean,
  pathname: string
): string {
  const docs = folder.documents;
  if (docs.length === 0) return "upload";

  const statuses = docs.map((d) => d.status);

  // ダブルチェック中は役割を問わずこのステップ（2026-09-01 以降 A型もここを通る）
  if (folder.doubleCheckStatus === "pending") return "double_check";

  // 過去のB型フォルダ: 引き継ぎが最終ステップ
  if (isTypeB && folder.handoffStatus === "handed_off") return "handoff";
  if (isTypeB && folder.doubleCheckStatus === "completed") return "handoff";

  // 過去の「A型が引き継ぎ受け + ダブルチェック必要」のフォルダ
  if (!isTypeB && folder.handoffStatus === "handed_off" && folder.needsDoubleCheck) return "double_check";

  // ドキュメントステータスからステップを算出
  let statusStep: string;
  if (statuses.some((s) => s === "uploaded" || s === "ocr_processing")) {
    statusStep = "ocr";
  } else if (statuses.some((s) => s === "ocr_complete")) {
    statusStep = "ocr_confirm";
  } else if (statuses.every((s) => s === "ocr_confirmed")) {
    // OCR確認が済んだらダブルチェックの工程。済んでいれば仕訳へ進む
    statusStep =
      folder.doubleCheckStatus === "completed" ? "classify" : "double_check";
  } else if (statuses.every((s) => s === "exported")) {
    statusStep = "done";
  } else if (folder.taxReviewStatus === "pending") {
    // 税理士に預けている間。事業所の手は離れている
    statusStep = "tax_review";
  } else if (statuses.every((s) => s === "reviewed" || s === "exported")) {
    // 差し戻されたときもここに戻る（直してもう一度依頼する）
    statusStep = "final_review";
  } else if (statuses.some((s) => s === "classified" || s === "reviewed")) {
    statusStep = "review";
  } else {
    statusStep = "classify";
  }

  // 現在のページに対応するステップ
  let pageStep: string | null = null;
  if (pathname.endsWith("/classify")) {
    pageStep = "classify";
  }

  // ページのステップとドキュメントステータスの低い方を採用
  // （classifyページにいるのに「完了」になるのを防ぐ）
  if (pageStep && (STEP_ORDER[statusStep] ?? 0) > (STEP_ORDER[pageStep] ?? 0)) {
    return pageStep;
  }

  return statusStep;
}

/** パス名からフォルダIDを取得 */
export function extractFolderId(pathname: string): string | null {
  const match = pathname.match(/^\/folders\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * 工程 → 説明書の章。
 *
 * **その画面でやっている作業の分だけを出す**ための対応表。
 * 章を増やしたら、どの工程で出すのかをここに書く（書かないと誰の目にも触れない）。
 *
 * `null` は「フォルダの外」＝ダッシュボード。ここではスキャンから取り込みまでを出す。
 */
export const GUIDE_FOR_STEP: Record<string, number[]> = {
  upload: [3],
  ocr: [4],
  ocr_confirm: [4],
  double_check: [5],
  handoff: [5],
  classify: [6],
  review: [6],
  final_review: [7],
  tax_review: [7],
  done: [8],
};

/**
 * ダッシュボード（フォルダの外）で出す章。
 *
 * **トップページの Step 1〜4 と、この配列が同じもの。**
 * ①②③はトップでできる作業、④はフォルダを開いてからの作業だが、
 * 「次に何をするか」を見せるためにトップにも並べる。
 */
export const GUIDE_FOR_DASHBOARD = [1, 2, 3, 4];

/** 工程バーで使っている表示名。パネルの見出しにも使う */
export const STEP_LABELS: Record<string, string> = {
  upload: "アップロード",
  ocr: "OCR読み取り",
  ocr_confirm: "OCR確認",
  double_check: "ダブルチェック",
  classify: "仕訳分類",
  review: "仕訳確認",
  final_review: "最終確認",
  tax_review: "税理士確認",
  handoff: "引き継ぎ",
  done: "完了",
};
