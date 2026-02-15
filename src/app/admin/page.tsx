"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Shield, Users, Eye, EyeOff, Pencil, UserPlus } from "lucide-react";
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
  const isAdmin = session?.user?.role === "admin";
  const isAdminOrInstructor = isAdmin || session?.user?.role === "instructor";

  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // パスワード表示/編集
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // ユーザー追加
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("user");
  const [adding, setAdding] = useState(false);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated" && !isAdminOrInstructor) {
      router.replace("/");
    }
  }, [status, isAdminOrInstructor, router]);

  useEffect(() => {
    if (status === "authenticated" && isAdminOrInstructor) {
      fetchData();
    }
  }, [status, isAdminOrInstructor]);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(data.users || []);
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

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setMessage(null);
    setSetupUrl(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), email: addEmail.trim(), role: addRole }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      setUsers((prev) => [...prev, data.user]);
      setShowAddForm(false);
      setAddName("");
      setAddEmail("");
      setAddRole("user");

      if (data.emailSent) {
        setMessage({ type: "success", text: `「${data.user.name}」を追加しました。招待メールを送信しました。` });
      } else if (data.setupUrl) {
        // SMTP未設定時：URLを表示
        setSetupUrl(data.setupUrl);
        setMessage({ type: "success", text: `「${data.user.name}」を追加しました。SMTP未設定のため、以下のURLをご本人にお伝えください。` });
      }
    } catch {
      setMessage({ type: "error", text: "追加に失敗しました" });
    } finally {
      setAdding(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdminOrInstructor) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">管理画面</h1>
        <p className="text-sm text-gray-500 mt-1">ユーザー管理</p>
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
          {setupUrl && (
            <div className="mt-3 p-3 bg-white border border-green-300 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">パスワード設定URL（ご本人にお伝えください）:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-50 px-3 py-2 rounded border break-all select-all">
                  {setupUrl}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(setupUrl);
                    setMessage({ type: "success", text: "URLをコピーしました" });
                  }}
                  className="shrink-0 px-3 py-2 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                >
                  コピー
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ユーザー追加 */}
      {showAddForm ? (
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-gray-400" />
            ユーザー追加
          </h2>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名前</label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="山田 太郎"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  required
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="example@mail.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">権限</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                {adding && <Loader2 className="h-4 w-4 animate-spin" />}
                追加
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddName(""); setAddEmail(""); setAddRole("user"); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          ユーザーを追加
        </button>
      )}

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
              const isMe = user.id === session!.user.id;
              const isPasswordVisible = visiblePasswords.has(user.id);
              const isEditingPw = editingPassword === user.id;
              // 指導者は管理者を削除不可
              const canDelete = !isMe && !(session!.user.role === "instructor" && user.role === "admin");
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
                    {isMe || !isAdmin ? (
                      <span className={cn("inline-block text-xs font-medium px-2.5 py-1 rounded-full border", ROLE_COLORS[user.role])}>
                        {(isMe || user.role === "admin") && <Shield className="inline h-3 w-3 mr-1 -mt-0.5" />}
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
                    {canDelete ? (
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
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
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
