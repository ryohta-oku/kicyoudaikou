/**
 * 仕訳1件から、その元になったレシートの見せ方を決める。
 *
 * フォルダ画面の詳細・比較モーダルで組み立てていたものを切り出した。
 * 税理士の確認画面でも同じ判断が要るため、**2か所に別々に書かない**。
 *
 * ## PDFがややこしい理由
 *
 * 画像ファイル（JPEG等）は1ページずつ画像が作られる:
 *   /uploads/pages/{documentId}/page_1.jpg
 *
 * **PDFは作られない。** 全ページの `imagePath` が同じPDF本体を指す。
 * そのため「3ページ目のレシート」を画像として出すことができず、
 * PDFを開いてページを指定する形になる。
 *
 * ここでは「画像で出せるか、PDFで出すしかないか」を返すところまでをやる。
 * PDFをブラウザで画像化して並べるのは別の段階。
 */

export type EntryImageSource =
  | {
      kind: "image";
      /** <img> / <Image> に渡すURL */
      src: string;
      pageNumber: number | null;
    }
  | {
      kind: "pdf";
      /**
       * PDF本体のURL。**`#page=` は付けない。**
       * canvas に描くときは `pageInFile` を渡し、iframe で開くときだけ
       * `pdfHref()` で付ける。
       */
      src: string;
      /**
       * **そのファイルの中で何ページ目か。**
       *
       * ページごとに分けたファイルなら常に 1。分割前に取り込んだ古い行は
       * 元の全ページPDFを指しているので、そのページ番号になる。
       * ここを取り違えると「何ページ目を選んでも1ページ目が出る」に戻る。
       */
      pageInFile: number;
      /** 書類の中で何ページ目か（表示用）。分からなければ null */
      pageNumber: number | null;
    }
  | { kind: "none" };

/**
 * iframe / 新しいタブで開くときのURL。
 *
 * `#page=N` を付けないと、何ページ目を選んでも1ページ目が表示される
 * （既存の OCR確認・仕訳確認の画面はその状態だった）。
 */
export function pdfHref(src: string, pageNumber: number | null): string {
  // 1ページ目は指定しなくても開く（ページごとに分けたファイルは常にここ）
  return pageNumber && pageNumber > 1 ? `${src}#page=${pageNumber}` : src;
}

/**
 * 編集画面（OCR確認・仕訳確認）でそのページを開くURL。
 *
 * ページ自身のファイルがあればそれを開く（1ページしか入っていないので `#page` は不要）。
 * 分割前に取り込んだ古い行は元の全ページPDFなので、ページ番号を付ける。
 */
export function pdfPageHref(
  pageImagePath: string | undefined,
  pageNumber: number,
  documentFilepath: string
): string {
  const own = !!pageImagePath?.startsWith("/uploads/pages/") &&
    pageImagePath.toLowerCase().endsWith(".pdf");
  if (own) return fileUrl(pageImagePath!);
  return `${fileUrl(documentFilepath)}#page=${pageNumber}`;
}

export interface EntryImageInput {
  /** 仕訳が指しているページ。null なら書類の先頭ページを使う */
  pageId: string | null;
  /** 書類の元ファイル（PDF本体など） */
  filepath: string;
  fileType: string;
  pages: { id: string; imagePath: string; pageNumber: number }[];
}

function fileUrl(path: string): string {
  return `/api/files?path=${encodeURIComponent(path)}`;
}

export function resolveEntryImage(input: EntryImageInput): EntryImageSource {
  const { pageId, filepath, fileType, pages } = input;

  const page = pageId ? pages.find((p) => p.id === pageId) : pages[0];
  const pageNumber = page?.pageNumber ?? null;

  const pathIsPdf = !!page?.imagePath?.toLowerCase().endsWith(".pdf");

  // ページ画像がある（画像ファイル由来）。これがいちばん見やすい
  if (page && !pathIsPdf) {
    return { kind: "image", src: fileUrl(page.imagePath), pageNumber };
  }

  // PDF。本体のURLとページ番号を返し、描き方は呼び出し側に任せる
  if (fileType === "pdf" || pathIsPdf) {
    /*
      そのページ自身のファイル（/uploads/pages/…）があるかどうかで、
      「ファイルの中の何ページ目か」が変わる。
      分けたファイルは1ページしか入っていないので必ず 1。
    */
    const ownFile = !!page && pathIsPdf && page.imagePath.startsWith("/uploads/pages/");
    return {
      kind: "pdf",
      src: fileUrl(page && pathIsPdf ? page.imagePath : filepath),
      pageInFile: ownFile ? 1 : (pageNumber ?? 1),
      pageNumber,
    };
  }

  return { kind: "none" };
}
