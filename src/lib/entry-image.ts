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
      /** iframe / embed に渡すURL。`#page=N` 付き */
      src: string;
      /** PDF内の何ページ目か（1始まり）。分からなければ null */
      pageNumber: number | null;
    }
  | { kind: "none" };

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

  /*
    PDF。**ページ番号を `#page=N` で渡す。**
    これが無いと、何ページ目を選んでも1ページ目が表示される
    （既存の OCR確認・仕訳確認の画面はその状態になっている）。
  */
  if (fileType === "pdf" || pathIsPdf) {
    const base = fileUrl(page && pathIsPdf ? page.imagePath : filepath);
    return {
      kind: "pdf",
      src: pageNumber ? `${base}#page=${pageNumber}` : base,
      pageNumber,
    };
  }

  return { kind: "none" };
}
