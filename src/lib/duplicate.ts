/**
 * 同じ領収書を2回取り込んでしまっていないかの判定。
 *
 * **事業所側の画面と税理士の確認画面で、この1つを使う。**
 * 2か所に別々の判定を書くと、利用者さんの画面では「重複？」なのに
 * 税理士さんの画面では何も出ない、という食い違いになる。
 *
 * ## 2つの番号を役割で分けて使う
 *
 *   レシート番号 … その1回の取引 → **同じ取引か**
 *   T番号        … その店・会社   → **同じ店か**
 *
 * T番号は同じ店の領収書なら全部同じなので、単独では重複を判定できない。
 * ただし「別の店でレジの通し番号が偶然そろった」を外すのに要る。
 *
 * ## 黙って消さない
 *
 * 候補だったものを除外したときは、**必ず理由を残す**（`excluded`）。
 * 機械が握りつぶしたのか、そもそも候補でなかったのかが分からないと、
 * 見逃しに気づけない。番号の読み違いを疑ったとき、ここを見れば分かる。
 */

import { normalizeReceiptNumber, receiptNumberDistance } from "./receipt-number";

export interface DuplicateEntry {
  id: string;
  /** 別のファイル由来かを見るのに使う。同じ書類の中は重複ではない */
  documentId: string;
  accountCode: string;
  debitAmount: number;
  creditAmount: number;
  /** "YYYY-MM-DD"。読み取れていなければ空文字 */
  date: string;
  /** その1回の取引の番号。読み取れていなければ空文字 */
  receiptNumber: string;
  /** 適格請求書発行事業者の登録番号（T番号）。店の識別に使う */
  registrationNumber: string;
  /** 「重複ではない」と人が判断済み */
  dismissed?: boolean;
  /** 削除依頼が出ている（別の経路で処理中） */
  pendingDeletion?: boolean;
}

/**
 * - `certain`  … 同じ領収書とみてよい（赤）
 * - `possible` … 重複かもしれない。人が原本を見比べる（オレンジ）
 * - `none`     … 出さない
 */
export type DuplicateLevel = "certain" | "possible" | "none";

export interface DuplicateVerdict {
  level: DuplicateLevel;
  /** なぜそう判断したか。**`none` のときも必ず入れる** */
  reason: string;
  /** 人に次にしてほしいこと */
  advice?: string;
}

/**
 * 重複を疑う土俵に乗るか。
 *
 * ここを通らないものは**そもそも候補ではない**ので、除外の記録にも残さない
 * （全部の組み合わせを「除外しました」と並べても読めない）。
 */
function isCandidate(a: DuplicateEntry, b: DuplicateEntry): boolean {
  if (a.documentId === b.documentId) return false;
  if (!a.accountCode || !b.accountCode || a.accountCode !== b.accountCode) return false;
  if (a.debitAmount <= 0 && a.creditAmount <= 0) return false;
  if (a.debitAmount !== b.debitAmount || a.creditAmount !== b.creditAmount) return false;
  // 日付は両方あって食い違うときだけ外す（片方が空なら、まだ分からない）
  if (a.date && b.date && a.date !== b.date) return false;
  return true;
}

/** 店が違うと言い切れるか。**どちらかが空なら言い切らない** */
function differentStore(a: DuplicateEntry, b: DuplicateEntry): boolean {
  return (
    !!a.registrationNumber &&
    !!b.registrationNumber &&
    a.registrationNumber.toUpperCase() !== b.registrationNumber.toUpperCase()
  );
}

