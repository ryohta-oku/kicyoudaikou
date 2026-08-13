/**
 * アプリ設定（AppSettingテーブル）の読み書き。
 *
 * OCRリクエストごとにDBを引くため、短いTTLのプロセス内キャッシュを噛ませる。
 * 本番は Turso（ネットワーク越し）になり得るのでキャッシュは必須。
 * PM2 は instances: 1 のため単一プロセスで整合する。
 *
 * getSetting は決して throw しない。DB障害時に null を返してフォールバックさせ、
 * 設定が読めないだけでOCRが止まる事態を避ける。
 */

import { prisma } from "@/lib/prisma";

const TTL_MS = 30_000;

interface SettingsCache {
  values: Map<string, string>;
  expiresAt: number;
}

const globalForSettings = globalThis as unknown as {
  settingsCache: SettingsCache | undefined;
};

function freshCache(): SettingsCache {
  return { values: new Map(), expiresAt: 0 };
}

async function loadAll(): Promise<SettingsCache> {
  const cache = globalForSettings.settingsCache;
  if (cache && cache.expiresAt > Date.now()) return cache;

  try {
    const rows = await prisma.appSetting.findMany({
      select: { key: true, value: true },
    });
    const next: SettingsCache = {
      values: new Map(rows.map((r) => [r.key, r.value])),
      expiresAt: Date.now() + TTL_MS,
    };
    globalForSettings.settingsCache = next;
    return next;
  } catch (error) {
    console.error("設定の読み込みに失敗しました:", error);
    // 期限切れでも古い値があればそれを使う。無ければ空。
    return cache ?? freshCache();
  }
}

export async function getSetting(key: string): Promise<string | null> {
  const cache = await loadAll();
  const value = cache.values.get(key);
  return value && value.length > 0 ? value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  invalidateSettings();
}

export function invalidateSettings(): void {
  globalForSettings.settingsCache = undefined;
}

export const SETTING_KEYS = {
  ocrModel: "ai.ocrModel",
  classifyModel: "ai.classifyModel",
} as const;
