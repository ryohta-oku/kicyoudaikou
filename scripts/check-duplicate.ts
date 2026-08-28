/**
 * 重複判定が期待どおりかを確かめる。
 *
 *   npm run check:dup
 *
 * ## なぜ機械で見るのか
 *
 * 重複の判定は**間違ったときに気づけない**種類の処理。出しすぎれば
 * 利用者さんが「重複ではない」を押す手間が増えるだけだが、**出さなすぎると
 * 同じ領収書が2回帳簿に載ったまま誰も気づかない**。画面を見て確かめられるのは
 * 前者だけなので、後者は機械で押さえる。
 *
 * 本文は**本番の実データから採った**もの（検証用サンプル商店のフォルダ）。
 * 作り物の文字列で通しても、現場の書式に当たったときの保証にならない。
 *
 * DBに触らないので、いつ実行しても安全。
 */
import { extractReceiptNumber, receiptNumberDistance } from "@/lib/receipt-number";
import { findDuplicates, judgeDuplicate, type DuplicateEntry } from "@/lib/duplicate";
import { parseOcrDocument } from "@/lib/ocr/parse";

let ng = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) ng++;
  console.log(
    `${ok ? "  OK  " : "  NG  "} ${name}` +
      (ok ? "" : `\n         実際: ${JSON.stringify(actual)}\n         期待: ${JSON.stringify(expected)}`)
  );
}

/* ------------------------------------------------------------------ *
 * 1. 本文からレシート番号を取り出す
 * ------------------------------------------------------------------ */
console.log("\n■ レシート番号の取り出し（本文は本番の実データ）");

/** 01-restaurant-10pct.jpg。見出しなしの `No.` 形式 */
const RESTAURANT = `領　収　書

2026年4月3日　　　　　　　　　　　　　　　　No. 155693

　　　　　　　　　　　　　　￥16,800
但　ご飲食代　として
居酒屋 まんぷく亭
兵庫県西宮市架空町1-2-3 テストビル2F
TEL：0798-00-0001
登録番号：T4010001000011`;

/** 05-conveni-mixed-tax.jpg。見出し付き・ハイフン入り */
const CONVENI = `ローソート芦屋店
兵庫県芦屋市夙川町9-9-9
TEL 0797-00-0000

2026年3月5日(木) 12:41
レシート番号 0000-0031

合計　　￥1,302
登録番号: T7010001000033`;

check("No. 形式を拾う", extractReceiptNumber(RESTAURANT), "155693");
check("レシート番号（見出し付き・ハイフン入り）を拾う", extractReceiptNumber(CONVENI), "0000-0031");

// ここが肝心。領収書には「番号」を含む項目が他にもある
check("登録番号（T番号）は拾わない", extractReceiptNumber("登録番号：T4010001000011"), "");
check("電話番号は拾わない", extractReceiptNumber("TEL：0798-00-0001"), "");
check("電話番号（見出し）は拾わない", extractReceiptNumber("電話番号 0798-00-0001"), "");
check(
  "登録番号が近くにあってもレシート番号を選ぶ",
  extractReceiptNumber("No. 155693\n登録番号：T4010001000011"),
  "155693"
);

check("全角の Ｎｏ．１５５６９３ を拾う", extractReceiptNumber("Ｎｏ．１５５６９３"), "155693");
check("№ 記号を拾う", extractReceiptNumber("№ 155693"), "155693");
check("伝票No を拾う", extractReceiptNumber("伝票No 12345"), "12345");
check("取引番号を拾う", extractReceiptNumber("取引番号: A-10023"), "A-10023");

/*
  本番で実際に使われた領収書（Bar GLICINA）。**見出しが「領収書No」で、
  値は英字始まりの21文字**。桁を短く切ると途中で切れた別物になり、
  切れた番号どうしが一致して「別の取引が同じ番号」に見える。
*/
const REAL_BAR = `0001-0001
会計日:2026/2/10
領収書
¥3,000-
TEL: 0798-78-5654
登録番号:T4810041754939
領収書No: RB0120260210204915000`;
check("領収書No（英字始まり・21文字）を拾う", extractReceiptNumber(REAL_BAR), "RB0120260210204915000");
check("英単語の途中では拾わない", extractReceiptNumber("Nova 12345"), "");
check("番号が無ければ空", extractReceiptNumber("領収書\n合計 ¥1,000"), "");

