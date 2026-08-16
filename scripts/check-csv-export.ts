/**
 * 書き出したCSVが、3社の会計ソフトの仕様どおりかを確かめる。
 *
 *   npm run check:csv
 *
 * ## なぜ機械で見るのか
 *
 * ここは**目で見ても分からない**種類の間違いが起きる。列が1つずれていても、
 * 税区分の文字列が1文字違っても、Excelで開けば普通のCSVに見える。
 * 分かるのは税理士さんが取り込もうとした瞬間で、そのときには
 * 「CSVを出したあとに手で直す」作業が発生している ―― それを無くすのが目的だった。
 *
 * 仕様の出典（いずれも各社の公式ページ）:
 * - 弥生会計: 仕訳データのインポート形式（support.yayoi-kk.co.jp page_id=18545）25列
 * - マネーフォワード: 「仕訳帳」をインポートする（.../import-books/ib01.html）27列 A〜AA
 * - freee: その他の会計ソフトから仕訳データを移行する（.../articles/204847430）
 *
 * DBに触らないので、いつ実行しても安全。
 */
import iconv from "iconv-lite";
import {
  DEFAULT_EXPORT_SETTINGS,
  generateExportFile,
  type ExportSettings,
  type JournalEntryForExport,
} from "@/lib/csv";

let ng = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) ng++;
  console.log(
    `${ok ? "  OK  " : "  NG  "} ${name}` +
      (ok ? "" : `\n         実際: ${JSON.stringify(actual)}\n         期待: ${JSON.stringify(expected)}`)
  );
}

/** ダブルクォートを考慮してCSVの1行を分解する */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        current += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

function rowsOf(text: string): string[][] {
  return text
    .replace(/^﻿/, "")
    .split(/\r\n|\n/)
    .filter((l) => l !== "")
    .map(splitCsvLine);
}

/**
 * 実際に本番で起きる形をひととおり並べる。
 *
 * 先頭2件は**1枚の領収書を軽減税率で分けたもの**（コンビニで
 * お茶・おにぎり8% と コピー用紙10% を一緒に買った場合）。
 * 合計が税込1,302円になる実データと同じ形。
 */
const ENTRIES: JournalEntryForExport[] = [
  {
    date: "2026-04-03",
    description: "ローソン 芦屋店／お茶、おにぎり",
    accountCode: "7221",
    accountName: "会議費",
    subAccountCode: "",
    subAccountName: "ローソン 芦屋店",
    debitAmount: 378,
    creditAmount: 0,
    taxRate: "課税8%",
    hasRegistrationNumber: true,
  },
  {
    date: "2026-04-03",
    description: "ローソン 芦屋店／コピー用紙",
    accountCode: "7151",
    accountName: "消耗品費",
    subAccountCode: "",
    subAccountName: "ローソン 芦屋店",
    debitAmount: 924,
    creditAmount: 0,
    taxRate: "課税10%",
    hasRegistrationNumber: true,
  },
  {
    // 登録番号が無い領収書（免税事業者・手書き）
    date: "2026-04-10",
    description: "架空交通株式会社／タクシー代",
    accountCode: "7121",
    accountName: "旅費交通費",
    subAccountCode: "",
    subAccountName: "架空交通株式会社",
    debitAmount: 3280,
    creditAmount: 0,
    taxRate: "課税10%",
    hasRegistrationNumber: false,
  },
  {
    // 相手科目を仕訳ごとに上書きした場合（この1枚だけカード払い）
    date: "2026-04-15",
    description: "まちの文具店／事務用品",
    accountCode: "7151",
    accountName: "消耗品費",
    subAccountCode: "",
    subAccountName: "まちの文具店",
    debitAmount: 3680,
    creditAmount: 0,
    taxRate: "課税10%",
    creditAccountCode: "2121",
    creditAccountName: "未払金",
    hasRegistrationNumber: true,
  },
  {
    // 非課税（切手・印紙など）。カンマを含む摘要でクォートも試す
    date: "2026-04-20",
    description: "郵便局／切手, 印紙",
    accountCode: "7141",
    accountName: "通信費",
    subAccountCode: "",
    subAccountName: "郵便局",
    debitAmount: 840,
    creditAmount: 0,
    taxRate: "非課税",
    hasRegistrationNumber: false,
  },
];

const SETTINGS: ExportSettings = {
  defaultCounterAccountCode: "1111",
  defaultCounterAccountName: "現金",
  nonQualifiedInvoiceKind: "80%控除",
};

