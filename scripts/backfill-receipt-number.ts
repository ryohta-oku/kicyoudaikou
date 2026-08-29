/**
 * 過去に読み取った書類にレシート番号を埋める。
 *
 *   npx tsx scripts/backfill-receipt-number.ts          … 何が起きるか見るだけ
 *   npx tsx scripts/backfill-receipt-number.ts --apply  … 実際に書く
 *
 * ## AIを呼び直さない
 *
 * レシート番号は**既に読み取り済みの本文の中に入っている**（`No. 155693` のように）。
 * 項目として取り出していなかっただけなので、本文から拾えば足りる。
 * 再読み取りは費用も時間もかかるうえ、**前と違う結果を返す**ことがあり、
 * 人が確認済みの金額や日付まで揺らしかねない。本文からの拾い出しなら何も揺らさない。
 *
 * ## 上書きしない
 *
 * 既に番号が入っている行は触らない。人が直した本文から拾ったものが
 * 入っていることがあり、それを後から機械が塗り替える理由がない。
 *
 * ## 本文は「人が直したもの」を優先する
 *
 * `correctedText` が空でなければそちらを見る。読み取り直後は
 * `correctedText` に読み取り結果がそのまま入っているので、どちらでも同じ。
 * 人が直していれば、直した側の番号が正しい。
 */
/*
  **`.env` を自分で読む。** `DATABASE_URL` は Next.js が読み込むもので、
  スクリプトを単体で走らせたときには入っていない。入っていないと
  `src/lib/prisma.ts` の既定値 `file:./dev.db` に落ち、**空のDBを黙って作って**
  「テーブルがありません」で止まる（本番で実際に踏んだ）。
*/
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { extractReceiptNumber } from "@/lib/receipt-number";

if (!process.env.DATABASE_URL) {
  console.error(
    "\nDATABASE_URL が空です。空のDBを作ってしまうので止めます。\n" +
      "  .env に書くか、DATABASE_URL=\"file:./prisma/production.db\" を付けて実行してください\n"
  );
  process.exit(1);
}

const apply = process.argv.includes("--apply");

async function main() {
  const pages = await prisma.documentPage.findMany({
    where: { receiptNumber: "" },
    select: {
      id: true,
      pageNumber: true,
      ocrText: true,
      correctedText: true,
      document: { select: { filename: true } },
    },
    orderBy: { id: "asc" },
  });

  console.log(`\n番号が空のページ: ${pages.length} 件${apply ? "" : "（下見だけ。書き込みません）"}\n`);

  let found = 0;
  for (const page of pages) {
    const text = page.correctedText || page.ocrText;
    const number = extractReceiptNumber(text);
    const label = `${page.document.filename} p${page.pageNumber}`;

    if (!number) {
      console.log(`  −    ${label}  … 本文に番号なし`);
      continue;
    }

    found++;
    console.log(`  ✓    ${label}  … ${number}`);
    if (apply) {
      await prisma.documentPage.update({
        where: { id: page.id },
        data: { receiptNumber: number },
      });
    }
  }

  console.log(
    `\n拾えた: ${found} 件 / 見た: ${pages.length} 件` +
      (apply ? "（書き込みました）" : "\n実際に書くには --apply を付けてください") +
      "\n"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
