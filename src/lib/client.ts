const STORAGE_KEY = "selectedClientId";

export function getSelectedClientId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setSelectedClientId(clientId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, clientId);
}