/** ① 弥生会計: 25列・ヘッダー行なし・Shift_JIS */
function checkYayoi() {
  console.log("\n=== ① 弥生会計（25列・ヘッダー行なし・Shift_JIS） ===");
  const file = generateExportFile(ENTRIES, "yayoi", SETTINGS);

  check("拡張子は .txt", file.filename.endsWith("_yayoi.txt"), true);
  check("文字コードは Shift_JIS", file.contentType.includes("Shift_JIS"), true);

  // Shift_JIS で書かれているか（UTF-8 のまま出ていないか）を実際に往復して見る
  const text = iconv.decode(file.data, "Shift_JIS");
  check("Shift_JIS から戻すと日本語が読める", text.includes("会議費"), true);
  check("UTF-8 として読むと壊れる（＝確かにShift_JIS）", file.data.toString("utf-8").includes("会議費"), false);

  const rows = rowsOf(text);
  check("行数は仕訳の件数と同じ（ヘッダー行を付けない）", rows.length, ENTRIES.length);
  check("全行が25列", [...new Set(rows.map((r) => r.length))], [25]);

  const first = rows[0];
  check("1列目 識別フラグ = 2000", first[0], "2000");
  check("4列目 取引日付はスラッシュ区切り", first[3], "2026/04/03");
  check("5列目 借方勘定科目", first[4], "会議費");
  check("6列目 借方補助科目", first[5], "ローソン 芦屋店");
  check("8列目 借方税区分（軽減8%・登録番号あり）", first[7], "課対仕入込軽減8%適格");
  check("9列目 借方金額（税込）", first[8], "378");
  check("10列目 借方税金額は空（税込経理なので弥生が計算）", first[9], "");
  check("11列目 貸方勘定科目 = 得意先の既定値", first[10], "現金");
  check("14列目 貸方税区分は対象外", first[13], "対象外");
  check("15列目 貸方金額は借方と同額", first[14], first[8]);
  check("20列目 タイプ = 0（仕訳）", first[19], "0");
  check("23・24列目 付箋 = 0", [first[22], first[23]], ["0", "0"]);
  check("25列目 調整 = no", first[24], "no");

  check("10%・登録番号あり", rows[1][7], "課対仕入込10%適格");
  check("10%・登録番号なし → 区分80%", rows[2][7], "課対仕入込10%区分80%");
  check("仕訳ごとの相手科目の上書きが効く", rows[3][10], "未払金");
  check("非課税にインボイスの区分は付けない", rows[4][7], "非課仕入");
  check("摘要のカンマがクォートされて列がずれない", rows[4][16], "郵便局／切手, 印紙");

  const sum = rows.reduce((acc, r) => acc + Number(r[8]), 0);
  check("借方金額の合計", sum, 378 + 924 + 3280 + 3680 + 840);
}

/** ② マネーフォワード: 27列 A〜AA・ヘッダー行あり */
function checkMoneyForward() {
  console.log("\n=== ② マネーフォワード クラウド会計（27列 A〜AA） ===");
  const file = generateExportFile(ENTRIES, "mf", SETTINGS);
  const text = file.data.toString("utf-8");

  check("拡張子は .csv", file.filename.endsWith("_mf.csv"), true);
  check("ExcelのためBOM付き", text.startsWith("﻿"), true);

  const rows = rowsOf(text);
  check("ヘッダー行＋仕訳の件数", rows.length, ENTRIES.length + 1);
  check("全行が27列（A〜AA）", [...new Set(rows.map((r) => r.length))], [27]);

  // ラベル行は「編集せずに使用」と明記されているので、公式の項目名と一字一句合わせる
  check("ヘッダーが公式の項目名と一致", rows[0], [
    "取引No", "取引日", "借方勘定科目", "借方補助科目", "借方部門", "借方取引先",
    "借方税区分", "借方インボイス", "借方金額(円)", "借方税額",
    "貸方勘定科目", "貸方補助科目", "貸方部門", "貸方取引先",
    "貸方税区分", "貸方インボイス", "貸方金額(円)", "貸方税額",
    "摘要", "仕訳メモ", "タグ", "MF仕訳タイプ", "決算整理仕訳",
    "作成日時", "作成者", "最終更新日時", "最終更新者",
  ]);

  const first = rows[1];
  check("A 取引No は1から", first[0], "1");
  check("B 取引日 yyyy/MM/dd", first[1], "2026/04/03");
  check("C 借方勘定科目", first[2], "会議費");
  check("G 借方税区分（軽減8%・税率の前に半角スペース）", first[6], "課税仕入 (軽)8%");
  check("H 借方インボイス（登録番号あり）", first[7], "適格");
  check("I 借方金額(円)", first[8], "378");
  check("J 借方税額は 0", first[9], "0");
  check("K 貸方勘定科目", first[10], "現金");
  check("O 貸方税区分", first[14], "対象外");
  check("P 貸方インボイスは空（相手科目には付けない）", first[15], "");
  check("Q 貸方金額(円) は借方と同額", first[16], first[8]);
  check("R 貸方税額は 0", first[17], "0");
  check("S 摘要", first[18], "ローソン 芦屋店／お茶、おにぎり");

  check("10% の税区分", rows[2][6], "課税仕入 10%");
  check("取引No は仕訳ごとに増える", rows[2][0], "2");
  // 空欄は「適格」とみなされる仕様。免税事業者の領収書が適格になっては困る
  check("登録番号なし → 全角％で 80％控除", rows[3][7], "80％控除");
  check("登録番号なしのインボイス欄が空でない", rows[3][7] !== "", true);
  check("非課税の税区分", rows[5][6], "非課税仕入");
  check("非課税にインボイスは付けない", rows[5][7], "");
}

