"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, KeyRound, Shield, Users, Eye, EyeOff, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  plainPassword: string;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "管理者" },
  { value: "instructor", label: "指導者" },
  { value: "user", label: "利用者" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  instructor: "指導者",
  user: "利用者",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-amber-50 text-amber-700 border-amber-200",
  instructor: "bg-green-50 text-green-700 border-green-200",
  user: "bg-gray-50 text-gray-600 border-gray-200",
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [editingCode, setEditingCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [savingCode, setSavingCode] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // パスワード表示/編集
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.replace("/");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "admin") {
      fetchData();
    }
  }, [status, session]);

  const fetchData = async () => {
    try {
      const [usersRes, codeRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/invite-code"),
      ]);
      const usersData = await usersRes.json();
      const codeData = await codeRes.json();

      setUsers(usersData.users || []);
      setInviteCode(codeData.inviteCode || "");
      setNewCode(codeData.inviteCode || "");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    setChangingRole(userId);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      setMessage({ type: "success", text: "権限を変更しました" });
    } catch {
      setMessage({ type: "error", text: "変更に失敗しました" });
    } finally {
      setChangingRole(null);
    }
  };

  const handleDelete = async (user: UserInfo) => {
    if (!confirm(`「${user.name}（${user.email}）」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    setDeleting(user.id);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setMessage({ type: "success", text: `「${user.name}」を削除しました` });
    } catch {
      setMessage({ type: "error", text: "削除に失敗しました" });
    } finally {
      setDeleting(null);
    }
  };

  const handleSaveCode = async () => {
    if (!newCode.trim()) return;
    setSavingCode(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/invite-code", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: newCode.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      setInviteCode(data.inviteCode);
      setEditingCode(false);
      setMessage({ type: "success", text: "招待コードを変更しました" });
    } catch {
      setMessage({ type: "error", text: "変更に失敗しました" });
    } finally {
      setSavingCode(false);
    }
  };

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSavePassword = async (userId: string) => {
    if (!newPassword.trim()) return;
    setSavingPassword(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, newPassword: newPassword.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, plainPassword: newPassword.trim() } : u))
      );
      setEditingPassword(null);
      setNewPassword("");
      setMessage({ type: "success", text: "パスワードを変更しました" });
    } catch {
      setMessage({ type: "error", text: "変更に失敗しました" });
    } finally {
      setSavingPassword(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (session?.user?.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">管理画面</h1>
        <p className="text-sm text-gray-500 mt-1">ユーザー管理・招待コード設定</p>
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

      {/* 招待コード */}
      <div className="bg-white border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">招待コード</h2>
        </div>

        {editingCode ? (
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="flex-1 max-w-sm px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              onClick={handleSaveCode}
              disabled={savingCode || !newCode.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {savingCode && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </button>
            <button
              onClick={() => { setEditingCode(false); setNewCode(inviteCode); }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
            >
              取消
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <code className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-mono text-gray-800">
              {inviteCode}
            </code>
            <button
              onClick={() => setEditingCode(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              変更
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">新規登録時にこのコードの入力が必要です</p>
      </div>

      {/* ユーザー一覧 */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b bg-gray-50">
          <Users className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">登録ユーザー（{users.length}名）</h2>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50/50">
              <th className="px-6 py-3 text-left font-medium text-gray-600">名前</th>
              <th className="px-6 py-3 text-left font-medium text-gray-600">メールアドレス</th>
              <th className="px-6 py-3 text-left font-medium text-gray-600">パスワード</th>
              <th className="px-6 py-3 text-left font-medium text-gray-600">権限</th>
              <th className="px-6 py-3 text-left font-medium text-gray-600">登録日</th>
              <th className="px-6 py-3 text-left font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isMe = user.id === session.user.id;
              const isPasswordVisible = visiblePasswords.has(user.id);
              const isEditingPw = editingPassword === user.id;
              return (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {user.name}
                      {isMe && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">自分</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{user.email}</td>
                  <td className="px-6 py-3">
                    {isEditingPw ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-32 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="新しいパスワード"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSavePassword(user.id)}
                          disabled={savingPassword || !newPassword.trim()}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingPassword ? <Loader2 className="h-3 w-3 animate-spin" /> : "保存"}
                        </button>
                        <button
                          onClick={() => { setEditingPassword(null); setNewPassword(""); }}
                          className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded text-xs"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm text-gray-700">
                          {isPasswordVisible
                            ? (user.plainPassword || "(未保存)")
                            : "••••••••"}
                        </span>
                        <button
                          onClick={() => togglePasswordVisibility(user.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded"
                          title={isPasswordVisible ? "非表示" : "表示"}
                        >
                          {isPasswordVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => { setEditingPassword(user.id); setNewPassword(""); }}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded"
                          title="変更"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {isMe ? (
                      <span className={cn("inline-block text-xs font-medium px-2.5 py-1 rounded-full border", ROLE_COLORS[user.role])}>
                        <Shield className="inline h-3 w-3 mr-1 -mt-0.5" />
                        {ROLE_LABELS[user.role]}
                      </span>
                    ) : (
                      <div className="relative">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          disabled={changingRole === user.id}
                          className={cn(
                            "text-xs font-medium px-2.5 py-1 rounded-full border appearance-none cursor-pointer pr-6",
                            ROLE_COLORS[user.role],
                            changingRole === user.id && "opacity-50"
                          )}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {changingRole === user.id && (
                          <Loader2 className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin" />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-6 py-3">
                    {isMe ? (
                      <span className="text-xs text-gray-400">-</span>
                    ) : (
                      <button
                        onClick={() => handleDelete(user)}
                        disabled={deleting === user.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-red-600 hover:bg-red-50 rounded-md text-sm transition-colors"
                      >
                        {deleting === user.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
