import { getCrmClients, checkCrmConnection } from "@/lib/crm";
import {
  UserSearch,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Users,
  UserPlus,
  UserCheck,
  UserX,
} from "lucide-react";

export const metadata = {
  title: "顧客管理 | 記帳代行ツール",
};

const CLIENT_HUB_URL = process.env.CLIENT_HUB_URL || "http://localhost:3010";

const statusConfig: Record<string, { label: string; className: string }> = {
  prospect: {
    label: "見込み客",
    className: "bg-purple-100 text-purple-700",
  },
  active: {
    label: "利用中",
    className: "bg-green-100 text-green-700",
  },
  inactive: {
    label: "利用終了",
    className: "bg-gray-100 text-gray-600",
  },
};

export default async function CrmPage() {
  const connection = await checkCrmConnection();

  let clients: Awaited<ReturnType<typeof getCrmClients>>["clients"] = [];
  let total = 0;
  let stats = { prospect: 0, active: 0, inactive: 0 };

  if (connection.connected) {
    try {
      const data = await getCrmClients();
      clients = data.clients;
      total = data.total;
      stats = {
        prospect: clients.filter((c) => c.status === "prospect").length,
        active: clients.filter((c) => c.status === "active").length,
        inactive: clients.filter((c) => c.status === "inactive").length,
      };
    } catch {
      // エラー時はデフォルト値のまま
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">顧客管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            Client Hub と連携した顧客情報の一元管理
          </p>
        </div>
        <a
          href={`${CLIENT_HUB_URL}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <ExternalLink size={14} />
          Client Hub を開く
        </a>
      </div>

      {/* Connection Status */}
      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${
          connection.connected
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        {connection.connected ? (
          <>
            <CheckCircle2 size={20} className="text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-900">
                ✅ Client Hub 接続中
              </p>
              <p className="text-xs text-gray-500">
                {connection.url} — {total}件の顧客データ
              </p>
            </div>
          </>
        ) : (
          <>
            <XCircle size={20} className="text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-900">
                ❌ Client Hub 未接続
              </p>
              <p className="text-xs text-gray-500">
                {connection.url} に接続できません。Client Hub
                が起動しているか確認してください。
              </p>
            </div>
          </>
        )}
      </div>

      {connection.connected && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              {
                label: "全顧客数",
                value: total,
                icon: Users,
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                label: "見込み客",
                value: stats.prospect,
                icon: UserPlus,
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
              {
                label: "利用中",
                value: stats.active,
                icon: UserCheck,
                color: "text-green-600",
                bg: "bg-green-50",
              },
              {
                label: "利用終了",
                value: stats.inactive,
                icon: UserX,
                color: "text-gray-500",
                bg: "bg-gray-50",
              },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="rounded-xl bg-white border p-5"
                >
                  <div
                    className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}
                  >
                    <Icon size={20} className={stat.color} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {stat.value}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                </div>
              );
            })}
          </div>

          {/* Client List */}
          <div className="rounded-xl bg-white border overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <UserSearch size={20} className="text-blue-600" />
                顧客一覧
              </h2>
              <a
                href={`${CLIENT_HUB_URL}/clients/new`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                <UserPlus size={12} />
                新規登録
              </a>
            </div>

            {clients.length === 0 ? (
              <div className="p-12 text-center">
                <Users size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-semibold text-gray-700 mb-2">
                  顧客が登録されていません
                </p>
                <p className="text-sm text-gray-500">
                  Client Hub で最初の顧客を登録してください。
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {clients.map((client) => {
                  const status = statusConfig[client.status] ?? {
                    label: client.status,
                    className: "bg-gray-100 text-gray-600",
                  };
                  return (
                    <div
                      key={client.id}
                      className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-gray-600">
                          {client.lastName[0]}
                        </span>
                      </div>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {client.lastName} {client.firstName}
                        </p>
                        {client.lastNameKana && (
                          <p className="text-xs text-gray-500">
                            {client.lastNameKana} {client.firstNameKana}
                          </p>
                        )}
                      </div>

                      {/* Status */}
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>

                      {/* Tags */}
                      <div className="hidden lg:flex flex-wrap gap-1.5 max-w-[200px]">
                        {client.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs"
                          >
                            {tag.tag}
                          </span>
                        ))}
                      </div>

                      {/* Services */}
                      <div className="hidden md:flex flex-wrap gap-1.5">
                        {client.services.map((svc) => (
                          <span
                            key={svc.id}
                            className={`inline-flex px-2 py-0.5 rounded-md text-xs ${
                              svc.service === "kicyoudaikou"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-green-50 text-green-700"
                            }`}
                          >
                            {svc.service}
                          </span>
                        ))}
                      </div>

                      {/* Link to Client Hub */}
                      <a
                        href={`${CLIENT_HUB_URL}/clients/${client.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
