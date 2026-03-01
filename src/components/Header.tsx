"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { FileText, Home, Settings, Building2, Plus, ChevronDown, Search, Shield, LogOut, Menu, User, ShieldCheck, X, Eye, Clock, Users, ExternalLink } from "lucide-react";
import { getSelectedClientId, setSelectedClientId } from "@/lib/client";
import { getSimulatedRole, setSimulatedRole } from "@/lib/roleSimulation";

const ROLE_VIEW_OPTIONS = [
  { value: "", label: "管理者（自分）" },
  { value: "instructor", label: "指導者として表示" },
  { value: "user_a", label: "A型利用者として表示" },
  { value: "user_b", label: "B型利用者として表示" },
];

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [simulatedRole, setSimulatedRoleState] = useState<string>("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const navItems = [
    { href: "/", label: "ダッシュボード", icon: Home },
    { href: "/worklogs", label: "工数管理", icon: Clock },
    { href: "/accounts", label: "勘定科目管理", icon: Settings },
    { href: "/clients", label: "得意先管理", icon: Building2 },
  ];

  useEffect(() => {
    if (status === "authenticated") {
      fetchClients();
      // ロールシミュレーション状態を復元
      setSimulatedRoleState(getSimulatedRole() || "");
    }
  }, [status]);

  const handleRoleSimulation = (role: string) => {
    setSimulatedRole(role || null);
    setSimulatedRoleState(role);
    window.location.reload();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDesktop = dropdownRef.current?.contains(target);
      const inMobile = mobileDropdownRef.current?.contains(target);
      if (!inDesktop && !inMobile) {
        setIsOpen(false);
        setSearchQuery("");
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
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

  // モバイルメニュー開閉時にbodyスクロールを制御
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isMobileMenuOpen]);

  // ページ遷移時にモバイルメニューを閉じる
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

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

  // 得意先ドロップダウン（デスクトップ・モバイル共通）
  const renderClientSelector = (mobile?: boolean) => (
    <div className={cn("relative", mobile && "w-full")} ref={mobile ? mobileDropdownRef : dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 bg-teal-50 hover:bg-teal-100 rounded-lg text-sm font-medium text-teal-800 transition-colors",
          mobile ? "w-full px-4 py-3 justify-between" : "px-3 py-1.5"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 text-teal-600 flex-shrink-0" />
          <span className="truncate">{selectedClient?.name || "得意先を選択"}</span>
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-teal-500 transition-transform flex-shrink-0", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className={cn(
          "absolute top-full mt-1 bg-white/95 backdrop-blur-sm border border-teal-100 rounded-lg shadow-lg z-50",
          mobile ? "left-0 right-0" : "left-0 w-72"
        )}>
          {/* 検索窓 */}
          <div className="p-2 border-b border-teal-100/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-teal-400" />
              <input
                ref={mobile ? undefined : inputRef}
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
                  onClick={() => handleSelect(client.id)}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm hover:bg-teal-50/50 transition-colors",
                    client.id === selectedId
                      ? "bg-teal-50 text-teal-700 font-medium"
                      : "text-teal-800"
                  )}
                >
                  {client.name}
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
                onClick={handleAdd}
                className="w-full text-left px-4 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-md transition-colors flex items-center gap-2"
              >
                <Plus className="h-3.5 w-3.5" />
                「{searchQuery.trim()}」を追加
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <header className="bg-white/90 backdrop-blur-md border-b border-teal-100/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 md:h-16">
            {/* ロゴ */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <FileText className="h-7 w-7 md:h-8 md:w-8 text-teal-600" />
              <div>
                <h1 className="text-base md:text-lg font-bold text-foreground leading-tight">記帳代行ツール</h1>
                <p className="text-xs text-teal-600 hidden sm:block">Bookkeeping Assistant</p>
              </div>
            </Link>

            {/* デスクトップ: 得意先セレクタ + ナビ + メニュー */}
            <div className="hidden md:flex items-center gap-4">
              {/* 得意先セレクタ */}
              {renderClientSelector()}

              {/* ロール切替（管理者のみ） */}
              {session.user.role === "admin" && (
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-teal-400" />
                  <select
                    value={simulatedRole}
                    onChange={(e) => handleRoleSimulation(e.target.value)}
                    className={cn(
                      "text-xs font-medium px-2 py-1 rounded-lg border appearance-none cursor-pointer pr-6",
                      simulatedRole
                        ? "bg-violet-50 text-violet-700 border-violet-200"
                        : "bg-teal-50 text-teal-600 border-teal-200"
                    )}
                  >
                    {ROLE_VIEW_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

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
                          ? "bg-teal-50 text-teal-700"
                          : "text-teal-700 hover:bg-teal-50 hover:text-teal-900"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* ユーザーメニュー */}
              <div className="relative pl-3 border-l border-teal-100" ref={menuRef}>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="flex items-center gap-2 p-2 text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                >
                  {session.user.role === "admin" && (
                    <Shield className="h-4 w-4 text-amber-500" />
                  )}
                  {session.user.role === "instructor" && (
                    <Shield className="h-4 w-4 text-green-500" />
                  )}
                  <Menu className="h-5 w-5" />
                </button>

                {isMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 w-56 bg-white/95 backdrop-blur-sm border border-teal-100 rounded-lg shadow-lg z-50 py-1">
                    <div className="px-4 py-2 border-b border-teal-100/50">
                      <p className="text-sm font-medium text-foreground truncate">{session.user.name}</p>
                      <p className="text-xs text-teal-600 truncate">{session.user.email}</p>
                    </div>
                    <Link
                      href="/account"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-teal-800 hover:bg-teal-50 transition-colors"
                    >
                      <User className="h-4 w-4" />
                      アカウント情報
                    </Link>
                    {(session.user.role === "admin" || session.user.role === "instructor") && (
                      <>
                        <Link
                          href="/admin"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-teal-800 hover:bg-teal-50 transition-colors"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          管理画面
                        </Link>
                        <Link
                          href="/admin/crm"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-teal-800 hover:bg-teal-50 transition-colors"
                        >
                          <Users className="h-4 w-4" />
                          顧客管理
                        </Link>
                        <a
                          href={process.env.NEXT_PUBLIC_CLIENT_HUB_URL || "https://crm.coco-star.jp"}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-teal-800 hover:bg-teal-50 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Client Hub
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-teal-100/50"
                    >
                      <LogOut className="h-4 w-4" />
                      ログアウト
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* モバイル: ハンバーガーボタン */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ロールシミュレーション中バナー */}
      {session.user.role === "admin" && simulatedRole && (
        <div className="bg-violet-600 text-white text-center py-1.5 text-sm font-medium sticky top-14 md:top-16 z-40 flex items-center justify-center gap-2">
          <Eye className="h-4 w-4" />
          <span>
            {ROLE_VIEW_OPTIONS.find((o) => o.value === simulatedRole)?.label || simulatedRole}
          </span>
          <button
            onClick={() => handleRoleSimulation("")}
            className="ml-2 px-2.5 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs transition-colors"
          >
            解除
          </button>
        </div>
      )}

      {/* モバイルメニュー（オーバーレイ） */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* 背景オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* メニューパネル */}
          <div className="absolute top-14 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-teal-100 shadow-lg max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            {/* 得意先セレクタ */}
            <div className="px-4 py-3 border-b border-teal-100/50">
              <p className="text-xs font-medium text-teal-700 mb-2">得意先</p>
              {renderClientSelector(true)}
            </div>

            {/* ナビゲーション */}
            <nav className="py-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-teal-50 text-teal-700"
                        : "text-teal-800 hover:bg-teal-50"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* ユーザー情報 */}
            <div className="border-t border-teal-100/50">
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-teal-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{session.user.name}</p>
                  <p className="text-xs text-teal-600 truncate">{session.user.email}</p>
                </div>
                {session.user.role === "admin" && (
                  <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">管理者</span>
                )}
                {session.user.role === "instructor" && (
                  <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">指導員</span>
                )}
              </div>
              {/* モバイル: ロール切替（管理者のみ） */}
              {session.user.role === "admin" && (
                <div className="px-4 py-3 border-b border-teal-100/50">
                  <p className="text-xs font-medium text-teal-700 mb-2 flex items-center gap-1">
                    <Eye className="h-3 w-3" />表示切替
                  </p>
                  <select
                    value={simulatedRole}
                    onChange={(e) => handleRoleSimulation(e.target.value)}
                    className={cn(
                      "w-full text-sm px-3 py-2 rounded-lg border appearance-none cursor-pointer",
                      simulatedRole
                        ? "bg-violet-50 text-violet-700 border-violet-200"
                        : "bg-teal-50 text-teal-600 border-teal-200"
                    )}
                  >
                    {ROLE_VIEW_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <Link
                href="/account"
                className="flex items-center gap-3 px-4 py-3 text-sm text-teal-800 hover:bg-teal-50 transition-colors"
              >
                <User className="h-5 w-5" />
                アカウント情報
              </Link>
              {(session.user.role === "admin" || session.user.role === "instructor") && (
                <>
                  <Link
                    href="/admin"
                    className="flex items-center gap-3 px-4 py-3 text-sm text-teal-800 hover:bg-teal-50 transition-colors"
                  >
                    <ShieldCheck className="h-5 w-5" />
                    管理画面
                  </Link>
                  <Link
                    href="/admin/crm"
                    className="flex items-center gap-3 px-4 py-3 text-sm text-teal-800 hover:bg-teal-50 transition-colors"
                  >
                    <Users className="h-5 w-5" />
                    顧客管理
                  </Link>
                  <a
                    href={process.env.NEXT_PUBLIC_CLIENT_HUB_URL || "https://crm.coco-star.jp"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 text-sm text-teal-800 hover:bg-teal-50 transition-colors"
                  >
                    <ExternalLink className="h-5 w-5" />
                    Client Hub
                  </a>
                </>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-teal-100/50"
              >
                <LogOut className="h-5 w-5" />
                ログアウト
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
