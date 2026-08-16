"use client";

import { useEffect, useState } from "react";
import type { FolderInfo } from "@/lib/workflow-step";

/**
 * フォルダの状態を1回だけ取る。
 *
 * 工程バーは3秒ごとに取り直しているが、**説明文を選ぶだけなら鮮度は要らない**。
 * パネルから切り出したのは、`GuidePanel` が状態の出し入れに集中できるようにするため。
 *
 * どのフォルダのものかを一緒に持ち、別のフォルダに移ったら使わない
 * ―― 古い工程の説明を出さないため。
 */
export function useFolderStep(folderId: string | null, pathname: string): FolderInfo | null {
  const [loaded, setLoaded] = useState<{ folderId: string; info: FolderInfo } | null>(null);

  useEffect(() => {
    if (!folderId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/folders/${folderId}`);
        if (!res.ok || !alive) return;
        const data = await res.json();
        if (!data.folder || !alive) return;
        setLoaded({
          folderId,
          info: {
            handoffStatus: data.folder.handoffStatus || null,
            doubleCheckStatus: data.folder.doubleCheckStatus || null,
            needsDoubleCheck: data.folder.needsDoubleCheck || false,
            taxReviewStatus: data.folder.taxReviewStatus || null,
            documents: (data.folder.documents || []).map((d: { status: string }) => ({
              status: d.status,
            })),
          },
        });
      } catch {
        // 取れなければ説明が出ないだけ。作業は止めない
      }
    })();
    return () => {
      alive = false;
    };
  }, [folderId, pathname]);

  return loaded && loaded.folderId === folderId ? loaded.info : null;
}
