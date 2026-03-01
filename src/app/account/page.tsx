"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Shield, User, Mail, Calendar, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccountInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  roleLabel: string;
  createdAt: string;
}

export default function AccountPage() {
  const { update: updateSession } = useSession();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // 名前編集
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // パスワード変更
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchAccount();
  }, []);

  const fetchAccount = async () => {
    try {
      const res = await fetch("/api/account");
      const data = await res.json();
      if (res.ok) {
        setAccount(data.user);
        setName(data.user.name);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setSavingName(true);
    setMessage(null);

    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      setMessage({ type: "success", text: "名前を更新しました" });
      setEditingName(false);
      setAccount((prev) => prev ? { ...prev, name: name.trim() } : prev);
      await updateSession({ name: name.trim() });
    } catch {
      setMessage({ type: "error", text: "更新に失敗しました" });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "新しいパスワードが一致しません" });
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      setMessage({ type: "success", text: "パスワードを変更しました" });
      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setMessage({ type: "error", text: "変更に失敗しました" });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!account) {
    return <div className="text-center py-16 text-gray-500">アカウント情報を取得できませんでした</div>;
  }

  const roleColor = account.role === "admin" ? "text-amber-600 bg-amber-50 border-amber-200"
    : account.role === "instructor" ? "text-green-600 bg-green-50 border-green-200"
    : "text-teal-600 bg-teal-50 border-teal-200";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">アカウント情報</h1>
        <p className="text-sm text-gray-500 mt-1">プロフィールの確認・変更</p>
      </div>

      {message && (
        <div
          className={cn(
            "border rounded-lg p-4",
            message.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
          )}
        >
          <p className={cn("text-sm", message.type === "success" ? "text-green-700" : "text-red-700")}>
            {message.text}
          </p>
        </div>
      )}

      <div className="bg-white border rounded-xl divide-y">
        {/* ロール */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">権限</p>
              <span className={cn("inline-block mt-0.5 text-sm font-medium px-2.5 py-0.5 rounded-full border", roleColor)}>
                {account.roleLabel}
              </span>
            </div>
          </div>
        </div>

        {/* 名前 */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <User className="h-5 w-5 text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500">名前</p>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName || !name.trim()}
                    className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50"
                  >
                    {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setName(account.name); }}
                    className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <p className="text-sm font-medium text-gray-900">{account.name}</p>
              )}
            </div>
          </div>
          {!editingName && (
            <button
              onClick={() => setEditingName(true)}
              className="text-sm text-teal-600 hover:underline shrink-0"
            >
              変更
            </button>
          )}
        </div>

        {/* メールアドレス */}
        <div className="flex items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">メールアドレス</p>
              <p className="text-sm font-medium text-gray-900">{account.email}</p>
            </div>
          </div>
        </div>

        {/* パスワード */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">パスワード</p>
                <p className="text-sm text-gray-900">********</p>
              </div>
            </div>
            {!changingPassword && (
              <button
                onClick={() => setChangingPassword(true)}
                className="text-sm text-teal-600 hover:underline"
              >
                変更
              </button>
            )}
          </div>

          {changingPassword && (
            <div className="mt-4 space-y-3 pl-8">
              <div>
                <label className="block text-sm text-gray-600 mb-1">現在のパスワード</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">新しいパスワード</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="6文字以上"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">新しいパスワード（確認）</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleChangePassword}
                  disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  変更する
                </button>
                <button
                  onClick={() => {
                    setChangingPassword(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  className="px-4 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 登録日 */}
        <div className="flex items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">登録日</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(account.createdAt).toLocaleDateString("ja-JP")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
