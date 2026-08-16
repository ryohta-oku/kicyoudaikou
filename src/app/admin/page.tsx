"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Shield, Users, Eye, EyeOff, Pencil, UserPlus, Cpu, AlertTriangle, Check, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  plainPassword: string;
  createdAt: string;
}

interface ModelInfo {
  id: string;
  provider: "gemini" | "openai";
  label: string;
  supportsVision: boolean;
  inputPer1M: number;
  outputPer1M: number;
  note?: string;
}

interface AiModelSettings {
  catalog: ModelInfo[];
  ocrModel: string;
  classifyModel: string;
  sources: { ocr: string; classify: string };
  providerKeys: { gemini: boolean; openai: boolean };
}

interface ModelTestResult {
  modelId: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  db: "管理画面の設定",
  env: "環境変数",
  default: "組み込みの既定値",
};

/**
 * 新しく作れる役割。
 *
 * **user_b（B型）は入れない。** 2026-09-01 に AB多機能から A型のみになり、
 * B型の利用者はいなくなった。既存の user_b アカウントは引き続きログインでき、
 * 過去の作業ログにも残るので、下の ROLE_LABELS からは消さない。
 */
const ROLE_OPTIONS = [
  { value: "admin", label: "管理者" },
  { value: "instructor", label: "指導者" },
  { value: "user_a", label: "利用者" },
  { value: "tax_advisor", label: "税理士（社外）" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  instructor: "指導者",
  user_a: "利用者",
  user_b: "利用者（旧B型）",
  tax_advisor: "税理士（社外）",
  user: "利用者", // 旧ロール互換
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-amber-50 text-amber-700 border-amber-200",
  instructor: "bg-green-50 text-green-700 border-green-200",
  user_a: "bg-teal-50 text-teal-700 border-teal-200",
  user_b: "bg-purple-50 text-purple-700 border-purple-200",
  tax_advisor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  user: "bg-gray-50 text-gray-600 border-gray-200",
};

interface AdvisorInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  clientIds: string[];
}

