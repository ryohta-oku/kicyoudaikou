"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Building2, AlertTriangle, ArrowRightLeft, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
}

interface DuplicateGroup {
  normalized: string;
  clients: Client[];
}

interface ClientWithCounts {
  id: string;
  name: string;
  _count: { folders: number; subAccounts: number };
}

export default function ClientsPage() {
  const { data: session } = useSession();
  const canDelete = session?.user?.role === "admin" || session?.user?.role === "instructor";
  const [clients, setClients] = useState<ClientWithCounts[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // 各グループで選択中の統合先ID
  const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>({});

  const fetchData = async () => {
    try {
      const [clientsRes, duplicatesRes] = await Promise.all([
        fetch("/api/clients?withCounts=1"),
        fetch("/api/clients/duplicates"),
      ]);
      const clientsData = await clientsRes.json();
      const duplicatesData = await duplicatesRes.json();

      setClients(clientsData.clients || []);
      const groups: DuplicateGroup[] = duplicatesData.groups || [];
      setDuplicateGroups(groups);

      // デフォルトで各グループの最初のクライアントを統合先に設定
      const defaults: Record<string, string> = {};
      for (const g of groups) {
        if (g.clients.length > 0) {
          defaults[g.normalized] = g.clients[0].id;
        }
      }
      setSelectedTargets(defaults);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMerge = async (group: DuplicateGroup) => {
    const targetId = selectedTargets[group.normalized];
    if (!targetId) return;

    const sourceClients = group.clients.filter((c) => c.id !== targetId);
    const targetName = group.clients.find((c) => c.id === targetId)?.name;
    const sourceNames = sourceClients.map((c) => c.name).join("、");

    if (!confirm(`「${sourceNames}」を「${targetName}」に統合します。この操作は取り消せません。よろしいですか？`)) {
      return;
    }

    setMerging(group.normalized);
    setMessage(null);

    try {
      // 各 source を順次統合
      for (const source of sourceClients) {
        const res = await fetch("/api/clients/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetId, sourceId: source.id }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "統合に失敗しました");
        }
      }

      setMessage({ type: "success", text: `統合が完了しました` });
      await fetchData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "統合に失敗しました";
      setMessage({ type: "error", text: msg });
    } finally {
      setMerging(null);
    }
  };

  const handleDelete = async (client: ClientWithCounts) => {
    if (!confirm(`「${client.name}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    setDeleting(client.id);
    setMessage(null);

    try {
      const res = await fetch("/api/clients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: client.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "削除に失敗しました");
      }

      setMessage({ type: "success", text: `「${client.name}」を削除しました` });
      await fetchData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "削除に失敗しました";
      setMessage({ type: "error", text: msg });
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">得意先管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          得意先の一覧・重複検出・統合
        </p>
      </div>

      {message && (
        <div
          className={cn(
            "border rounded-lg p-4",
            message.type === "success"
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          )}
        >
          <p className={cn("text-sm", message.type === "success" ? "text-green-700" : "text-red-700")}>
            {message.text}
          </p>
        </div>
      )}

      {/* 重複候補アラート */}
      {duplicateGroups.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-amber-800">
              重複の可能性がある得意先が {duplicateGroups.length} グループ見つかりました
            </h2>
          </div>

          {duplicateGroups.map((group) => (
            <div key={group.normalized} className="bg-white border border-amber-100 rounded-lg p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  {group.clients.map((client) => (
                    <label
                      key={client.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                        selectedTargets[group.normalized] === client.id
                          ? "bg-blue-50 border border-blue-200"
                          : "hover:bg-gray-50 border border-transparent"
                      )}
                    >
                      <input
                        type="radio"
                        name={`target-${group.normalized}`}
                        value={client.id}
                        checked={selectedTargets[group.normalized] === client.id}
                        onChange={() =>
                          setSelectedTargets((prev) => ({
                            ...prev,
                            [group.normalized]: client.id,
                          }))
                        }
                        className="text-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-900">{client.name}</span>
                      {selectedTargets[group.normalized] === client.id && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          統合先
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => handleMerge(group)}
                  disabled={merging === group.normalized}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                >
                  {merging === group.normalized ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="w-4 h-4" />
                  )}
                  統合
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 得意先一覧 */}
      {clients.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Building2 className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            得意先がありません
          </h3>
          <p className="text-sm text-gray-500">
            ヘッダーの得意先セレクタから追加できます
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-6 py-3 text-left font-medium text-gray-600">得意先名</th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">フォルダ数</th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">補助科目数</th>
                {canDelete && (
                  <th className="px-6 py-3 text-left font-medium text-gray-600">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const hasRelations = client._count.folders > 0 || client._count.subAccounts > 0;
                return (
                  <tr key={client.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{client.name}</td>
                    <td className="px-6 py-3 text-gray-500">{client._count.folders}</td>
                    <td className="px-6 py-3 text-gray-500">{client._count.subAccounts}</td>
                    {canDelete && (
                      <td className="px-6 py-3">
                        <button
                          onClick={() => handleDelete(client)}
                          disabled={hasRelations || deleting === client.id}
                          title={
                            hasRelations
                              ? "フォルダまたは補助科目が紐づいているため削除できません"
                              : "削除"
                          }
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                            hasRelations
                              ? "text-gray-300 cursor-not-allowed"
                              : "text-red-600 hover:bg-red-50"
                          )}
                        >
                          {deleting === client.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                          削除
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
