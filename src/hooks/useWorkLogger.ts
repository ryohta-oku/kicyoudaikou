"use client";

import { useEffect, useRef, useCallback } from "react";

interface WorkLoggerOptions {
  sessionId?: string | null;
  userId?: string;
  userName?: string;
  userRole?: string;
  folderId?: string;
  folderName?: string;
}

const MIN_DURATION_SEC = 5; // 最低記録時間: 5秒未満は無視

export function useWorkLogger(
  workType: string,
  enabled: boolean,
  options: WorkLoggerOptions = {}
) {
  const startTimeRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);
  const sentRef = useRef<boolean>(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const sendLog = useCallback(() => {
    if (sentRef.current) return;

    // 現在表示中なら蓄積に加算
    if (isVisibleRef.current && startTimeRef.current > 0) {
      accumulatedRef.current += (Date.now() - startTimeRef.current) / 1000;
      startTimeRef.current = Date.now();
    }

    const durationSec = Math.round(accumulatedRef.current);
    if (durationSec < MIN_DURATION_SEC) return;

    sentRef.current = true;
    const opts = optionsRef.current;

    const payload = JSON.stringify({
      sessionId: opts.sessionId || null,
      userId: opts.userId || "",
      userName: opts.userName || "",
      userRole: opts.userRole || "",
      folderId: opts.folderId || "",
      folderName: opts.folderName || "",
      action: "work_session",
      workType,
      durationSec,
    });

    // sendBeaconで確実に送信（ページ離脱時でも送信される）
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/worklogs", blob);
    } else {
      fetch("/api/worklogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, [workType]);

  useEffect(() => {
    if (!enabled) return;

    // 計測開始
    startTimeRef.current = Date.now();
    accumulatedRef.current = 0;
    isVisibleRef.current = true;
    sentRef.current = false;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // タブ非表示 → 蓄積に加算して一時停止
        if (startTimeRef.current > 0) {
          accumulatedRef.current += (Date.now() - startTimeRef.current) / 1000;
          startTimeRef.current = 0;
        }
        isVisibleRef.current = false;
      } else {
        // タブ表示 → 計測再開
        startTimeRef.current = Date.now();
        isVisibleRef.current = true;
      }
    };

    const handleBeforeUnload = () => {
      sendLog();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // アンマウント時に送信
      sendLog();
    };
  }, [enabled, sendLog]);
}