/*
  読み取りの経路を通っても番号が入ること。**AIが返さなくても本文から拾う**
  ―― プロンプトに項目を足しても、モデルが必ず返すとは限らない。
  ここが抜けると、新しく取り込んだ書類だけ静かに判定が効かなくなる。
*/
console.log("\n■ 読み取りの経路を通したとき");
const fromAi = parseOcrDocument(
  JSON.stringify({ pages: [{ ocrText: RESTAURANT, receiptNumber: "155693" }] })
);
check("AIが返した番号を使う", fromAi.pages[0].receiptNumber, "155693");

const noField = parseOcrDocument(JSON.stringify({ pages: [{ ocrText: RESTAURANT }] }));
check("AIが返さなくても本文から拾う", noField.pages[0].receiptNumber, "155693");

const wrongField = parseOcrDocument(
  JSON.stringify({ pages: [{ ocrText: RESTAURANT, receiptNumber: "T4010001000011" }] })
);
check("AIが登録番号を取り違えたら捨てて拾い直す", wrongField.pages[0].receiptNumber, "155693");

const noJson = parseOcrDocument(RESTAURANT);
check("JSONで返ってこなくても拾う", noJson.pages[0].receiptNumber, "155693");

console.log("\n■ 番号の比べ方");
check("区切りの違いは同じとみなす", receiptNumberDistance("0000-0031", "0000 0031"), 0);
check("1文字違いは距離1", receiptNumberDistance("155693", "155693".replace("0", "8")), 0);
check("0と8の読み違いは距離1", receiptNumberDistance("155603", "155683"), 1);
check("まったく別の番号は距離2以上", receiptNumberDistance("155693", "170120") >= 2, true);

/* ------------------------------------------------------------------ *
 * 2. 2件の突き合わせ
 * ------------------------------------------------------------------ */
console.log("\n■ 2件の突き合わせ");

/** 検証用の1行を作る。既定は「01-restaurant」 */
function entry(over: Partial<DuplicateEntry> = {}): DuplicateEntry {
  return {
    id: "a",
    documentId: "doc-a",
    accountCode: "7131",
    debitAmount: 16800,
    creditAmount: 0,
    date: "2026-04-03",
    receiptNumber: "155693",
    registrationNumber: "T4010001000011",
    ...over,
  };
}

const level = (a: DuplicateEntry, b: DuplicateEntry) => judgeDuplicate(a, b).level;

// 本番にある実際の組み合わせ
check(
  "同じ番号・同じ店 → ほぼ確定（01-restaurant と 06-faded）",
  level(entry(), entry({ id: "b", documentId: "doc-b" })),
  "certain"
);

check(
  "同じ書類の中の2行は重複ではない（コンビニの8%と10%）",
  level(
    entry({ accountCode: "7221", debitAmount: 378 }),
    entry({ id: "b", accountCode: "7221", debitAmount: 378 })
  ),
  "none"
);

// レシート番号が効く場面
check(
  "番号が違えば別の取引（同じ店・同じ額でも）",
  level(entry(), entry({ id: "b", documentId: "doc-b", receiptNumber: "170120" })),
  "none"
);
check(
  "番号が1文字違いなら読み違いを疑う",
  level(entry(), entry({ id: "b", documentId: "doc-b", receiptNumber: "155693".replace("9", "8") })),
  "possible"
);
check(
  "片方だけ番号が読めていれば、重複の可能性として残す",
  level(entry(), entry({ id: "b", documentId: "doc-b", receiptNumber: "" })),
  "possible"
);
check(
  "両方とも番号が無ければ、従来どおり金額で見る",
  level(
    entry({ receiptNumber: "" }),
    entry({ id: "b", documentId: "doc-b", receiptNumber: "" })
  ),
  "possible"
);

