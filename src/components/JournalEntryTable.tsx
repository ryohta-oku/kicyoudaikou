"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import SubAccountCombobox from "./SubAccountCombobox";

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  accountCode: string;
  accountName: string;
  subAccountCode: string;
  subAccountName: string;
  debitAmount: number;
  creditAmount: number;
  taxRate: string;
  aiSuggested: boolean;
  isConfirmed: boolean;
}

interface Account {
  id: string;
  code: string;
  name: string;
  category: string;
  subAccounts: { id: string; code: string; name: string }[];
}

const CATEGORY_ORDER = ["費用", "資産", "負債", "収益", "純資産"];

interface JournalEntryTableProps {
  entries: JournalEntry[];
  accounts?: Account[];
  clientId?: string | null;
  editable?: boolean;
  onUpdate?: (id: string, data: Partial<JournalEntry>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onAdd?: (data: Partial<JournalEntry>) => Promise<void>;
  onAccountsRefresh?: () => void;
  documentId?: string;
}

export default function JournalEntryTable({
  entries,
  accounts = [],
  clientId,
  editable = false,
  onUpdate,
  onDelete,
  onAdd,
  onAccountsRefresh,
  documentId,
}: JournalEntryTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<JournalEntry>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [showAddRow, setShowAddRow] = useState(false);
  const [newEntry, setNewEntry] = useState<Partial<JournalEntry>>({
    date: new Date().toISOString().split("T")[0],
    description: "",
    accountCode: "",
    accountName: "",
    subAccountCode: "",
    subAccountName: "",
    debitAmount: 0,
    creditAmount: 0,
    taxRate: "",
  });

  const startEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setEditData({ ...entry });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (id: string) => {
    if (!onUpdate) return;
    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      await onUpdate(id, editData);
      setEditingId(null);
      setEditData({});
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const confirmEntry = async (id: string) => {
    if (!onUpdate) return;
    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      await onUpdate(id, { isConfirmed: true });
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const deleteEntry = async (id: string) => {
    if (!onDelete || !confirm("この仕訳を削除してもよろしいですか？")) return;
    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      await onDelete(id);
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const addEntry = async () => {
    if (!onAdd || !documentId) return;
    try {
      await onAdd({
        ...newEntry,
        documentId,
      } as Partial<JournalEntry>);
      setShowAddRow(false);
      setNewEntry({
        date: new Date().toISOString().split("T")[0],
        description: "",
        accountCode: "",
        accountName: "",
        debitAmount: 0,
        creditAmount: 0,
        taxRate: "",
      });
    } catch {
      // Error handled by parent
    }
  };

  const handleAccountSelect = (
    code: string,
    setter: (data: Partial<JournalEntry>) => void,
    currentData: Partial<JournalEntry>
  ) => {
    const account = accounts.find((a) => a.code === code);
    setter({
      ...currentData,
      accountCode: code,
      accountName: account?.name || "",
      subAccountCode: "",
      subAccountName: "",
    });
  };

  return (
    <div className="bg-white border rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left font-medium text-gray-600">日付</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">摘要</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">勘定科目</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">補助科目</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">借方金額</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">貸方金額</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">税区分</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">状態</th>
              {editable && (
                <th className="px-4 py-3 text-center font-medium text-gray-600">操作</th>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isEditing = editingId === entry.id;
              const isLoading = loadingIds.has(entry.id);

              return (
                <tr
                  key={entry.id}
                  className={cn(
                    "border-b hover:bg-gray-50 transition-colors",
                    entry.isConfirmed ? "bg-green-50/50" : "",
                    entry.aiSuggested && !entry.isConfirmed ? "bg-yellow-50/50" : ""
                  )}
                >
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="date"
                        value={editData.date || ""}
                        onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    ) : (
                      entry.date
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.description || ""}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    ) : (
                      <span className="truncate block">{entry.description}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={editData.accountCode || ""}
                        onChange={(e) => handleAccountSelect(e.target.value, setEditData, editData)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value="">選択...</option>
                        {CATEGORY_ORDER.map((category) => {
                          const categoryAccounts = accounts.filter((a) => a.category === category);
                          if (categoryAccounts.length === 0) return null;
                          return (
                            <optgroup key={category} label={category}>
                              {categoryAccounts.map((acc) => (
                                <option key={acc.code} value={acc.code}>
                                  {acc.name}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                        {accounts
                          .filter((a) => !CATEGORY_ORDER.includes(a.category))
                          .map((acc) => (
                            <option key={acc.code} value={acc.code}>
                              {acc.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span>
                        {entry.accountName}
                        {entry.aiSuggested && !entry.isConfirmed && (
                          <span className="ml-1 text-xs text-yellow-600 bg-yellow-100 px-1 rounded">
                            AI
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      (() => {
                        const editAccount = accounts.find((a) => a.code === editData.accountCode);
                        return (
                          <SubAccountCombobox
                            subAccounts={editAccount?.subAccounts || []}
                            value={editData.subAccountCode || ""}
                            valueName={editData.subAccountName || ""}
                            onChange={(code, name) =>
                              setEditData({ ...editData, subAccountCode: code, subAccountName: name })
                            }
                            accountId={editAccount?.id || ""}
                            clientId={clientId}
                            onSubAccountAdded={onAccountsRefresh}
                          />
                        );
                      })()
                    ) : (
                      entry.subAccountName
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.debitAmount || 0}
                        onChange={(e) =>
                          setEditData({ ...editData, debitAmount: parseInt(e.target.value) || 0 })
                        }
                        className="w-full px-2 py-1 border rounded text-sm text-right"
                      />
                    ) : (
                      entry.debitAmount > 0 ? formatCurrency(entry.debitAmount) : ""
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.creditAmount || 0}
                        onChange={(e) =>
                          setEditData({ ...editData, creditAmount: parseInt(e.target.value) || 0 })
                        }
                        className="w-full px-2 py-1 border rounded text-sm text-right"
                      />
                    ) : (
                      entry.creditAmount > 0 ? formatCurrency(entry.creditAmount) : ""
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={editData.taxRate || ""}
                        onChange={(e) => setEditData({ ...editData, taxRate: e.target.value })}
                        className="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value="">なし</option>
                        <option value="課税10%">課税10%</option>
                        <option value="課税8%">課税8%</option>
                        <option value="非課税">非課税</option>
                        <option value="不課税">不課税</option>
                        <option value="免税">免税</option>
                      </select>
                    ) : (
                      entry.taxRate
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {entry.isConfirmed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                        <Check className="w-3 h-3" />
                        確認済
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">未確認</span>
                    )}
                  </td>
                  {editable && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        ) : isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(entry.id)}
                              className="p-1.5 text-teal-600 hover:bg-teal-50 rounded"
                              title="保存"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded text-xs"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            {!entry.isConfirmed && (
                              <>
                                <button
                                  onClick={() => startEdit(entry)}
                                  className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                                  title="編集"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => confirmEntry(entry.id)}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                  title="確認"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}

            {/* 新規追加行 */}
            {showAddRow && (
              <tr className="border-b bg-teal-50/50">
                <td className="px-4 py-3">
                  <input
                    type="date"
                    value={newEntry.date || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={newEntry.description || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-sm"
                    placeholder="摘要を入力"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={newEntry.accountCode || ""}
                    onChange={(e) => handleAccountSelect(e.target.value, (data) => setNewEntry(data), newEntry)}
                    className="w-full px-2 py-1 border rounded text-sm"
                  >
                    <option value="">選択...</option>
                    {CATEGORY_ORDER.map((category) => {
                      const categoryAccounts = accounts.filter((a) => a.category === category);
                      if (categoryAccounts.length === 0) return null;
                      return (
                        <optgroup key={category} label={category}>
                          {categoryAccounts.map((acc) => (
                            <option key={acc.code} value={acc.code}>
                              {acc.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                    {accounts
                      .filter((a) => !CATEGORY_ORDER.includes(a.category))
                      .map((acc) => (
                        <option key={acc.code} value={acc.code}>
                          {acc.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const newAccount = accounts.find((a) => a.code === newEntry.accountCode);
                    return (
                      <SubAccountCombobox
                        subAccounts={newAccount?.subAccounts || []}
                        value={newEntry.subAccountCode || ""}
                        valueName={newEntry.subAccountName || ""}
                        onChange={(code, name) =>
                          setNewEntry({ ...newEntry, subAccountCode: code, subAccountName: name })
                        }
                        accountId={newAccount?.id || ""}
                        clientId={clientId}
                        onSubAccountAdded={onAccountsRefresh}
                      />
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={newEntry.debitAmount || 0}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, debitAmount: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-2 py-1 border rounded text-sm text-right"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={newEntry.creditAmount || 0}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, creditAmount: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-2 py-1 border rounded text-sm text-right"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={newEntry.taxRate || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, taxRate: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-sm"
                  >
                    <option value="">なし</option>
                    <option value="課税10%">課税10%</option>
                    <option value="課税8%">課税8%</option>
                    <option value="非課税">非課税</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-400">-</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={addEntry}
                      className="p-1.5 text-teal-600 hover:bg-teal-50 rounded"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowAddRow(false)}
                      className="p-1.5 text-gray-600 hover:bg-gray-100 rounded text-xs"
                    >
                      取消
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* フッター */}
      <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
        <div className="text-sm text-gray-600">
          合計: {entries.length} 件
          {entries.filter((e) => e.isConfirmed).length > 0 && (
            <span className="ml-2 text-green-600">
              ({entries.filter((e) => e.isConfirmed).length} 件確認済)
            </span>
          )}
        </div>
        {editable && onAdd && (
          <button
            onClick={() => setShowAddRow(true)}
            disabled={showAddRow}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-teal-50 rounded-lg disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            仕訳を追加
          </button>
        )}
      </div>
    </div>
  );
}
