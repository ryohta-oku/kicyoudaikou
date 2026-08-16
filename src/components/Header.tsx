"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { FileText, Home, Settings, Building2, Shield, LogOut, Menu, User, ShieldCheck, X, Eye, Clock, Users, ExternalLink, FileCheck2, BookOpen } from "lucide-react";
import { getSelectedClientId, setSelectedClientId } from "@/lib/client";
import { getSimulatedRole, setSimulatedRole, getSimulatedUser, setSimulatedUser, SIMULATION_PERSONAS } from "@/lib/roleSimulation";
import ClientSelector from "@/components/ClientSelector";
import { VIEW_COOKIE, VIEW_AS_ADVISOR } from "@/lib/roles";

/**
 * 管理者が動作を確かめるための切り替え。
 *
 * 利用者を2人にしているのは、2026-09-01 の A型のみ移行で**ダブルチェックが
 * 「作業者と確認者が別人」**になったため。1人だと2ndチェックの側を確かめられない。
 *
 * B型は新規では使わないが、過去のフォルダの表示確認のために残す。
 */
const ROLE_VIEW_OPTIONS = [
  { value: "", role: "", label: "管理者（自分）", persona: null },
  { value: "instructor", role: "instructor", label: "指導者として表示", persona: null },
  { value: "user_a:sim-a-1", role: "user_a", label: "利用者Aさんとして表示", persona: SIMULATION_PERSONAS.user_a[0] },
  { value: "user_a:sim-a-2", role: "user_a", label: "利用者Bさんとして表示", persona: SIMULATION_PERSONAS.user_a[1] },
  { value: "user_b:sim-b-1", role: "user_b", label: "旧B型Aさんとして表示", persona: SIMULATION_PERSONAS.user_b[0] },
  { value: "user_b:sim-b-2", role: "user_b", label: "旧B型Bさんとして表示", persona: SIMULATION_PERSONAS.user_b[1] },
];

export default function Header() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [selectedClientId, setSelectedClientIdState] = useState<string | null>(() => getSelectedClientId());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [simulatedValue, setSimulatedValue] = useState<string>("");
  /** 「税理士として操作」に切り替えられる人か（担当得意先を持っている） */
  const [canActAsAdvisor, setCanActAsAdvisor] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { href: "/", label: "ダッシュボード", icon: Home },
    // 迷ったときにどの画面からでも戻れるよう、常に出す。
    // 説明書は「探して見つける」ものではなく「いつでもそこにある」もの
    { href: "/guide", label: "使い方", icon: BookOpen },
    { href: "/worklogs", label: "工数管理", icon: Clock },
    { href: "/accounts", label: "勘定科目管理", icon: Settings },
    { href: "/clients", label: "得意先管理", icon: Building2 },
  ];

  useEffect(() => {
    if (status === "authenticated") {
      // ロールシミュレーション状態を復元
      const role = getSimulatedRole() || "";
      const user = getSimulatedUser();
      if (role && user) {
        setSimulatedValue(`${role}:${user.id}`);
      } else if (role) {
        setSimulatedValue(role);
      } else {
        setSimulatedValue("");
      }
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCanActAsAdvisor(!!data?.canActAsAdvisor))
      .catch(() => {
        // 取れなければボタンを出さないだけ
      });
  }, [status]);

  /**
   * 税理士の立場に切り替える。
   *
   * cookie を立てるだけ。**サーバー側では「要求」として扱われ、制限する方向に
   * しか効かない** ―― 担当得意先を持たない人が立てても、見えるものが空になる。
   * 戻すのは確認画面のバナーから（管理画面には入れなくなるため）。
   */
  const switchToAdvisor = () => {
    document.cookie = `${VIEW_COOKIE}=${VIEW_AS_ADVISOR}; path=/`;
    // cookie を見て組み立て直す必要があるので、ページごと遷移させる
    window.location.href = "/review";
  };

  const handleRoleSimulation = (value: string) => {
    const option = ROLE_VIEW_OPTIONS.find((o) => o.value === value);
    if (!option || !value) {
      setSimulatedRole(null);
      setSimulatedUser(null);
      setSimulatedValue("");
    } else {
      setSimulatedRole(option.role || null);
      setSimulatedUser(option.persona ? { id: option.persona.id, name: option.persona.name } : null);
      setSimulatedValue(value);
    }
    // ロール/ペルソナ変更時は作業セッションをクリア
    localStorage.removeItem("workSessionId");
    localStorage.removeItem("workSessionRole");
    window.location.reload();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  /*
    税理士の確認画面では、事業所のナビ（ダッシュボード・工数管理・得意先管理…）を
    出さない。税理士さんに要るのは確認する書類だけで、他を見せると迷わせる。
    あちらは ReviewShell が自前の細いヘッダーを持っている。
  */
  if (pathname.startsWith("/review")) {
    return null;
  }

  const handleClientSelect = (clientId: string) => {
    setSelectedClientIdState(clientId);
    setSelectedClientId(clientId);
    router.refresh();
    window.location.reload();
  };

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
              <ClientSelector
                selectedId={selectedClientId}
                onSelect={handleClientSelect}
                variant="header"
              />

              {/* ロール切替（管理者のみ）。**表示を変えるだけ** */}
              {session.user.role === "admin" && (
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-teal-400" />
                  <select
                    value={simulatedValue}
                    onChange={(e) => handleRoleSimulation(e.target.value)}
                    className={cn(
                      "text-xs font-medium px-2 py-1 rounded-lg border appearance-none cursor-pointer pr-6",
                      simulatedValue
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

              {/*
                税理士として操作する。**上の「〜として表示」とは別物なので、
                同じ選択肢に並べない。** あちらは表示を変えるだけだが、
                こちらは本物の操作で、押したことが記録に残る。
                同じ場所に並べると、その違いが伝わらない。
              */}
              {canActAsAdvisor && (
                <button
                  onClick={switchToAdvisor}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors"
                  title="税理士の立場で仕訳を確認します。記録には「（税理士として）」と残ります"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  税理士として確認
                </button>
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
      {session.user.role === "admin" && simulatedValue && (
        <div className="bg-violet-600 text-white text-center py-1.5 text-sm font-medium sticky top-14 md:top-16 z-40 flex items-center justify-center gap-2">
          <Eye className="h-4 w-4" />
          <span>
            {ROLE_VIEW_OPTIONS.find((o) => o.value === simulatedValue)?.label || simulatedValue}
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
              <ClientSelector
                selectedId={selectedClientId}
                onSelect={handleClientSelect}
                variant="header"
                className="w-full"
              />
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

              {/*
                税理士として確認する。**ここにも置く。**
                デスクトップのナビにしか置いていなかったので、画面が狭いと
                消えてしまい、切り替える手立てが無くなっていた。
              */}
              {canActAsAdvisor && (
                <button
                  onClick={switchToAdvisor}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  <FileCheck2 className="h-5 w-5" />
                  税理士として確認
                </button>
              )}
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
                    value={simulatedValue}
                    onChange={(e) => handleRoleSimulation(e.target.value)}
                    className={cn(
                      "w-full text-sm px-3 py-2 rounded-lg border appearance-none cursor-pointer",
                      simulatedValue
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
