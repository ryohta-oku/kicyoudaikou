"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getEffectiveRole } from "@/lib/roleSimulation";
import {
  Clock,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  Loader2,
  Timer,
  TrendingUp,
  TrendingDown,
  Users,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkLog {
  id: string;
  sessionId: string | null;
  userId: string;
  userName: string;
  userRole: string;
  folderId: string | null;
  folderName: string;
  documentId: string | null;
  action: string;
  workType: string;
  durationSec: number;
  createdAt: string;
}

interface WorkSession {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  folderId: string | null;
  folderName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalSec: number;
  documentCount: number;
  workLogs: WorkLog[];
}

const WORK_TYPE_LABELS: Record<string, string> = {
  preparation: "準備",
  ocr_review: "OCR確認",
  classify: "仕訳分類",
  review: "仕訳確認",
  export: "エクスポート",
  upload: "アップロード",
  handoff: "引き継ぎ",
};

const WORK_TYPE_COLORS: Record<string, string> = {
  preparation: "bg-gray-400",
  ocr_review: "bg-teal-400",
  classify: "bg-purple-400",
  review: "bg-green-400",
  export: "bg-amber-400",
  upload: "bg-cyan-400",
  handoff: "bg-pink-400",
};

const ROLE_LABELS: Record<string, string> = {
  user_a: "A型",
  user_b: "B型",
  admin: "管理者",
  instructor: "指導者",
};

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `${m}分${s}秒` : `${m}分`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}時間${rm}分` : `${h}時間`;
}

function formatShortDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h${rm}m` : `${h}h`;
}

function getWeekRange(date: Date): { from: string; to: string; label: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: monday.toISOString().split("T")[0],
    to: sunday.toISOString().split("T")[0],
    label: `${monday.getMonth() + 1}/${monday.getDate()} - ${sunday.getMonth() + 1}/${sunday.getDate()}`,
  };
}