interface ClientOption {
  id: string;
  name: string;
}

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
  /**
   * 共通ログイン中（認証を Client Hub に委ねている）。
   * このときアカウントの追加・パスワード変更・役割変更・削除はここでは効かないので、
   * ボタンを**出さない**。API も 409 で断るが、押してから気づくのでは遅い
   */
  const [sharedLogin, setSharedLogin] = useState(false);

  // 税理士（社外）の担当得意先
  const [advisors, setAdvisors] = useState<AdvisorInfo[]>([]);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [savingAdvisor, setSavingAdvisor] = useState<string | null>(null);

  // パスワード表示/編集
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // ユーザー追加
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState("user_a");
  const [adding, setAdding] = useState(false);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);

  // AIモデル設定（管理者のみ）
  const [aiSettings, setAiSettings] = useState<AiModelSettings | null>(null);
  const [ocrModel, setOcrModel] = useState("");
  const [classifyModel, setClassifyModel] = useState("");
  const [savingAi, setSavingAi] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTest, setAiTest] = useState<{
    ocr: ModelTestResult;
    classify: ModelTestResult;
  } | null>(null);

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
      setSharedLogin(Boolean(data.sharedLogin));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 税理士の担当得意先。
   *
   * 共通ログイン中でも取りに行く ―― 「どの得意先を見せるか」は記帳代行だけが
   * 持つ情報で、Client Hub 側には無い。アカウント操作とは別の話。
   */
  const fetchAdvisors = async () => {
    try {
      const res = await fetch("/api/admin/advisor-clients");
      if (!res.ok) return;
      const data = await res.json();
      setAdvisors(data.advisors || []);
      setClientOptions(data.clients || []);
    } catch {
      // 取得失敗時はカードを出さない
    }
  };

  useEffect(() => {
    if (status === "authenticated" && isAdminOrInstructor) {
      fetchAdvisors();
    }
  }, [status, isAdminOrInstructor]);

  const toggleAdvisorClient = async (advisor: AdvisorInfo, clientId: string) => {
    const next = advisor.clientIds.includes(clientId)
      ? advisor.clientIds.filter((c) => c !== clientId)
      : [...advisor.clientIds, clientId];

    setSavingAdvisor(advisor.id);
    try {
      const res = await fetch("/api/admin/advisor-clients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: advisor.id, clientIds: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: data.error || "更新に失敗しました" });
        return;
      }
      setAdvisors((prev) =>
        prev.map((a) => (a.id === advisor.id ? { ...a, clientIds: next } : a))
      );
    } finally {
      setSavingAdvisor(null);
    }
  };

  // AIモデル設定は管理者のみ取得（指導者にはAI費用を変えさせない）
  useEffect(() => {
    if (status !== "authenticated" || !isAdmin) return;
    fetch("/api/admin/ai-models")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AiModelSettings | null) => {
        if (!data) return;
        setAiSettings(data);
        setOcrModel(data.ocrModel);
        setClassifyModel(data.classifyModel);
      })
      .catch(() => {
        // 取得失敗時はカードを出さない
      });
  }, [status, isAdmin]);

  // 選択中のモデルに実際に問い合わせて疎通確認する（保存前でも試せる）
  const handleTestAiModels = async () => {
    setTestingAi(true);
    setAiTest(null);
    setMessage(null);
    setSetupUrl(null);

    try {
      const res = await fetch("/api/admin/ai-models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrModel, classifyModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "接続テストに失敗しました" });
        return;
      }
      setAiTest(data);
    } catch {
      setMessage({ type: "error", text: "接続テストに失敗しました" });
    } finally {
      setTestingAi(false);
    }
  };

  const handleSaveAiModels = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true);
    setMessage(null);
    setSetupUrl(null);
    setAiTest(null);

    try {
      const res = await fetch("/api/admin/ai-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrModel, classifyModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "保存に失敗しました" });
        return;
      }
      setAiSettings((prev) =>
        prev
          ? { ...prev, ocrModel, classifyModel, sources: { ocr: "db", classify: "db" } }
          : prev
      );
      setMessage({ type: "success", text: "AIモデルの設定を保存しました" });
    } catch {
      setMessage({ type: "error", text: "保存に失敗しました" });
    } finally {
      setSavingAi(false);
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
        body: JSON.stringify({ name: addName.trim(), email: addEmail.trim(), role: addRole, password: addPassword || undefined }),
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
      setAddPassword("");
      setAddRole("user_a");

      if (data.emailSent) {
        setMessage({ type: "success", text: `「${data.user.name}」を追加しました。招待メールを送信しました。` });
      } else if (data.setupUrl) {
        setSetupUrl(data.setupUrl);
        setMessage({ type: "success", text: `「${data.user.name}」を追加しました。以下のURLをご本人にお伝えください。` });
      } else {
        setMessage({ type: "success", text: `「${data.user.name}」を追加しました。` });
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
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin ? "ユーザー管理・AI設定" : "ユーザー管理"}
        </p>
      </div>

      {sharedLogin && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-900">
            ログインは Client Hub で管理しています
          </p>
          <p className="text-sm text-blue-800 mt-1 leading-relaxed">
            アカウントの追加・パスワードの変更・役割の変更は Client Hub の
            「スタッフ管理」または顧客台帳から行ってください。
            ここでの操作は照合に使われないため、できないようにしてあります。
          </p>
          <p className="text-xs text-blue-700 mt-2">
            下の一覧は、このアプリが作業記録の名義として持っている控えです。
          </p>
        </div>
      )}

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
                  className="shrink-0 px-3 py-2 bg-teal-600 text-white rounded text-xs hover:bg-teal-700"
                >
                  コピー
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ユーザー追加。共通ログイン中は Client Hub の仕事なので出さない */}
      {sharedLogin ? null : showAddForm ? (
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
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="example@mail.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
                <input
                  type="text"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="空欄なら招待メール送信"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">権限</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
              >
                {adding && <Loader2 className="h-4 w-4 animate-spin" />}
                追加
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddName(""); setAddEmail(""); setAddPassword(""); setAddRole("user_a"); }}
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
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
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
              // 共通ログイン中は消しても次のログインで作り直されるので出さない
              const canDelete =
                !sharedLogin &&
                !isMe &&
                !(session!.user.role === "instructor" && user.role === "admin");
              return (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {user.name}
                      {isMe && (
                        <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">自分</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{user.email}</td>
                  <td className="px-6 py-3">
                    {sharedLogin ? (
                      // パスワードは Client Hub にあり、こちらの控えは照合に使われない
                      <span className="text-xs text-gray-400">Client Hub で管理</span>
                    ) : isEditingPw ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-32 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                          placeholder="新しいパスワード"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSavePassword(user.id)}
                          disabled={savingPassword || !newPassword.trim()}
                          className="px-2 py-1 bg-teal-600 text-white rounded text-xs hover:bg-teal-700 disabled:opacity-50"
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
                    {/* 共通ログイン中に変えても、次のログインで Client Hub の値に戻る */}
                    {sharedLogin || isMe || !isAdmin ? (
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

      {/*
        税理士（社外）の担当得意先。
        税理士アカウントが1つも無ければ出さない ―― 使わない設定を常に見せない。
      */}
      {advisors.length > 0 && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b bg-gray-50">
            <Building2 className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">
              税理士が見る得意先（{advisors.length}名）
            </h2>
          </div>

          <div className="px-6 py-4 bg-indigo-50/50 border-b border-indigo-100">
            <p className="text-sm text-indigo-900">
              税理士は<strong>社外の方</strong>です。ここでチェックを入れた得意先の書類・仕訳だけが見えます。
            </p>
            <p className="text-xs text-indigo-700 mt-1">
              1つもチェックが無い場合、その税理士には何も見えません。得意先が設定されていないフォルダも見えません。
            </p>
          </div>

          <div className="divide-y">
            {advisors.map((advisor) => (
              <div key={advisor.id} className="px-6 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-medium text-gray-900">{advisor.name}</span>
                  <span className="text-sm text-gray-500">{advisor.email}</span>
                  {savingAdvisor === advisor.id && (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                  )}
                </div>

                {clientOptions.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    承認済みの得意先がまだありません。得意先を登録すると、ここで割り当てられます。
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {clientOptions.map((client) => {
                      const checked = advisor.clientIds.includes(client.id);
                      return (
                        <label
                          key={client.id}
                          className={cn(
                            "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors",
                            checked
                              ? "bg-indigo-50 border-indigo-300 text-indigo-800"
                              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={savingAdvisor === advisor.id}
                            onChange={() => toggleAdvisorClient(advisor, client.id)}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {client.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AIモデル設定（管理者のみ） */}
      {isAdmin && aiSettings && (
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Cpu className="h-5 w-5 text-gray-400" />
            AIモデル設定
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            OCR（書類の読み取り）と仕訳分類に使うAIを選べます。精度に不満があれば切り替えてください。
          </p>

          <form onSubmit={handleSaveAiModels} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                {
                  key: "ocr" as const,
                  label: "OCR（書類の読み取り）",
                  value: ocrModel,
                  setValue: setOcrModel,
                  options: aiSettings.catalog.filter((m) => m.supportsVision),
                },
                {
                  key: "classify" as const,
                  label: "仕訳分類",
                  value: classifyModel,
                  setValue: setClassifyModel,
                  options: aiSettings.catalog,
                },
              ]).map((field) => {
                const selected = aiSettings.catalog.find((m) => m.id === field.value);
                const keyMissing =
                  selected && !aiSettings.providerKeys[selected.provider];
                return (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                    </label>
                    <select
                      value={field.value}
                      onChange={(e) => field.setValue(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {field.options.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                          {m.note ? `｜${m.note}` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      現在の設定元: {SOURCE_LABELS[aiSettings.sources[field.key]] || "-"}
                      {selected && (
                        <>
                          {" ／ "}
                          100万トークンあたり 入力 ${selected.inputPer1M} ・ 出力 $
                          {selected.outputPer1M}
                        </>
                      )}
                    </p>
                    {keyMissing && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {selected?.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"}
                        {" が未設定です。このまま保存すると処理に失敗します。"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 接続テスト結果 */}
            {aiTest && (
              <div className="space-y-1.5">
                {([
                  { label: "OCR", result: aiTest.ocr },
                  { label: "仕訳分類", result: aiTest.classify },
                ]).map(({ label, result }) => (
                  <div
                    key={label}
                    className={cn(
                      "text-xs rounded px-2.5 py-1.5 border flex items-start gap-1.5",
                      result.ok
                        ? "bg-green-50 border-green-200 text-green-800"
                        : "bg-red-50 border-red-200 text-red-700"
                    )}
                  >
                    {result.ok ? (
                      <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    )}
                    <span className="min-w-0">
                      <span className="font-medium">{label}</span>: {result.modelId}
                      {result.ok
                        ? ` — 接続OK（${result.latencyMs}ms）`
                        : ` — 接続失敗: ${result.error}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingAi || testingAi}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
              >
                {savingAi && <Loader2 className="h-4 w-4 animate-spin" />}
                保存
              </button>
              <button
                type="button"
                onClick={handleTestAiModels}
                disabled={savingAi || testingAi}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
              >
                {testingAi && <Loader2 className="h-4 w-4 animate-spin" />}
                接続テスト
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
