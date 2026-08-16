import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import WorkflowProgressBar from "@/components/WorkflowProgressBar";
import SessionProvider from "@/components/SessionProvider";
import AuthGuard from "@/components/AuthGuard";
import GuidePanel from "@/components/guide/GuidePanel";
import GuideProvider from "@/components/guide/GuideProvider";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "記帳代行ツール",
  description: "OCR読み取りとAI仕訳分類による記帳代行支援ツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.className} antialiased min-h-screen`}>
        <SessionProvider>
          <AuthGuard>
            {/*
              説明の「いまどの章か」を1か所に持つ。
              **トップのステップとパネルが別の場所にいる**ので、
              ここで束ねないとカードからパネルを開けない。
            */}
            <GuideProvider>
              <Header />
              <WorkflowProgressBar />
              <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
              </main>
              <GuidePanel />
            </GuideProvider>
          </AuthGuard>
        </SessionProvider>
      </body>
    </html>
  );
}
