const ROLE_STORAGE_KEY = "simulatedRole";
const USER_STORAGE_KEY = "simulatedUser";

/**
 * 管理者が役割を切り替えて動作を確かめるための仮の人格。
 *
 * user_a を2人にしているのは、**ダブルチェックが「作業者と確認者が別人」**
 * という条件になったため。1人だと切り替えて確かめられない。
 *
 * user_b は 2026-09-01 に A型のみへ移行したので新規では使わないが、
 * 過去のフォルダの表示確認のために残す。
 */
export const SIMULATION_PERSONAS = {
  user_b: [
    { id: "sim-b-1", name: "B型Aさん" },
    { id: "sim-b-2", name: "B型Bさん" },
  ],
  user_a: [
    { id: "sim-a-1", name: "利用者Aさん" },
    { id: "sim-a-2", name: "利用者Bさん" },
  ],
} as const;

export function getSimulatedRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ROLE_STORAGE_KEY);
}

export function setSimulatedRole(role: string | null): void {
  if (typeof window === "undefined") return;
  if (role) {
    localStorage.setItem(ROLE_STORAGE_KEY, role);
  } else {
    localStorage.removeItem(ROLE_STORAGE_KEY);
    // ロールクリア時はユーザーもクリア
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

export function getSimulatedUser(): { id: string; name: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSimulatedUser(user: { id: string; name: string } | null): void {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

/**
 * 実際のロールまたはシミュレーション中のロールを返す。
 * シミュレーションは管理者のみ利用可能。
 */
export function getEffectiveRole(actualRole: string): string {
  if (actualRole !== "admin") return actualRole;
  return getSimulatedRole() || actualRole;
}

/**
 * シミュレーション中のユーザーIDを返す。
 * シミュレーション未設定時は実際のIDを返す。
 */
export function getEffectiveUserId(actualRole: string, actualId: string): string {
  if (actualRole !== "admin") return actualId;
  const simUser = getSimulatedUser();
  return simUser?.id || actualId;
}

/**
 * シミュレーション中のユーザー名を返す。
 * シミュレーション未設定時は実際の名前を返す。
 */
export function getEffectiveUserName(actualRole: string, actualName: string): string {
  if (actualRole !== "admin") return actualName;
  const simUser = getSimulatedUser();
  return simUser?.name || actualName;
}
