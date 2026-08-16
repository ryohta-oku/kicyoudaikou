import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";
import { GUIDE_CHAPTERS } from "@/components/guide/content";
import { Section, Steps, Note, Tip, Trouble, ToConfirm } from "@/components/guide/GuideParts";
import { FigureWholeFlow } from "@/components/guide/ScannerFigures";

export const metadata = { title: "はじめての方へ | 記帳代行ツール" };

/**
 * 利用者さん向けの説明書（通しで読む版）。
 *
 * **文章はここには無い。** 中身は `components/guide/content.tsx` にあり、
 * 作業画面の横に出すパネル（`GuidePanel`）と同じものを読む。
 * ここがやるのは「全部を順に並べて、紙に印刷できる形にする」ことだけ。
 *
 * 印刷用の指定は `globals.css` に置いている
 * （アプリの上枠だけ消し、章の途中で改ページしない）。
 */
export default function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="print:hidden">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-900">
          <ArrowLeft className="w-4 h-4" />
          ダッシュボードに戻る
        </Link>
      </div>

      <header className="card-glass rounded-xl p-5 md:p-6">
        <h1 className="text-2xl md:text-3xl font-black text-foreground mb-2">はじめての方へ</h1>
        <p className="text-gray-700 leading-relaxed">
          紙のレシートを、会計ソフトに入れられるデータにするまでの流れです。
          上から順にやれば終わります。
          <strong className="text-foreground">分からなくなったら、いつでもここに戻ってきてください。</strong>
        </p>

        <div className="mt-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">ぜんぶで8つです</h2>
          <FigureWholeFlow />
        </div>

        <p className="text-sm text-gray-600 mt-4">
          1〜2はスキャナーの作業、3〜8はこの画面の作業です。
          はじめは1日で全部やらなくてかまいません。途中でやめても、続きから再開できます。
        </p>

        <p className="mt-4 flex flex-wrap items-center gap-1.5 text-sm text-gray-600 print:hidden">
          <Printer className="w-4 h-4 text-gray-400" />
          紙で持っておきたいときは <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">⌘</kbd>
          <span>＋</span>
          <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">P</kbd>
          （Windows は <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">Ctrl</kbd>＋
          <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">P</kbd>）で印刷できます
        </p>

        {/*
          作業中は説明書に来なくてよい、と最初に伝えておく。
          知らないと、これまでどおり行って戻るをやってしまう。
        */}
        <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm text-teal-900 print:hidden">
          作業をしている途中は、画面の左下にある
          <strong className="mx-1">「やり方」</strong>
          を押すと、
          <strong>いまやっている作業のぶんだけ</strong>
          が横に出ます。ここまで戻ってこなくて大丈夫です。
        </div>
      </header>

      {GUIDE_CHAPTERS.map((c) => (
        <Section key={c.step} step={c.step} title={c.title} icon={c.icon}>
          {c.lead && <p className="text-foreground leading-relaxed">{c.lead}</p>}
          {c.figure}
          {c.steps && <Steps items={c.steps} />}
          {c.wideFigure}
          {c.notes?.map((n, i) => <Note key={i}>{n}</Note>)}
          {c.tips?.map((t, i) => <Tip key={i}>{t}</Tip>)}
          {c.toConfirm && <ToConfirm>{c.toConfirm}</ToConfirm>}
          {c.troubles && <Trouble items={c.troubles} />}
        </Section>
      ))}

      <section className="card-glass rounded-xl p-5 md:p-6">
        <h2 className="text-xl font-black text-foreground mb-3">最後に</h2>
        <p className="text-foreground leading-relaxed">
          分からないことがあったら、
          <strong className="text-foreground">とりあえず進めるより、聞いてください。</strong>
          お金の記録なので、あとから直すほうがずっと大変です。
          聞くことは、この仕事ではきちんとした仕事のやり方です。
        </p>
        <div className="mt-4">
          <ToConfirm>聞く相手（指導員の名前）と、連絡の方法を書き足してください。</ToConfirm>
        </div>
        <div className="mt-4 print:hidden">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold"
          >
            はじめる
          </Link>
        </div>
      </section>
    </div>
  );
}
