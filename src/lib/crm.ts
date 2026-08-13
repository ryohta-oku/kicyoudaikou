/**
 * Client Hub CRM API クライアント
 *
 * 全プロジェクト共通: このファイルをそのままコピーして使える。
 * **記帳代行とここぼしで内容が1バイトも違わないこと**を前提にしているので、
 * アプリ名を埋め込まない（識別子は環境変数で渡す）。
 *
 * 必要な環境変数:
 *   CLIENT_HUB_URL   — client-hub の URL（例: http://localhost:3010）
 *   CRM_APP_KEY      — このアプリの識別子（例: kicyoudaikou）
 *   CRM_CLIENTS_KEY  — このアプリ専用の閲覧キー（hub 側の CLIENTS_KEY_<SERVICE>）
 *   CRM_API_KEY      — 旧来の共有キー。上の2つが揃っていないときのフォールバック
 */

const BASE_URL = process.env.CLIENT_HUB_URL || "http://localhost:3010";
const API_KEY = process.env.CRM_API_KEY || "";

/**
 * アプリ別の閲覧口を使うか。
 *
 * 共有キー `CRM_API_KEY` は全アプリが同じ値を持つので、それで台帳を読むと
 * **どのアプリからも全件見える**。台帳が就労支援の利用者を持つようになってから
 * これは許容できなくなった。専用キーで入れば hub 側が範囲を絞って返す。
 *
 * 2つ揃ったときだけ切り替える ―― 片方だけ設定した状態で 403 が返り続けるより、
 * 従来の経路で動いたまま「まだ移行していない」ことが分かるほうが安全。
 * hub 側で `CLIENTS_LEGACY_KEY_READ="off"` にすると旧経路が閉じるので、
 * 移行漏れはそこで「未接続」表示として必ず露見する。
 */
const APP_KEY = process.env.CRM_APP_KEY || "";
const CLIENTS_KEY = process.env.CRM_CLIENTS_KEY || "";
const SCOPED = Boolean(APP_KEY && CLIENTS_KEY);

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
  status: string;
  tags: { id: string; tag: string }[];
  services: { id: string; service: string; status: string }[];
  createdAt: string;
  updatedAt: string;
  /**
   * ここから下はアプリ別の口では**返らない**。
   * 就労支援の利用者の生年月日や支援上のメモが他アプリに流れる経路を作らないため、
   * hub 側が落としている。読むコードを書かないこと
   */
  birthDate?: string | null;
  gender?: string | null;
  notes?: string | null;
  customFields?: { id: string; key: string; value: string }[];
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
      "x-api-key": SCOPED ? CLIENTS_KEY : API_KEY,
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
  if (SCOPED) searchParams.set("app", APP_KEY);
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
  const query = SCOPED ? `?app=${encodeURIComponent(APP_KEY)}` : "";
  return crmFetch<CrmClient>(`/api/clients/${id}${query}`);
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
