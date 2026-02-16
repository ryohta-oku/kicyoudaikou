"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface SubAccount {
  id: string;
  code: string;
  name: string;
}

interface SubAccountComboboxProps {
  subAccounts: SubAccount[];
  value: string; // subAccountCode
  valueName: string; // subAccountName (表示用)
  onChange: (code: string, name: string) => void;
  accountId: string;
  clientId?: string | null;
  disabled?: boolean;
  onSubAccountAdded?: () => void;
}

export default function SubAccountCombobox({
  subAccounts,
  value,
  valueName,
  onChange,
  accountId,
  clientId,
  disabled = false,
  onSubAccountAdded,
}: SubAccountComboboxProps) {
  const [inputText, setInputText] = useState(valueName || "");
  const [isOpen, setIsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 外部からvalueNameが変わったら入力欄を同期
  useEffect(() => {
    setInputText(valueName || "");
  }, [valueName]);

  // 外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = subAccounts.filter((s) =>
    s.name.toLowerCase().includes(inputText.toLowerCase())
  );

  const exactMatch = subAccounts.some(
    (s) => s.name === inputText.trim()
  );

  const handleSelect = (sub: SubAccount) => {
    onChange(sub.code, sub.name);
    setInputText(sub.name);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("", "");
    setInputText("");
  };

  const handleAdd = async () => {
    const name = inputText.trim();
    if (!name || !accountId) return;

    setAdding(true);
    try {
      const res = await fetch("/api/accounts/sub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, name, clientId: clientId || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "補助科目の追加に失敗しました");
        return;
      }

      const data = await res.json();
      const newSub = data.subAccount;
      onChange(newSub.code, newSub.name);
      setInputText(newSub.name);
      setIsOpen(false);

      // 親にaccountsリストの再取得を通知
      onSubAccountAdded?.();
    } catch {
      alert("補助科目の追加に失敗しました");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={inputText}
        onChange={(e) => {
          const newText = e.target.value;
          setInputText(newText);
          setIsOpen(true);
          if (newText === "") {
            handleClear();
          } else {
            // 入力テキストをそのまま親に反映（マスター一致ならコードも設定）
            const matched = subAccounts.find((s) => s.name === newText.trim());
            onChange(matched?.code || "", newText);
          }
        }}
        onFocus={() => setIsOpen(true)}
        disabled={disabled}
        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        placeholder="補助科目を入力..."
      />
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {/* なし（クリア）オプション */}
          {value && (
            <button
              type="button"
              onClick={() => {
                handleClear();
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
            >
              -- なし --
            </button>
          )}
          {filtered.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => handleSelect(sub)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                sub.code === value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
              }`}
            >
              {sub.name}
            </button>
          ))}
          {/* 追加ボタン: 入力テキストがあり、完全一致がない場合 */}
          {inputText.trim() && !exactMatch && accountId && (
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t flex items-center gap-1"
            >
              {adding ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <span>+</span>
              )}
              「{inputText.trim()}」を追加する
            </button>
          )}
          {inputText.trim() && !exactMatch && !accountId && (
            <div className="px-3 py-2 text-sm text-gray-400 border-t">
              勘定科目を先に選択してください
            </div>
          )}
          {filtered.length === 0 && !inputText.trim() && subAccounts.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">
              補助科目を入力して追加できます
            </div>
          )}
        </div>
      )}
    </div>
  );
}
