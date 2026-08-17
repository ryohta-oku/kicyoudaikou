/**
 * レシート番号（その1回の取引に振られた番号）の取り出しと比較。
 *
 * ## なぜ要るか
 *
 * 重複の判定は長らく「金額と勘定科目が同じ」で見ていた。これだと、
 * **同じ日に同じ店で同じ額を2回買っただけ**の別々の領収書まで重複と出る。
 * 消す手立ては人が「重複ではない」と押すことだけだった。
 *
 * レシート番号は**その1回の取引を指す**ので、番号が違えば別の取引だと機械で言える。
 * 増やす方向だけでなく、**減らす方向にも効く**のがこの項目の値打ち。
 *
 * ## T番号（登録番号）とは役割が違う
 *
 *   レシート番号 … その取引     → 同じ取引か
 *   T番号        … その店・会社 → 同じ店か
 *
 * T番号は同じ店の領収書なら全部同じなので、単独では重複を判定できない。
 * ただし「別の店でレジの通し番号が偶然そろった」を外すのに要る。
 * 組み合わせ方は [duplicate.ts](./duplicate.ts) にある。
 */

/**
 * 番号の見出し。**「何の番号か」を名乗っているものだけを拾う。**
 *
 * `番号` だけで拾ってはいけない ―― 領収書には **`登録番号：T4010001000011`** や
 * **`電話番号`** が並んでいて、どちらも「番号」を含む。実データで確認済み。
 *
 * 頭と尻尾の組み合わせで作るのは、**書式が店ごとに違う**ため。
 * 実際に本番へ入っていたものだけでも `No. 155693` /
 * `レシート番号 0000-0031` / `領収書No: RB0120260210204915000` と3通りあった。
 * 尻尾を1つ足し忘れるだけで、その店の分だけ静かに拾えなくなる。
 */
const LABEL_HEADS = [
  "レシート",
  "取引",
  "伝票",
  "領収書",
  "領収証",
  "領収",
  "会計",
  "注文",
  "受付",
  "明細",
  "お買上",
  "お買い上げ",
];
const LABEL_TAILS = ["番号", "No", "NO", "ナンバー"];

/** 長いものから試す（`領収書No` が `領収No` に食われないように） */
const LABELS = LABEL_HEADS.flatMap((head) => LABEL_TAILS.map((tail) => head + tail)).sort(
  (a, b) => b.length - a.length
);

/**
 * 見出し付きの番号。「レシート番号 0000-0031」「領収書No: RB0120260210204915000」
 *
 * **31文字まで見る。** 実データに日時を埋め込んだ21文字の番号があり、
 * 短く切ると途中で切れた別物になってしまう（切れた番号どうしを比べると、
 * 別の取引が同じ番号に見える ―― いちばん避けたい間違い方）。
 */
const LABELED = new RegExp(
  `(?:${LABELS.join("|")})\\s*[:：#．.]?\\s*([0-9A-Za-z][0-9A-Za-z-]{1,31})`,
  "i"
);

/**
 * 見出しのない `No.` 形式。「No. 155693」
 *
 * **英単語の途中で拾わないよう、前に英字が来る場合は外す**（Nova など）。
 * 値は数字始まりに限る ―― `No` の後ろに店名が続く書式で店名を拾わないため。
 */
const BARE_NO = /(?<![A-Za-z])No\s*[.．:：#]?\s*([0-9][0-9A-Za-z-]{2,31})/i;

/**
 * 適格請求書発行事業者の登録番号。**番号として拾ってしまったら捨てる**ための照合。
 * （`normalizeRegistrationNumber` と同じ形だが、こちらは全体一致で使う）
 */
const T_NUMBER_ONLY = /^T\d{13}$/i;

/**
 * 読み取った本文からレシート番号を取り出す。
 *
 * **見出し付きを先に探す。** `No.` は書式として弱く、
 * 見出しのある書類ではそちらのほうが確かなため。
 */
export function extractReceiptNumber(text: string): string {
  // 全角の数字・英字・空白を半角に寄せてから探す（`№` も `No` になる）
  const normalized = String(text ?? "").normalize("NFKC");

  for (const pattern of [LABELED, BARE_NO]) {
    const found = normalized.match(pattern)?.[1];
    if (!found) continue;
    // 数字を1つも含まないものは番号ではない（見出しの直後の語を拾った場合など）
    if (!/\d/.test(found)) continue;
    if (T_NUMBER_ONLY.test(found)) continue;
    return found;
  }
  return "";
}

/**
 * 比較のための正規化。区切りと大小文字の違いを吸収する。
 *
 * `0000-0031` と `0000 0031` は同じ番号を指す。読み取りのたびに
 * 区切りの拾い方が変わることがあるので、比べる前にそろえる。
 * **先頭の0は落とさない** ―― 桁数そのものが番号の一部の店があるため。
 */
export function normalizeReceiptNumber(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
}

/**
 * 2つの番号がどれだけ違うか（レーベンシュタイン距離）。
 *
 * **「違うから別の取引」と言い切る前に、読み違いを疑うために要る。**
 * かすれた領収書では `0` と `8`、`1` と `7` が入れ替わる。
 * 1文字違いを「別の取引」と断じると、**本物の重複を黙って見逃す**。
 *
 * 番号はせいぜい20文字なので、素直な二次元の計算で足りる。
 */
export function receiptNumberDistance(a: string, b: string): number {
  const s = normalizeReceiptNumber(a);
  const t = normalizeReceiptNumber(b);
  if (s === t) return 0;
  if (!s || !t) return Math.max(s.length, t.length);

  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    for (let j = 1; j <= t.length; j++) {
      row[j] = Math.min(
        prev[j] + 1, // 削除
        row[j - 1] + 1, // 挿入
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1) // 置換
      );
    }
    prev = row;
  }
  return prev[t.length];
}
