"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { FileText, Home, Settings, Building2, Plus, ChevronDown, Search, Shield, LogOut } from "lucide-react";
import { getSelectedClientId, setSelectedClientId } from "@/lib/client";

interface Client {
  id: string;
  name: string;
}

export default function Header() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const navItems = [
    { href: "/", label: "ダッシュボード", icon: Home },
    { href: "/accounts", label: "勘定科目管理", icon: Settings },
    { href: "/clients", label: "得意先管理", icon: Building2 },
  ];

  useEffect(() => {
    if (status === "authenticated") {
      fetchClients();
    }
  }, [status]);

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

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // 未認証時はヘッダー非表示
  if (status !== "authenticated") {
    return null;
  }

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      const list: Client[] = data.clients || [];
      setClients(list);

      const stored = getSelectedClientId();
      if (stored && list.some((c) => c.id === stored)) {
        setSelectedId(stored);
      } else if (list.length > 0) {
        setSelectedId(list[0].id);
        setSelectedClientId(list[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  };

  const handleSelect = (clientId: string) => {
    setSelectedId(clientId);
    setSelectedClientId(clientId);
    setIsOpen(false);
    setSearchQuery("");
    router.refresh();
    window.location.reload();
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
        const names = data.similarClients.map((c: { name: string }) => c.name).join("\n  ");
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

  // 検索クエリでフィルタ
  const query = searchQuery.trim().toLowerCase();
  const filteredClients = query
    ? clients.filter((c) => c.name.toLowerCase().includes(query))
    : clients;

  // 完全一致する既存得意先があるか（追加ボタン表示判定用）
  const hasExactMatch = query
    ? clients.some((c) => c.name.toLowerCase() === query)
    : true;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <FileText className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">記帳代行ツール</h1>
                <p className="text-xs text-gray-500">Bookkeeping Assistant</p>
              </div>
            </Link>

            {/* 得意先セレクタ */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
              >
                <Building2 className="h-4 w-4 text-gray-500" />
                <span className="max-w-[150px] truncate">{selectedClient?.name || "得意先を選択"}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  {/* 検索窓 */}
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
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
                        className="w-full pl-8 pr-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* 候補リスト */}
                  <div className="max-h-60 overflow-y-auto py-1">
                    {filteredClients.length > 0 ? (
                      filteredClients.map((client) => (
                        <button
                          key={client.id}
                          onClick={() => handleSelect(client.id)}
                          className={cn(
                            "w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors",
                            client.id === selectedId
                              ? "bg-blue-50 text-blue-700 font-medium"
                              : "text-gray-700"
                          )}
                        >
                          {client.name}
                        </button>
                      ))
                    ) : query ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        一致する得意先がありません
                      </div>
                    ) : null}
                  </div>

                  {/* 追加ボタン（検索クエリがあり、完全一致がない場合のみ表示） */}
                  {query && !hasExactMatch && (
                    <div className="border-t border-gray-100 p-1">
                      <button
                        onClick={handleAdd}
                        className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors flex items-center gap-2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        「{searchQuery.trim()}」を追加
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* ユーザー情報 */}
            <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                {session.user.role === "admin" && (
                  <Shield className="h-4 w-4 text-amber-500" />
                )}
                <span className="max-w-[120px] truncate">{session.user.email}</span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                title="ログアウト"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
