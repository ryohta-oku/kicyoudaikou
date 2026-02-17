const STORAGE_KEY = "simulatedRole";

export function getSimulatedRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setSimulatedRole(role: string | null): void {
  if (typeof window === "undefined") return;
  if (role) {
    localStorage.setItem(STORAGE_KEY, role);
  } else {
    localStorage.removeItem(STORAGE_KEY);
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
