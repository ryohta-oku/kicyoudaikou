"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { FileText, Loader2, CheckCircle, XCircle, Lock, Mail } from "lucide-react";

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-teal-950 z-50">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    }>
      <SetupPasswordContent />
    </Suspense>
  );
}

function SetupPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [wantsChange, setWantsChange] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("無効なリンクです");
      setLoading(false);
      return;
    }

    fetch(`/api/auth/setup-password?token=${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "無効なリンクです");
        } else {
          setUserName(data.user.name);
          setUserEmail(data.user.email);
          setHasPassword(data.hasPassword);
          if (data.plainPassword) setCurrentPassword(data.plainPassword);
        }
      })
      .catch(() => setError("エラーが発生しました"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const isChangingPassword = !hasPassword || wantsChange;

    if (isChangingPassword) {
      if (password !== confirmPassword) {
        setError("パスワードが一致しません");
        return;
      }
      if (password.length < 6) {
        setError("パスワードは6文字以上で入力してください");
        return;
      }
    }

    setSubmitting(true);

    try {
      const body = isChangingPassword
        ? { token, password }
        : { token, verifyOnly: true };

      const res = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "設定に失敗しました");
        return;
      }

      setDone(true);

      // パスワードが確定している場合は自動ログイン
      const loginPassword = isChangingPassword ? password : null;
      if (loginPassword) {
        setTimeout(async () => {
          const result = await signIn("credentials", {
            email: userEmail,
            password: loginPassword,
            redirect: false,
          });
          if (!result?.error) {
            router.push("/");
            router.refresh();
          }
        }, 1500);
      } else {
        // パスワード変更なしの場合はログインページへ
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch {
      setError("設定に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  // 背景コンポーネント
  const DarkBackground = ({ children }: { children: React.ReactNode }) => (
    <div className="fixed inset-0 flex items-center justify-center px-4 bg-teal-950 overflow-hidden z-50">
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
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-teal-950 z-50">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (done) {
    return (
      <DarkBackground>
        <div className="text-center animate-fade-up">
          <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">認証完了</h1>
          <p className="text-sm text-teal-400">
            {(!hasPassword || wantsChange)
              ? "自動的にログインしています..."
              : "ログインページに移動します..."}
          </p>
        </div>
      </DarkBackground>
    );
  }

  if (error && !userName) {
    return (
      <DarkBackground>
        <div className="text-center animate-fade-up">
          <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">{error}</h1>
          <p className="text-sm text-teal-400 mb-6">管理者にお問い合わせください。</p>
          <a href="/login" className="text-amber-400 hover:text-amber-300 text-sm transition-colors">
            ログインページへ
          </a>
        </div>
      </DarkBackground>
    );
  }

  return (
    <DarkBackground>
      {/* ヘッダー */}
      <div className="text-center mb-8 animate-fade-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 mb-4 shadow-lg shadow-amber-500/20">
          <FileText className="h-8 w-8 text-teal-950" />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">記帳代行ツール</h1>
        <p className="text-teal-400 mt-1">メールアドレス認証</p>
      </div>

      {/* フォームカード */}
      <form
        onSubmit={handleSubmit}
        className="bg-teal-900/60 backdrop-blur-sm border border-teal-700/50 rounded-2xl p-6 space-y-4 animate-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="bg-teal-800/50 border border-teal-600/30 rounded-xl p-3">
          <p className="text-sm text-teal-200">
            <span className="font-medium text-white">{userName}</span> 様、ようこそ。<br />
            {hasPassword
              ? "メールアドレスの認証を完了してください。"
              : "パスワードを設定してアカウント登録を完了してください。"}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-teal-300 mb-1">メールアドレス</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500" />
            <p className="pl-10 pr-3 py-2.5 bg-teal-800/50 border border-teal-600/50 rounded-xl text-sm text-teal-300">{userEmail}</p>
          </div>
        </div>

        {/* パスワード設定済み：変更しない場合は認証のみ */}
        {hasPassword && !wantsChange && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-teal-300 mb-1">パスワード（設定済み）</label>
              <div
                onClick={() => {
                  navigator.clipboard.writeText(currentPassword);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-3 py-2.5 bg-teal-800/50 border border-teal-600/50 rounded-xl text-sm font-mono cursor-pointer hover:bg-teal-800/70 transition-colors flex items-center justify-between text-white"
              >
                <span>{currentPassword}</span>
                <span className="text-xs text-teal-500">{copied ? "コピーしました" : "クリックでコピー"}</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-teal-950 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              認証を完了する
            </button>
            <button
              type="button"
              onClick={() => setWantsChange(true)}
              className="w-full py-2 text-amber-400 hover:text-amber-300 hover:bg-teal-800/30 rounded-xl text-sm transition-colors cursor-pointer"
            >
              パスワードを変更したい場合はこちら
            </button>
          </div>
        )}

        {/* パスワード未設定 or 変更希望 */}
        {(!hasPassword || wantsChange) && (
          <>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-teal-300 mb-1">
                {wantsChange ? "新しいパスワード" : "パスワード"}
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
                  placeholder="6文字以上"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-teal-300 mb-1">
                パスワード（確認）
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500" />
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="login-input w-full pl-10 pr-3 py-2.5 bg-teal-800/50 border border-teal-600/50 rounded-xl text-sm text-white placeholder:text-teal-500 transition-all"
                  placeholder="もう一度入力"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-teal-950 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {wantsChange ? "パスワード変更して認証完了" : "登録完了"}
            </button>

            {wantsChange && (
              <button
                type="button"
                onClick={() => { setWantsChange(false); setPassword(""); setConfirmPassword(""); }}
                className="w-full py-2 text-teal-500 hover:text-teal-400 hover:bg-teal-800/30 rounded-xl text-sm transition-colors cursor-pointer"
              >
                戻る
              </button>
            )}
          </>
        )}
      </form>

      {/* フッター */}
      <p
        className="text-center text-sm text-teal-600 mt-8 animate-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        &copy; 2026 記帳代行ツール
      </p>
    </DarkBackground>
  );
}
