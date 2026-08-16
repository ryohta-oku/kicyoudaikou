"use client";

/**
 * PDFの1ページだけをブラウザで画像にする。
 *
 * ## なぜサーバーでやらないのか
 *
 * PDFにはページごとの画像が無い（全ページが同じPDF本体を指す）。
 * サーバーで画像化するには poppler 等の導入が要るが、本番VPSには入っておらず、
 * 管理者権限も要る。PM2 のメモリ上限400MBの検証も必要になる。
 *
 * 見る人のブラウザで描けば、サーバーに何も足さずに済む。
 *
 * ## 読み込みは1回だけ
 *
 * 3ページのPDFは3行になるが、PDF自体は1つ。行ごとに取りに行くと同じものを
 * 3回ダウンロードするので、URLをキーにして使い回す。
 */

type PdfViewport = { width: number; height: number };
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage> };
type PdfPage = {
  getViewport(o: { scale: number }): PdfViewport;
  /**
   * **`canvas` を渡す。** v6 では必須で、`canvasContext` は後方互換の扱い
   * （そちらを使う場合は canvas を null にする必要がある）。
   * どちらも渡さないと描画が終わらないまま止まる。
   */
  render(o: { canvas: HTMLCanvasElement; viewport: PdfViewport }): PdfRenderTask;
};
type PdfRenderTask = { promise: Promise<void>; cancel(): void };

let pdfjs: typeof import("pdfjs-dist") | null = null;
const docs = new Map<string, Promise<PdfDoc>>();

/**
 * いま描いている最中の canvas。
 *
 * **同じ canvas に2つの描画を同時に走らせると pdf.js が拒否する。**
 * 開発中は React の Strict Mode で効果が2回走るため、これが普通に起きて
 * 「読めませんでした」の表示になっていた。前のものを打ち切ってから描く。
 */
const rendering = new WeakMap<HTMLCanvasElement, PdfRenderTask>();

async function getPdfjs() {
  if (pdfjs) return pdfjs;
  const lib = await import("pdfjs-dist");
  /*
    ワーカーは public/ に置いたものを固定のパスで指す。

    バンドラに解決させる書き方（new URL(..., import.meta.url)）は Turbopack だと
    期待どおりに解決されず、**ワーカーが起動しないまま描画が終わらない**状態になった。
    固定パスなら開発でも本番でも同じ挙動になる。

    ファイルは scripts/copy-pdf-worker.mjs が npm install のたびに置き直す。
    CDN を見に行かせないのは、事業所のネットワークやオフラインで
    動かなくなるのを避けるため。
  */
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  pdfjs = lib;
  return lib;
}

function loadDoc(url: string): Promise<PdfDoc> {
  const cached = docs.get(url);
  if (cached) return cached;

  const promise = (async () => {
    const lib = await getPdfjs();
    return (await lib.getDocument({ url }).promise) as unknown as PdfDoc;
  })();

  docs.set(url, promise);
  // 失敗したものを覚えたままにしない（次に開いたときに再試行できるように）
  promise.catch(() => docs.delete(url));
  return promise;
}

/**
 * 指定ページを canvas に描く。
 *
 * `maxWidth` に収まる倍率を自分で決める ―― 呼び出し側が拡大率を計算しなくて済む。
 */
export async function renderPdfPage(
  url: string,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  maxWidth: number
): Promise<void> {
  const doc = await loadDoc(url);
  const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));

  const base = page.getViewport({ scale: 1 });
  const cssScale = maxWidth / base.width;

  // 画面の解像度に合わせて描く（Retina でぼやけないように）。上限は2倍まで
  const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: cssScale * dpr });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(base.width * cssScale)}px`;
  /*
    **高さは px で固定しない。**
    インラインの指定はクラスの `h-auto` に勝つので、`max-w-full` で
    横に縮めたときに縦だけ残って縦横比が崩れる。
    レシートを出す場所は幅が変わるので、ここが効いてくる。
  */
  canvas.style.height = "auto";

  // 同じ canvas に前の描画が残っていたら打ち切る
  rendering.get(canvas)?.cancel();

  const task = page.render({ canvas, viewport });
  rendering.set(canvas, task);
  try {
    await task.promise;
  } finally {
    if (rendering.get(canvas) === task) rendering.delete(canvas);
  }
}

/** 画面から消えるときに呼ぶ。描きかけを残さない */
export function cancelPdfRender(canvas: HTMLCanvasElement): void {
  rendering.get(canvas)?.cancel();
  rendering.delete(canvas);
}
