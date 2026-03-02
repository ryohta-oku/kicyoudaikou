"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Building2, Plus, ChevronDown, Search } from "lucide-react";
import { getSelectedClientId, setSelectedClientId } from "@/lib/client";

interface Client {
  id: string;
  name: string;
  isApproved?: boolean;
}

export interface ClientSelectorProps {
  /** 現在選択中の得意先ID */
  selectedId: string | null;
  /** 得意先選択時のコールバック（IDのみ or ID+名前） */
  onSelect: (clientId: string, clientName?: string) => void;
  /** 追加のCSSクラス */
  className?: string;
  /** 表示バリアント: header=ヘッダー内ドロップダウン, form=フォーム内横型レイアウト */
  variant?: "header" | "form";
  /** 初回ロード時に自動選択するか（default: true、formでは false推奨） */
  autoSelect?: boolean;
}

export default function ClientSelector({
  selectedId,
  onSelect,
  className,
  variant = "header",
  autoSelect = true,
}: ClientSelectorProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 得意先一覧を取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/clients");
        const data = await res.json();
        if (cancelled) return;
        const list: Client[] = data.clients || [];
        setClients(list);

        // 初期選択: selectedId が未設定 or リスト内に存在しない場合のみ補正
        if (list.length > 0 && autoSelect) {
          const currentValid = selectedId && list.some((c) => c.id === selectedId);
          if (!currentValid) {
            const stored = getSelectedClientId();
            const storedClient = list.find((c) => c.id === stored);
            if (storedClient) {
              onSelect(storedClient.id, storedClient.name);
            } else {
              setSelectedClientId(list[0].id);
              onSelect(list[0].id, list[0].name);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch clients:", error);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 開いたら検索入力にフォーカス
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const name = clients.find((c) => c.id === clientId)?.name;
    onSelect(clientId, name);
    setIsOpen(false);
    setSearchQuery("");
  };

  const createClient = async (name: string, force: boolean) => {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, force }),
    });
    return { res, data: await res.json() };
  };

  const handleAdd = async () => {
    const name = searchQuery.trim();
    if (!name) return;
    if (!confirm(`「${name}」を得意先として追加しますか？`)) return;
    try {
      const { res, data } = await createClient(name, false);

      if (res.status === 409 && data.code === "CLIENT_SIMILAR_EXISTS") {
        const names = data.similarClients
          .map((c: { name: string }) => c.name)
          .join("\n  ");
        const confirmed = confirm(
          `以下の類似する得意先が既に登録されています:\n  ${names}\n\nそれでも「${name}」を追加しますか？`
        );
        if (!confirmed) return;

        const { res: res2, data: data2 } = await createClient(name, true);
        if (res2.ok && data2.client) {
          setClients((prev) => [...prev, data2.client]);
          handleSelect(data2.client.id);
        }
        return;
      }

      if (res.ok && data.client) {
        setClients((prev) => [...prev, data.client]);
        handleSelect(data.client.id);
      }
    } catch (error) {
      console.error("Failed to create client:", error);
    }
  };

  const selectedClient = clients.find((c) => c.id === selectedId);

  // 検索フィルタ
  const query = searchQuery.trim().toLowerCase();
  const filteredClients = query
    ? clients.filter((c) => c.name.toLowerCase().includes(query))
    : clients;

  // 完全一致チェック（追加ボタン表示判定）
  const hasExactMatch = query
    ? clients.some((c) => c.name.toLowerCase() === query)
    : true;

  // form variant: フォルダ名入力と同じスタイル感の横型レイアウト
  if (variant === "form") {
    return (
      <div className={cn("relative", className)} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors text-left",
            "focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent",
            "hover:border-teal-400",
            selectedClient ? "text-gray-900" : "text-gray-400"
          )}
        >
          <span className="flex-1 truncate">
            {selectedClient?.name || "得意先を選択..."}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-gray-400 transition-transform flex-shrink-0",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white/95 backdrop-blur-sm border border-teal-100 rounded-lg shadow-lg z-50">
            {renderDropdownContent()}
          </div>
        )}
      </div>
    );
  }

  // header variant: 既存のヘッダードロップダウンスタイル
  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-teal-50 hover:bg-teal-100 rounded-lg text-sm font-medium text-teal-800 transition-colors px-3 py-1.5"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 text-teal-600 flex-shrink-0" />
          <span className="truncate">
            {selectedClient?.name || "得意先を選択"}
          </span>
          {selectedClient?.isApproved === false && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 flex-shrink-0">
              承認待ち
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-teal-500 transition-transform flex-shrink-0",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 w-72 bg-white/95 backdrop-blur-sm border border-teal-100 rounded-lg shadow-lg z-50">
          {renderDropdownContent()}
        </div>
      )}
    </div>
  );

  // ドロップダウン内容（検索＋リスト＋追加ボタン）を共通化
  function renderDropdownContent() {
    return (
      <>
        {/* 検索窓 */}
        <div className="p-2 border-b border-teal-100/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-teal-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                }
              }}
              placeholder="得意先を検索..."
              className="w-full pl-8 pr-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
        </div>

        {/* 候補リスト */}
        <div className="max-h-60 overflow-y-auto py-1">
          {filteredClients.length > 0 ? (
            filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => handleSelect(client.id)}
                className={cn(
                  "w-full text-left px-4 py-2 text-sm hover:bg-teal-50/50 transition-colors flex items-center gap-2",
                  client.id === selectedId
                    ? "bg-teal-50 text-teal-700 font-medium"
                    : "text-teal-800"
                )}
              >
                <span className="truncate">{client.name}</span>
                {client.isApproved === false && (
                  <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 flex-shrink-0">
                    承認待ち
                  </span>
                )}
              </button>
            ))
          ) : query ? (
            <div className="px-4 py-3 text-sm text-teal-600 text-center">
              一致する得意先がありません
            </div>
          ) : null}
        </div>

        {/* 追加ボタン */}
        {query && !hasExactMatch && (
          <div className="border-t border-teal-100/50 p-1">
            <button
              type="button"
              onClick={handleAdd}
              className="w-full text-left px-4 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-md transition-colors flex items-center gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              「{searchQuery.trim()}」を追加
            </button>
          </div>
        )}
      </>
    );
  }
}