// T番号（店）が効く場面
check(
  "番号が読めず、店が違えば別の取引",
  level(
    entry({ receiptNumber: "" }),
    entry({ id: "b", documentId: "doc-b", receiptNumber: "", registrationNumber: "T9010001000099" })
  ),
  "none"
);
check(
  "番号は同じだが店が違う → 切り捨てず、人に確かめてもらう",
  level(entry(), entry({ id: "b", documentId: "doc-b", registrationNumber: "T9010001000099" })),
  "possible"
);
check(
  "片方に登録番号が無ければ、店が違うとは言い切らない",
  level(
    entry({ receiptNumber: "" }),
    entry({ id: "b", documentId: "doc-b", receiptNumber: "", registrationNumber: "" })
  ),
  "possible"
);

// 従来からの土俵
check(
  "金額が違えば候補ではない",
  level(entry(), entry({ id: "b", documentId: "doc-b", debitAmount: 16801 })),
  "none"
);
check(
  "日付が両方あって違えば候補ではない",
  level(entry(), entry({ id: "b", documentId: "doc-b", date: "2026-04-04" })),
  "none"
);
check(
  "片方の日付が空なら、まだ候補のまま",
  level(entry(), entry({ id: "b", documentId: "doc-b", date: "" })),
  "certain"
);
check(
  "勘定科目が違えば候補ではない",
  level(entry(), entry({ id: "b", documentId: "doc-b", accountCode: "7121" })),
  "none"
);

console.log("\n■ 除外したときも理由が残る");
const excludedVerdict = judgeDuplicate(
  entry(),
  entry({ id: "b", documentId: "doc-b", receiptNumber: "170120" })
);
check("理由が空でない", excludedVerdict.reason.length > 0, true);
check("両方の番号が理由に入る", excludedVerdict.reason.includes("155693") && excludedVerdict.reason.includes("170120"), true);

const adviceVerdict = judgeDuplicate(entry(), entry({ id: "b", documentId: "doc-b", receiptNumber: "" }));
check("次にすることが書いてある", adviceVerdict.advice, "原本を見比べてください");

/* ------------------------------------------------------------------ *
 * 3. 一覧ぜんぶ（本番の検証用フォルダと同じ形）
 * ------------------------------------------------------------------ */
console.log("\n■ 一覧ぜんぶ（本番の検証用フォルダ 8枚・11仕訳と同じ形）");

const FOLDER: DuplicateEntry[] = [
  // 01-restaurant / 06-faded / 07-multipage p1 は同じ領収書（No. 155693）
  entry({ id: "e01", documentId: "d01" }),
  entry({ id: "e06", documentId: "d06" }),
  entry({ id: "e07a", documentId: "d07" }),
  // 02-taxi / 07-multipage p2
  entry({ id: "e02", documentId: "d02", accountCode: "7121", debitAmount: 3280, date: "2026-04-10", receiptNumber: "170120", registrationNumber: "T1010001000022" }),
  entry({ id: "e07b", documentId: "d07", accountCode: "7121", debitAmount: 3280, date: "2026-04-10", receiptNumber: "170120", registrationNumber: "T1010001000022" }),
  // 03-supplies / 07-multipage p3（登録番号なしの店）
  entry({ id: "e03", documentId: "d03", accountCode: "7151", debitAmount: 3680, date: "2026-04-15", receiptNumber: "421297", registrationNumber: "" }),
  entry({ id: "e07c", documentId: "d07", accountCode: "7151", debitAmount: 3680, date: "2026-04-15", receiptNumber: "421297", registrationNumber: "" }),
  // 04-telecom / 08-single-invoice
  entry({ id: "e04", documentId: "d04", accountCode: "7141", debitAmount: 6600, date: "2026-04-20", receiptNumber: "893466", registrationNumber: "T5010001000044" }),
  entry({ id: "e08", documentId: "d08", accountCode: "7141", debitAmount: 6600, date: "2026-04-20", receiptNumber: "893466", registrationNumber: "T5010001000044" }),
  // 05-conveni は1枚を税率で2行に分けたもの。重複ではない
  entry({ id: "e05a", documentId: "d05", accountCode: "7221", debitAmount: 378, date: "2026-03-05", receiptNumber: "0000-0031", registrationNumber: "T7010001000033" }),
  entry({ id: "e05b", documentId: "d05", accountCode: "7151", debitAmount: 924, date: "2026-03-05", receiptNumber: "0000-0031", registrationNumber: "T7010001000033" }),
];