/** 2件を突き合わせる。判定の中身はここ1か所 */
export function judgeDuplicate(a: DuplicateEntry, b: DuplicateEntry): DuplicateVerdict {
  if (a.documentId === b.documentId) {
    return { level: "none", reason: "同じ書類の中の明細です（1枚を税率で分けたもの）" };
  }
  if (!isCandidate(a, b)) {
    return { level: "none", reason: "金額・勘定科目・日付のいずれかが違います" };
  }

  const na = normalizeReceiptNumber(a.receiptNumber);
  const nb = normalizeReceiptNumber(b.receiptNumber);

  if (na && nb) {
    if (na === nb) {
      /*
        番号が同じなのに店が違う、はまず起きない。**それでも切り捨てない** ――
        かすれた領収書では登録番号のほうが読み違えられることがあり、
        いちばん強い手がかり（番号の一致）を消してしまうのは惜しい。
      */
      if (differentStore(a, b)) {
        return {
          level: "possible",
          reason: `レシート番号は同じ（${a.receiptNumber}）ですが、登録番号が違います`,
          advice: "原本で店名を見比べてください。別の店なら重複ではありません",
        };
      }
      return { level: "certain", reason: `レシート番号が同じです（${a.receiptNumber}）` };
    }

    /*
      1文字違いは**機械では決められない。** 2つの理由が同じ形になる ――

        連番   … 続けて買った別の取引（0031 と 0032）
        読み違い … かすれた紙で `0` と `8`、`1` と `7` が入れ替わった

      どちらとも取れるので、**見分けようとしない。** 番号を両方見せて、
      人が1回で決められるようにする。ここで「別の取引」と断じると
      本物の重複を黙って見逃すし、「重複」と断じれば連番のたびに手が止まる。
    */
    if (receiptNumberDistance(na, nb) === 1) {
      return {
        level: "possible",
        reason: `レシート番号が1文字違います（${a.receiptNumber} / ${b.receiptNumber}）`,
        advice: "続けて買った別の取引か、読み違いかのどちらかです。原本の番号を見比べてください",
      };
    }

    return {
      level: "none",
      reason: `レシート番号が違います（${a.receiptNumber} / ${b.receiptNumber}）`,
    };
  }

  // ここから先はレシート番号が片方または両方に無い
  if (differentStore(a, b)) {
    return {
      level: "none",
      reason: `別の店です（登録番号 ${a.registrationNumber} / ${b.registrationNumber}）`,
    };
  }

  const oneSide = !!na || !!nb;
  return {
    level: "possible",
    reason: oneSide
      ? "金額と勘定科目が同じですが、片方はレシート番号が読み取れていません"
      : "金額と勘定科目が同じです（レシート番号が読み取れていません）",
    advice: "原本を見比べてください",
  };
}

export interface DuplicateFinding {
  level: "certain" | "possible";
  reason: string;
  advice?: string;
  /** 相手の仕訳ID。比較の画面に渡す */
  partnerIds: string[];
}

export interface DuplicateExclusion {
  ids: [string, string];
  reason: string;
}

export interface DuplicateResult {
  /** 仕訳ID → 見つかったこと。出ないものは入らない */
  findings: Map<string, DuplicateFinding>;
  /** 候補ではあったが出さなかったもの。**理由を人が見られるように残す** */
  excluded: DuplicateExclusion[];
}

/** 強いほうを残す（certain が possible に負けない） */
function stronger(a: DuplicateLevel, b: DuplicateLevel): DuplicateLevel {
  if (a === "certain" || b === "certain") return "certain";
  if (a === "possible" || b === "possible") return "possible";
  return "none";
}

/**
 * 一覧ぜんぶを突き合わせる。
 *
 * 件数は1フォルダぶん（多くて数十件）なので、素直な総当たりで足りる。
 */
export function findDuplicates(entries: DuplicateEntry[]): DuplicateResult {
  const findings = new Map<string, DuplicateFinding>();
  const excluded: DuplicateExclusion[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];

      // 人が既に片を付けたものは、もう蒸し返さない
      if (a.dismissed || b.dismissed) continue;
      if (a.pendingDeletion || b.pendingDeletion) continue;

      if (!isCandidate(a, b)) continue;

      const verdict = judgeDuplicate(a, b);
      if (verdict.level === "none") {
        excluded.push({ ids: [a.id, b.id], reason: verdict.reason });
        continue;
      }

      for (const [self, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const found = findings.get(self.id);
        if (!found) {
          findings.set(self.id, {
            level: verdict.level,
            reason: verdict.reason,
            advice: verdict.advice,
            partnerIds: [other.id],
          });
          continue;
        }
        found.partnerIds.push(other.id);
        // 強いほうの言い分を残す（弱い理由で上書きしない）
        if (stronger(found.level, verdict.level) !== found.level) {
          found.level = verdict.level;
          found.reason = verdict.reason;
          found.advice = verdict.advice;
        }
      }
    }
  }

  return { findings, excluded };
}
