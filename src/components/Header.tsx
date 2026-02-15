"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { FileText, Home, Settings, Building2, Plus, ChevronDown } from "lucide-react";
import { getSelectedClientId, setSelectedClientId } from "@/lib/client";

interface Client {
  id: string;
  name: string;
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { href: "/", label: "ダッシュボード", icon: Home },
    { href: "/accounts", label: "勘定科目管理", icon: Settings },
  ];

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowAddInput(false);
        setNewName("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    router.refresh();
    // ページをリロードして全データを再取得
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
    if (!newName.trim()) return;
    try {
      const { res, data } = await createClient(newName.trim(), false);

      if (res.status === 409 && data.code === "CLIENT_SIMILAR_EXISTS") {
        const names = data.similarClients.map((c: { name: string }) => c.name).join("\n  ");
        const confirmed = confirm(
          `以下の類似する得意先が既に登録されています:\n  ${names}\n\nそれでも「${newName.trim()}」を追加しますか？`
        );
        if (!confirmed) return;

        const { res: res2, data: data2 } = await createClient(newName.trim(), true);
        if (res2.ok && data2.client) {
          setClients((prev) => [...prev, data2.client]);
          setNewName("");
          setShowAddInput(false);
          handleSelect(data2.client.id);
        }
        return;
      }

      if (res.ok && data.client) {
        setClients((prev) => [...prev, data.client]);
        setNewName("");
        setShowAddInput(false);
        handleSelect(data.client.id);
      }
    } catch (error) {
      console.error("Failed to create client:", error);
    }
  };

  const selectedClient = clients.find((c) => c.id === selectedId);

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
            {clients.length > 0 && (
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
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                    {clients.map((client) => (
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
                    ))}

                    <div className="border-t border-gray-100 mt-1 pt-1">
                      {showAddInput ? (
                        <div className="px-3 py-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                            placeholder="得意先名"
                            autoFocus
                            className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={handleAdd}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                          >
                            追加
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowAddInput(true)}
                          className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          得意先を追加
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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
        </div>
      </div>
    </header>
  );
}