const result = findDuplicates(FOLDER);
const certain = [...result.findings.entries()].filter(([, f]) => f.level === "certain").map(([id]) => id);

check("ほぼ確定が9件（コンビニの2行以外すべて）", certain.length, 9);
check("コンビニの8%は出ない", result.findings.has("e05a"), false);
check("コンビニの10%は出ない", result.findings.has("e05b"), false);
check("3枚が同じ領収書のものは相手が2件ずつ", result.findings.get("e01")?.partnerIds.length, 2);

console.log("\n■ 誤検知が消えること（今回いちばん効かせたい所）");
/** 同じ日に同じ店で同じ額を2回。レジの通し番号は普通いくつも離れる */
const SAME_SHOP_TWICE: DuplicateEntry[] = [
  entry({ id: "x1", documentId: "dx1", accountCode: "7221", debitAmount: 500, date: "2026-04-01", receiptNumber: "0000-0031", registrationNumber: "T7010001000033" }),
  entry({ id: "x2", documentId: "dx2", accountCode: "7221", debitAmount: 500, date: "2026-04-01", receiptNumber: "0000-0058", registrationNumber: "T7010001000033" }),
];
const same = findDuplicates(SAME_SHOP_TWICE);
check("同じ日に同じ店で同じ額を2回 → 出さない", same.findings.size, 0);
check("出さなかった理由は残る", same.excluded.length, 1);
check("理由に番号が両方入る", same.excluded[0]?.reason.includes("0031") && same.excluded[0]?.reason.includes("0058"), true);

/*
  番号が隣り合っているときは**決めない。**「続けて買った別の取引」と
  「かすれて1桁読み違えた」が同じ形になるので、番号を見せて人に決めてもらう。
*/
const NEXT_IN_SEQUENCE: DuplicateEntry[] = [
  entry({ id: "n1", documentId: "dn1", accountCode: "7221", debitAmount: 500, date: "2026-04-01", receiptNumber: "0000-0031", registrationNumber: "T7010001000033" }),
  entry({ id: "n2", documentId: "dn2", accountCode: "7221", debitAmount: 500, date: "2026-04-01", receiptNumber: "0000-0032", registrationNumber: "T7010001000033" }),
];
const seq = findDuplicates(NEXT_IN_SEQUENCE);
check("番号が隣り合うときは決めつけず、人に見せる", seq.findings.get("n1")?.level, "possible");
check("そのとき両方の番号を出す", seq.findings.get("n1")?.reason.includes("0000-0032"), true);

const NO_NUMBER_YET: DuplicateEntry[] = [
  entry({ id: "y1", documentId: "dy1", receiptNumber: "" }),
  entry({ id: "y2", documentId: "dy2", receiptNumber: "" }),
];
check(
  "番号が取れない書類では、従来どおり出る（見逃さない）",
  findDuplicates(NO_NUMBER_YET).findings.size,
  2
);

console.log("\n■ 人が片を付けたものは蒸し返さない");
check(
  "「重複ではない」と押した組は出ない",
  findDuplicates([entry({ id: "z1", documentId: "dz1", dismissed: true }), entry({ id: "z2", documentId: "dz2" })]).findings.size,
  0
);
check(
  "削除依頼が出ている組は出ない",
  findDuplicates([entry({ id: "z1", documentId: "dz1", pendingDeletion: true }), entry({ id: "z2", documentId: "dz2" })]).findings.size,
  0
);

console.log(
  ng === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${ng} 件が期待と違います\n`
);
process.exit(ng === 0 ? 0 : 1);