/** ③ freee: [表題行] / [明細行] と伝票番号 */
function checkFreee() {
  console.log("\n=== ③ freee会計（他社会計ソフトインポート形式） ===");
  const file = generateExportFile(ENTRIES, "freee", SETTINGS);
  const text = file.data.toString("utf-8");
  const rows = rowsOf(text);

  check("ヘッダー行＋仕訳の件数", rows.length, ENTRIES.length + 1);
  check("列数が全行そろっている", [...new Set(rows.map((r) => r.length))], [16]);

  // ここが無いと freee は受け付けない
  check("ヘッダーの1列目が [表題行]", rows[0][0], "[表題行]");
  check("明細行の1列目が [明細行]", [...new Set(rows.slice(1).map((r) => r[0]))], ["[明細行]"]);

  check("必須項目がヘッダーに揃っている",
    ["日付", "伝票番号", "借方勘定科目", "借方金額", "貸方勘定科目", "貸方金額"].every((h) =>
      rows[0].includes(h)
    ),
    true
  );
  // 税込経理では税額の列を出さない（freee 側で自動計算させる）
  check("税額の列は出さない", rows[0].some((h) => h.includes("税額")), false);

  const first = rows[1];
  check("日付", first[1], "2026/04/03");
  check("伝票番号は1から（同じ番号は1仕訳にまとめられる）", first[2], "1");
  check("借方勘定科目", first[3], "会議費");
  check("借方科目コード", first[4], "7221");
  check("店名は補助科目でなく取引先に入れる", [first[5], first[6]], ["", "ローソン 芦屋店"]);
  check("借方金額（税込）", first[7], "378");
  check("借方税区分（軽減8%は全角括弧）", first[8], "課対仕入8%（軽）");
  check("貸方勘定科目", first[9], "現金");
  check("貸方税区分", first[14], "対象外");
  check("貸方金額は借方と同額", first[13], first[7]);

  check("伝票番号は仕訳ごとに違う", new Set(rows.slice(1).map((r) => r[2])).size, ENTRIES.length);
  check("10% の税区分", rows[2][8], "課対仕入10%");
  check("非課税の税区分", rows[5][8], "非課仕入");
  check("相手科目の上書き", rows[4][9], "未払金");
}

/** ④ どの形式でも壊れてはいけないこと */
function checkCommon() {
  console.log("\n=== ④ 3形式に共通して守れていること ===");

  for (const format of ["yayoi", "mf", "freee"] as const) {
    const file = generateExportFile(ENTRIES, format, SETTINGS);
    const text = format === "yayoi" ? iconv.decode(file.data, "Shift_JIS") : file.data.toString("utf-8");
    const rows = rowsOf(text);
    const body = format === "yayoi" ? rows : rows.slice(1);

    // 借方と貸方の位置は形式ごとに違う
    const at = { yayoi: [8, 14], mf: [8, 16], freee: [7, 13] }[format];
    const unbalanced = body.filter((r) => r[at[0]] !== r[at[1]]);
    check(`${format}: 全行で借方金額＝貸方金額`, unbalanced.length, 0);

    const emptyAccount = body.filter((r) => {
      const cols = { yayoi: [4, 10], mf: [2, 10], freee: [3, 9] }[format];
      return !r[cols[0]] || !r[cols[1]];
    });
    // 貸方勘定科目は3社とも必須。空だと取り込めない
    check(`${format}: 借方・貸方の勘定科目が全行埋まっている`, emptyAccount.length, 0);

    const emptyTax = body.filter((r) => {
      const cols = { yayoi: [7, 13], mf: [6, 14], freee: [8, 14] }[format];
      return !r[cols[0]] || !r[cols[1]];
    });
    check(`${format}: 借方・貸方の税区分が全行埋まっている`, emptyTax.length, 0);

    check(`${format}: 改行は CRLF`, text.includes("\r\n"), true);
  }

  // 得意先の設定を変えたら、ちゃんと出力に効くこと
  const other = generateExportFile(ENTRIES, "mf", {
    defaultCounterAccountCode: "2121",
    defaultCounterAccountName: "未払金",
    nonQualifiedInvoiceKind: "50%控除",
  });
  const rows = rowsOf(other.data.toString("utf-8"));
  check("得意先の既定の相手科目が効く", rows[1][10], "未払金");
  check("登録番号なしのインボイス区分の設定が効く", rows[3][7], "50％控除");
  check("上書きした仕訳は設定より優先される", rows[4][10], "未払金");

  // 既定値だけでも出せること（得意先が付いていないフォルダ）
  const fallback = generateExportFile(ENTRIES, "mf", DEFAULT_EXPORT_SETTINGS);
  check("得意先の設定が無くても貸方が埋まる", rowsOf(fallback.data.toString("utf-8"))[1][10], "現金");
}

function main() {
  console.log("CSV出力が3社の仕様どおりかを確かめます");
  checkYayoi();
  checkMoneyForward();
  checkFreee();
  checkCommon();

  console.log(ng === 0 ? "\n✅ すべて期待どおりです" : `\n❌ ${ng}件、期待と違います`);
  process.exit(ng === 0 ? 0 : 1);
}

main();
