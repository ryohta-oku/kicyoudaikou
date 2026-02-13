"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  code: string;
  name: string;
  category: string;
  subAccounts: { id: string; code: string; name: string }[];
}

const CATEGORIES = ["資産", "負債", "純資産", "収益", "費用"];

const CATEGORY_COLORS: Record<string, string> = {
  "資産": "bg-blue-100 text-blue-800",
  "負債": "bg-red-100 text-red-800",
  "純資産": "bg-purple-100 text-purple-800",
  "収益": "bg-green-100 text-green-800",
  "費用": "bg-orange-100 text-orange-800",
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccount, setNewAccount] = useState({ code: "", name: "", category: "費用" });

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/accounts/seed", { method: "POST" });
      const data = await res.json();
      setSeedMessage(data.message);
      await fetchAccounts();
    } catch {
      setSeedMessage("登録に失敗しました");
    } finally {
      setSeeding(false);
    }
  };

  const handleAddAccount = async () => {
    if (!newAccount.code || !newAccount.name) return;
    try {
      await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      setShowAddForm(false);
      setNewAccount({ code: "", name: "", category: "費用" });
      await fetchAccounts();
    } catch {
      // Error handled silently
    }
  };

  const filteredAccounts = filterCategory
    ? accounts.filter((a) => a.category === filterCategory)
    : accounts;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">勘定科目管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            勘定科目マスターの管理・編集
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {seeding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            標準科目を一括登録
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            科目追加
          </button>
        </div>
      </div>

      {seedMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700">{seedMessage}</p>
        </div>
      )}

      {/* 追加フォーム */}
      {showAddForm && (
        <div className="bg-white border rounded-xl p-6 space-y-4">
          <h3 className="font-medium text-gray-900">新しい勘定科目を追加</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="コード (例: 7111)"
              value={newAccount.code}
              onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="text"
              placeholder="科目名 (例: 給料手当)"
              value={newAccount.name}
              onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <select
              value={newAccount.category}
              onChange={(e) => setNewAccount({ ...newAccount, category: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <button
              onClick={handleAddAccount}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              追加
            </button>
          </div>
        </div>
      )}

      {/* カテゴリフィルター */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">フィルター:</span>
        <button
          onClick={() => setFilterCategory("")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            !filterCategory ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
        >
          すべて ({accounts.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = accounts.filter((a) => a.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                filterCategory === cat
                  ? "bg-gray-800 text-white"
                  : `${CATEGORY_COLORS[cat]} hover:opacity-80`
              )}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* 科目一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Database className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            勘定科目がありません
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            「標準科目を一括登録」ボタンで基本的な勘定科目を登録できます
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-6 py-3 text-left font-medium text-gray-600">コード</th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">勘定科目名</th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">区分</th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">補助科目</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
                <tr key={account.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-gray-700">{account.code}</td>
                  <td className="px-6 py-3 font-medium text-gray-900">{account.name}</td>
                  <td className="px-6 py-3">
                    <span className={cn(
                      "inline-flex px-2.5 py-1 rounded-full text-xs font-medium",
                      CATEGORY_COLORS[account.category] || "bg-gray-100 text-gray-800"
                    )}>
                      {account.category}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {account.subAccounts.length > 0
                      ? account.subAccounts.map((s) => s.name).join(", ")
                      : "-"
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
