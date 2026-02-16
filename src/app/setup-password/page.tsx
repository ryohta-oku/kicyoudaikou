"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { FileText, Loader2, CheckCircle, XCircle } from "lucide-react";

export default function SetupPasswordPage() {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">認証完了</h1>
          <p className="text-sm text-gray-500">
            {(!hasPassword || wantsChange)
              ? "自動的にログインしています..."
              : "ログインページに移動します..."}
          </p>
        </div>
      </div>
    );
  }

  if (error && !userName) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">{error}</h1>
          <p className="text-sm text-gray-500 mb-6">管理者にお問い合わせください。</p>
          <a href="/login" className="text-blue-600 hover:underline text-sm">
            ログインページへ
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <FileText className="h-12 w-12 text-blue-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">記帳代行ツール</h1>
          <p className="text-sm text-gray-500 mt-1">メールアドレス認証</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <span className="font-medium">{userName}</span> 様、ようこそ。<br />
              {hasPassword
                ? "メールアドレスの認証を完了してください。"
                : "パスワードを設定してアカウント登録を完了してください。"}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
            <p className="px-3 py-2 bg-gray-50 border rounded-lg text-sm text-gray-600">{userEmail}</p>
          </div>

          {/* パスワード設定済み：変更しない場合は認証のみ */}
          {hasPassword && !wantsChange && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">パスワード（設定済み）</label>
                <div
                  onClick={() => {
                    navigator.clipboard.writeText(currentPassword);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-3 py-2 bg-gray-50 border rounded-lg text-sm font-mono cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-between"
                >
                  <span>{currentPassword}</span>
                  <span className="text-xs text-gray-400">{copied ? "コピーしました" : "クリックでコピー"}</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                認証を完了する
              </button>
              <button
                type="button"
                onClick={() => setWantsChange(true)}
                className="w-full py-2 text-blue-600 hover:bg-blue-50 rounded-lg text-sm transition-colors"
              >
                パスワードを変更したい場合はこちら
              </button>
            </div>
          )}

          {/* パスワード未設定 or 変更希望 */}
          {(!hasPassword || wantsChange) && (
            <>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  {wantsChange ? "新しいパスワード" : "パスワード"}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="6文字以上"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  パスワード（確認）
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="もう一度入力"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {wantsChange ? "パスワード変更して認証完了" : "登録完了"}
              </button>

              {wantsChange && (
                <button
                  type="button"
                  onClick={() => { setWantsChange(false); setPassword(""); setConfirmPassword(""); }}
                  className="w-full py-2 text-gray-500 hover:bg-gray-50 rounded-lg text-sm transition-colors"
                >
                  戻る
                </button>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
}
