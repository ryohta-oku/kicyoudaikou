/**
 * Client Hub CRM API クライアント
 *
 * 全プロジェクト共通: このファイルをそのままコピーして使える。
 * 必要な環境変数:
 *   CLIENT_HUB_URL — client-hub の URL（例: http://localhost:3010）
 *   CRM_API_KEY    — 内部API認証キー
 */

const BASE_URL = process.env.CLIENT_HUB_URL || "http://localhost:3010";
const API_KEY = process.env.CRM_API_KEY || "";

export interface CrmClient {
  id: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  email: string | null;
  phone: string | null;
  postalCode: string | null;
  address: string | null;
  birthDate: string | null;
  gender: string | null;
  status: string;
  notes: string | null;
  tags: { id: string; tag: string }[];
  services: { id: string; service: string; status: string }[];
  customFields: { id: string; key: string; value: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmListResponse {
  clients: CrmClient[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * client-hub API を呼び出す汎用関数
 */
export async function crmFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...options?.headers,
    },
    cache: "no-store", // 常に最新データを取得
  });

  if (!res.ok) {
    throw new Error(`CRM API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * 顧客一覧を取得
 */
export async function getCrmClients(params?: {
  q?: string;
  status?: string;
  tag?: string;
  service?: string;
  limit?: number;
}): Promise<CrmListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set("q", params.q);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.tag) searchParams.set("tag", params.tag);
  if (params?.service) searchParams.set("service", params.service);
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  return crmFetch<CrmListResponse>(`/api/clients${query ? `?${query}` : ""}`);
}

/**
 * 顧客詳細を取得
 */
export async function getCrmClient(id: string): Promise<CrmClient> {
  return crmFetch<CrmClient>(`/api/clients/${id}`);
}

/**
 * client-hub との接続状態を確認
 */
export async function checkCrmConnection(): Promise<{
  connected: boolean;
  clientCount: number;
  url: string;
}> {
  try {
    const data = await getCrmClients({ limit: 0 });
    return { connected: true, clientCount: data.total, url: BASE_URL };
  } catch {
    return { connected: false, clientCount: 0, url: BASE_URL };
  }
}