export default function WorkLogsPage() {
  const { data: session } = useSession();
  const userRole = getEffectiveRole(session?.user?.role || "");
  const isManager = userRole === "admin" || userRole === "instructor";

  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"sessions" | "chart">("sessions");

  const fetchSessions = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      // A型/B型は自分のデータのみ取得
      if (userRole === "user_a" || userRole === "user_b") {
        params.set("userId", session.user.id);
        params.set("userRole", userRole);
      }
      const res = await fetch(`/api/worksessions?${params.toString()}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error("Failed to fetch work sessions:", error);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, session?.user?.id, userRole]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 工程別の集計
  const getBreakdown = (logs: WorkLog[]) => {
    const map: Record<string, number> = {};
    for (const log of logs) {
      if (log.action === "work_session") {
        map[log.workType] = (map[log.workType] || 0) + log.durationSec;
      }
    }
    return Object.entries(map)
      .filter(([, sec]) => sec > 0)
      .sort((a, b) => b[1] - a[1]);
  };

  // 日別集計（推移グラフ用）
  const getDailyData = () => {
    const map: Record<string, Record<string, number>> = {};
    for (const ws of sessions) {
      const date = new Date(ws.startedAt).toISOString().split("T")[0];
      if (!map[date]) map[date] = {};
      for (const log of ws.workLogs) {
        if (log.action === "work_session") {
          map[date][log.workType] = (map[date][log.workType] || 0) + log.durationSec;
        }
      }
    }
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14); // 直近14日
  };

  // 利用者別サマリー（管理者用）
  const getUserSummary = () => {
    const map: Record<string, {
      userName: string;
      userRole: string;
      totalSec: number;
      sessionCount: number;
      documentCount: number;
      thisWeekSec: number;
      lastWeekSec: number;
    }> = {};
    const now = new Date();
    const thisWeek = getWeekRange(now);
    const lastWeekDate = new Date(now);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeek = getWeekRange(lastWeekDate);

    for (const ws of sessions) {
      if (!map[ws.userId]) {
        map[ws.userId] = {
          userName: ws.userName,
          userRole: ws.userRole,
          totalSec: 0,
          sessionCount: 0,
          documentCount: 0,
          thisWeekSec: 0,
          lastWeekSec: 0,
        };
      }
      const u = map[ws.userId];
      const sessionSec = ws.workLogs
        .filter((l) => l.action === "work_session")
        .reduce((sum, l) => sum + l.durationSec, 0);
      u.totalSec += sessionSec;
      u.sessionCount += 1;
      u.documentCount += ws.documentCount;

      const wsDate = ws.startedAt.split("T")[0];
      if (wsDate >= thisWeek.from && wsDate <= thisWeek.to) {
        u.thisWeekSec += sessionSec;
      }
      if (wsDate >= lastWeek.from && wsDate <= lastWeek.to) {
        u.lastWeekSec += sessionSec;
      }
    }

    return Object.entries(map).map(([userId, data]) => ({ userId, ...data }));
  };

  // 生産性指標
  const getProductivity = () => {
    const completedSessions = sessions.filter((s) => s.status === "completed" && s.documentCount > 0);
    if (completedSessions.length === 0) return null;

    const totalDocs = completedSessions.reduce((sum, s) => sum + s.documentCount, 0);
    const totalSec = completedSessions.reduce((sum, s) => {
      return sum + s.workLogs
        .filter((l) => l.action === "work_session")
        .reduce((s2, l) => s2 + l.durationSec, 0);
    }, 0);

    return {
      avgSecPerDoc: totalDocs > 0 ? Math.round(totalSec / totalDocs) : 0,
      docsPerHour: totalSec > 0 ? Math.round((totalDocs / totalSec) * 3600 * 10) / 10 : 0,
      totalDocs,
      totalSec,
    };
  };

  // CSV出力
  const handleExportCSV = (format: "user" | "daily" | "session") => {
    let csv = "\uFEFF"; // BOM
    if (format === "session") {
      csv += "セッションID,ユーザー名,ロール,開始日時,完了日時,合計時間(秒),処理枚数,ステータス,フォルダ名\n";
      for (const ws of sessions) {
        const totalLogSec = ws.workLogs
          .filter((l) => l.action === "work_session")
          .reduce((sum, l) => sum + l.durationSec, 0);
        csv += `${ws.id},${ws.userName},${ROLE_LABELS[ws.userRole] || ws.userRole},${ws.startedAt},${ws.completedAt || ""},${totalLogSec},${ws.documentCount},${ws.status},${ws.folderName}\n`;
      }
    } else if (format === "daily") {
      csv += "日付,ユーザー名,準備(秒),OCR確認(秒),仕訳分類(秒),仕訳確認(秒),合計(秒)\n";
      const dayMap: Record<string, Record<string, Record<string, number>>> = {};
      for (const ws of sessions) {
        const date = ws.startedAt.split("T")[0];
        if (!dayMap[date]) dayMap[date] = {};
        if (!dayMap[date][ws.userName]) dayMap[date][ws.userName] = {};
        for (const log of ws.workLogs) {
          if (log.action === "work_session") {
            dayMap[date][ws.userName][log.workType] = (dayMap[date][ws.userName][log.workType] || 0) + log.durationSec;
          }
        }
      }
      for (const [date, users] of Object.entries(dayMap).sort()) {
        for (const [userName, types] of Object.entries(users)) {
          const prep = types.preparation || 0;
          const ocr = types.ocr_review || 0;
          const cls = types.classify || 0;
          const rev = types.review || 0;
          const total = prep + ocr + cls + rev;
          csv += `${date},${userName},${prep},${ocr},${cls},${rev},${total}\n`;
        }
      }
    } else {
      csv += "ユーザー名,ロール,合計時間(秒),セッション数,処理枚数,今週(秒),先週(秒)\n";
      for (const u of getUserSummary()) {
        csv += `${u.userName},${ROLE_LABELS[u.userRole] || u.userRole},${u.totalSec},${u.sessionCount},${u.documentCount},${u.thisWeekSec},${u.lastWeekSec}\n`;
      }
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worklogs_${format}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dailyData = getDailyData();
  const maxDailySec = Math.max(...dailyData.map(([, types]) => Object.values(types).reduce((a, b) => a + b, 0)), 1);
  const productivity = getProductivity();

  return (
    <div className="space-y-6 md:space-y-8">
      {/* ヘッダー */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-foreground">工数管理</h1>
          <p className="text-sm text-teal-700 mt-1">作業時間の記録と分析</p>
        </div>
      </div>

      {/* フィルタ */}
      <div className="card-glass rounded-xl p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-teal-700 whitespace-nowrap">期間:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm"
            />
            <span className="text-gray-400">〜</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setViewMode("sessions")}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                viewMode === "sessions" ? "bg-teal-100 text-teal-700 font-medium" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              一覧
            </button>
            <button
              onClick={() => setViewMode("chart")}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                viewMode === "chart" ? "bg-teal-100 text-teal-700 font-medium" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              推移
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : viewMode === "chart" ? (
        /* ===== 推移グラフ ===== */
        <div className="space-y-6">
          <div className="card-glass rounded-xl p-4 md:p-6">
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-600" />
              日別作業時間推移（直近14日）
            </h2>
            {dailyData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">データがありません</p>
            ) : (
              <div className="space-y-2">
                {dailyData.map(([date, types]) => {
                  const total = Object.values(types).reduce((a, b) => a + b, 0);
                  const [, m, d] = date.split("-");
                  return (
                    <div key={date} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12 text-right flex-shrink-0">
                        {parseInt(m)}/{parseInt(d)}
                      </span>
                      <div className="flex-1 flex h-6 rounded overflow-hidden bg-gray-100">
                        {Object.entries(types).map(([wt, sec]) => (
                          <div
                            key={wt}
                            className={cn("h-full", WORK_TYPE_COLORS[wt] || "bg-gray-300")}
                            style={{ width: `${(sec / maxDailySec) * 100}%` }}
                            title={`${WORK_TYPE_LABELS[wt] || wt}: ${formatDuration(sec)}`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-600 w-14 text-right flex-shrink-0">
                        {formatShortDuration(total)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 凡例 */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
              {Object.entries(WORK_TYPE_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={cn("w-3 h-3 rounded", WORK_TYPE_COLORS[key])} />
                  <span className="text-xs text-gray-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ===== セッション一覧 ===== */
        <div className="space-y-6">
          {/* 生産性指標 */}
          {productivity && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="card-glass rounded-xl p-4">
                <p className="text-xs text-teal-700 mb-1">1枚あたり平均</p>
                <p className="text-lg font-bold text-foreground">{formatDuration(productivity.avgSecPerDoc)}</p>
              </div>
              <div className="card-glass rounded-xl p-4">
                <p className="text-xs text-teal-700 mb-1">処理速度</p>
                <p className="text-lg font-bold text-foreground">{productivity.docsPerHour} 枚/時</p>
              </div>
              <div className="card-glass rounded-xl p-4">
                <p className="text-xs text-teal-700 mb-1">処理枚数</p>
                <p className="text-lg font-bold text-foreground">{productivity.totalDocs} 枚</p>
              </div>
              <div className="card-glass rounded-xl p-4">
                <p className="text-xs text-teal-700 mb-1">合計時間</p>
                <p className="text-lg font-bold text-foreground">{formatDuration(productivity.totalSec)}</p>
              </div>
            </div>
          )}

          {/* 管理者: 利用者別サマリー */}
          {isManager && sessions.length > 0 && (
            <div className="card-glass rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b bg-teal-50/80">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-600" />
                  利用者別サマリー
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2.5 text-left font-medium text-teal-800">名前</th>
                      <th className="px-4 py-2.5 text-left font-medium text-teal-800">ロール</th>
                      <th className="px-4 py-2.5 text-right font-medium text-teal-800">今週</th>
                      <th className="px-4 py-2.5 text-right font-medium text-teal-800">先週</th>
                      <th className="px-4 py-2.5 text-right font-medium text-teal-800">増減</th>
                      <th className="px-4 py-2.5 text-right font-medium text-teal-800">平均/回</th>
                      <th className="px-4 py-2.5 text-right font-medium text-teal-800">処理枚数</th>
                      <th className="px-4 py-2.5 text-right font-medium text-teal-800">枚/時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getUserSummary()
                      .sort((a, b) => b.totalSec - a.totalSec)
                      .map((u) => {
                        const avgSec = u.sessionCount > 0 ? Math.round(u.totalSec / u.sessionCount) : 0;
                        const docsPerHour = u.totalSec > 0 ? Math.round((u.documentCount / u.totalSec) * 3600 * 10) / 10 : 0;
                        const change = u.lastWeekSec > 0 ? Math.round(((u.thisWeekSec - u.lastWeekSec) / u.lastWeekSec) * 100) : null;
                        return (
                          <tr key={u.userId} className="border-b hover:bg-teal-50/50">
                            <td className="px-4 py-3 font-medium text-foreground">{u.userName || "-"}</td>
                            <td className="px-4 py-3 text-teal-700">{ROLE_LABELS[u.userRole] || u.userRole}</td>
                            <td className="px-4 py-3 text-right">{formatDuration(u.thisWeekSec)}</td>
                            <td className="px-4 py-3 text-right">{formatDuration(u.lastWeekSec)}</td>
                            <td className="px-4 py-3 text-right">
                              {change !== null ? (
                                <span className={cn("inline-flex items-center gap-0.5", change >= 0 ? "text-green-600" : "text-red-600")}>
                                  {change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                  {Math.abs(change)}%
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">{formatDuration(avgSec)}</td>
                            <td className="px-4 py-3 text-right">{u.documentCount}</td>
                            <td className="px-4 py-3 text-right">{docsPerHour}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CSV出力 */}
          {isManager && sessions.length > 0 && (
            <div className="card-glass rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Download className="w-4 h-4 text-teal-600" />
                CSV出力
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleExportCSV("user")}
                  className="px-4 py-2 text-sm bg-teal-50 text-teal-800 hover:bg-teal-100 rounded-lg transition-colors"
                >
                  利用者別
                </button>
                <button
                  onClick={() => handleExportCSV("daily")}
                  className="px-4 py-2 text-sm bg-teal-50 text-teal-800 hover:bg-teal-100 rounded-lg transition-colors"
                >
                  日別
                </button>
                <button
                  onClick={() => handleExportCSV("session")}
                  className="px-4 py-2 text-sm bg-teal-50 text-teal-800 hover:bg-teal-100 rounded-lg transition-colors"
                >
                  セッション別
                </button>
              </div>
            </div>
          )}

          {/* セッション一覧 */}
          <div className="card-glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-teal-50/80">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Timer className="w-4 h-4 text-teal-600" />
                セッション一覧
                <span className="text-xs text-gray-500 font-normal">({sessions.length}件)</span>
              </h2>
            </div>
            {sessions.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">作業記録がありません</p>
              </div>
            ) : (
              <div className="divide-y">
                {sessions.map((ws) => {
                  const isExpanded = expandedIds.has(ws.id);
                  const breakdown = getBreakdown(ws.workLogs);
                  const totalLogSec = ws.workLogs
                    .filter((l) => l.action === "work_session")
                    .reduce((sum, l) => sum + l.durationSec, 0);
                  const actionLogs = ws.workLogs.filter((l) => l.action !== "work_session");
                  return (
                    <div key={ws.id}>
                      <button
                        onClick={() => toggleExpand(ws.id)}
                        className="w-full text-left px-4 py-3 hover:bg-teal-50/50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {new Date(ws.startedAt).toLocaleDateString("ja-JP")}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(ws.startedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                {isManager && ws.userName && (
                                  <span className="text-xs text-gray-500">({ws.userName})</span>
                                )}
                                <span className={cn(
                                  "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium",
                                  ws.status === "completed" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                                )}>
                                  {ws.status === "completed" ? "完了" : "作業中"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                {ws.folderName && (
                                  <span className="inline-flex items-center gap-1 truncate">
                                    <FileText className="w-3 h-3" />
                                    {ws.folderName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {ws.documentCount > 0 && (
                              <span className="text-xs text-gray-500">{ws.documentCount}枚</span>
                            )}
                            <span className="text-sm font-medium text-gray-900">
                              {formatDuration(totalLogSec)}
                            </span>
                          </div>
                        </div>
                        {/* ミニバー */}
                        {totalLogSec > 0 && (
                          <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mt-2 ml-7">
                            {breakdown.map(([wt, sec]) => (
                              <div
                                key={wt}
                                className={cn("h-full", WORK_TYPE_COLORS[wt] || "bg-gray-300")}
                                style={{ width: `${(sec / totalLogSec) * 100}%` }}
                              />
                            ))}
                          </div>
                        )}
                      </button>
                      {/* 展開: 工程別内訳 */}
                      {isExpanded && (
                        <div className="px-4 pb-4 ml-7 space-y-3">
                          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                            <p className="text-xs font-medium text-gray-600 mb-2">工程別内訳</p>
                            {breakdown.length === 0 ? (
                              <p className="text-xs text-gray-400">計測データなし</p>
                            ) : (
                              breakdown.map(([wt, sec]) => (
                                <div key={wt} className="flex items-center gap-2">
                                  <div className={cn("w-3 h-3 rounded flex-shrink-0", WORK_TYPE_COLORS[wt])} />
                                  <span className="text-xs text-gray-700 w-20">{WORK_TYPE_LABELS[wt] || wt}</span>
                                  <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={cn("h-full rounded-full", WORK_TYPE_COLORS[wt])}
                                      style={{ width: `${(sec / totalLogSec) * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-600 w-16 text-right">{formatDuration(sec)}</span>
                                </div>
                              ))
                            )}
                          </div>
                          {actionLogs.length > 0 && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs font-medium text-gray-600 mb-2">アクション履歴</p>
                              <div className="space-y-1">
                                {actionLogs.map((log) => (
                                  <div key={log.id} className="flex items-center gap-2 text-xs text-gray-600">
                                    <span className="text-gray-400">
                                      {new Date(log.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                    <span>{WORK_TYPE_LABELS[log.workType] || log.workType}: {log.action}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
