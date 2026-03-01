"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Shield, Mail, Lock, User } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  // ログインフォーム
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 初期登録フォーム
  const [setupName, setSetupName] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");

  // ログイン済みならダッシュボードにリダイレクト
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    fetch("/api/auth/register")
      .then((res) => res.json())
      .then((data) => setNeedsSetup(data.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("メールアドレスまたはパスワードが正しくありません");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (setupPassword !== setupConfirm) {
      setError("パスワードが一致しません");
      return;
    }
    if (setupPassword.length < 4) {
      setError("パスワードは4文字以上で入力してください");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: setupEmail,
          password: setupPassword,
          name: setupName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "登録に失敗しました");
        return;
      }

      // 登録成功 → 自動ログイン
      const result = await signIn("credentials", {
        email: setupEmail,
        password: setupPassword,
        redirect: false,
      });

      if (!result?.error) {
        router.push("/");
        router.refresh();
      } else {
        setError("登録は完了しましたが、ログインに失敗しました。ログインしてください。");
        setNeedsSetup(false);
      }
    } catch {
      setError("登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  if (needsSetup === null || status === "loading" || status === "authenticated") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-teal-950 z-50">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  // 初期管理者登録フォーム
  if (needsSetup) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-4 bg-teal-950 overflow-hidden z-50">
        {/* 背景装飾 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(20,184,166,0.15), transparent), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(245,158,11,0.08), transparent)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle, rgb(255,255,255) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative w-full max-w-md">
          {/* ヘッダー */}
          <div className="text-center mb-8 animate-fade-up">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 mb-4 shadow-lg shadow-amber-500/20">
              <FileText className="h-8 w-8 text-teal-950" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">記帳代行ツール</h1>
            <p className="text-teal-400 mt-1">初期セットアップ</p>
          </div>

          {/* フォームカード */}
          <form
            onSubmit={handleSetup}
            className="bg-teal-900/60 backdrop-blur-sm border border-teal-700/50 rounded-2xl p-6 space-y-4 animate-fade-up"
            style={{ animationDelay: "0.1s" }}
          >
            <div className="bg-teal-800/50 border border-teal-600/30 rounded-xl p-3 flex items-start gap-2">
              <Shield className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-teal-200">
                最初のユーザーが管理者として登録されます。<br />
                管理者は他のユーザーの作成・管理を行えます。
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="setupName" className="block text-sm font-medium text-teal-300 mb-1">
                名前
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500" />
                <input
                  id="setupName"
                  type="text"
                  required
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  className="login-input w-full pl-10 pr-3 py-2.5 bg-teal-800/50 border border-teal-600/50 rounded-xl text-sm text-white placeholder:text-teal-500 transition-all"
                  placeholder="山田 太郎"
                />
              </div>
            </div>

            <div>
              <label htmlFor="setupEmail" className="block text-sm font-medium text-teal-300 mb-1">
                メールアドレス
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500" />
                <input
                  id="setupEmail"
                  type="email"
                  required
                  value={setupEmail}
                  onChange={(e) => setSetupEmail(e.target.value)}
                  className="login-input w-full pl-10 pr-3 py-2.5 bg-teal-800/50 border border-teal-600/50 rounded-xl text-sm text-white placeholder:text-teal-500 transition-all"
                  placeholder="example@mail.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="setupPassword" className="block text-sm font-medium text-teal-300 mb-1">
                パスワード
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500" />
                <input
                  id="setupPassword"
                  type="password"
                  required
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  className="login-input w-full pl-10 pr-3 py-2.5 bg-teal-800/50 border border-teal-600/50 rounded-xl text-sm text-white placeholder:text-teal-500 transition-all"
                  placeholder="4文字以上"
                />
              </div>
            </div>

            <div>
              <label htmlFor="setupConfirm" className="block text-sm font-medium text-teal-300 mb-1">
                パスワード（確認）
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500" />
                <input
                  id="setupConfirm"
                  type="password"
                  required
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  className="login-input w-full pl-10 pr-3 py-2.5 bg-teal-800/50 border border-teal-600/50 rounded-xl text-sm text-white placeholder:text-teal-500 transition-all"
                  placeholder="もう一度入力"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-teal-950 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              管理者アカウントを作成
            </button>
          </form>

          {/* フッター */}
          <p
            className="text-center text-sm text-teal-600 mt-8 animate-fade-up"
            style={{ animationDelay: "0.2s" }}
          >
            &copy; 2026 記帳代行ツール
          </p>
        </div>
      </div>
    );
  }

  // 通常ログインフォーム
  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 bg-teal-950 overflow-hidden z-50">
      {/* 背景装飾 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(20,184,166,0.15), transparent), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(245,158,11,0.08), transparent)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, rgb(255,255,255) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* ヘッダー */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 mb-4 shadow-lg shadow-amber-500/20">
            <FileText className="h-8 w-8 text-teal-950" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">記帳代行ツール</h1>
          <p className="text-teal-400 mt-1">ログイン</p>
        </div>

        {/* フォームカード */}
        <form
          onSubmit={handleLogin}
          className="bg-teal-900/60 backdrop-blur-sm border border-teal-700/50 rounded-2xl p-6 space-y-4 animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-teal-300 mb-1">
              メールアドレス
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input w-full pl-10 pr-3 py-2.5 bg-teal-800/50 border border-teal-600/50 rounded-xl text-sm text-white placeholder:text-teal-500 transition-all"
                placeholder="example@mail.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-teal-300 mb-1">
              パスワード
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input w-full pl-10 pr-3 py-2.5 bg-teal-800/50 border border-teal-600/50 rounded-xl text-sm text-white placeholder:text-teal-500 transition-all"
                placeholder="パスワード"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-teal-950 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            ログイン
          </button>

          <p className="text-center text-sm text-teal-500">
            アカウントは管理者が作成します
          </p>
        </form>

        {/* フッター */}
        <p
          className="text-center text-sm text-teal-600 mt-8 animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          &copy; 2026 記帳代行ツール
        </p>
      </div>
    </div>
  );
}
