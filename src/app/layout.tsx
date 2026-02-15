import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import SessionProvider from "@/components/SessionProvider";

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
      <body className="antialiased bg-gray-50 min-h-screen font-sans">
        <SessionProvider>
          <Header />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </SessionProvider>
      </body>
    </html>
  );
}
