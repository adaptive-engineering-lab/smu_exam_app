import { useCallback, useEffect, useRef } from "react";
import { bulkSaveAnswers } from "../api/attempts";
import type { AnswerPayload } from "../api/types";

const INTERVAL_MS = 4000;

export function useAutosave(attemptId: string, getAnswers: () => AnswerPayload[]) {
  const dirtyRef = useRef(false);
  const onlineRef = useRef(navigator.onLine);
  const pendingRef = useRef<AnswerPayload[]>([]);

  // Mark dirty on every answer change (called by ExamPlayerPage)
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // Flush to server
  const flush = useCallback(async () => {
    if (!onlineRef.current) return;
    const answers = getAnswers();
    if (!answers.length) return;
    try {
      await bulkSaveAnswers(attemptId, answers);
      dirtyRef.current = false;
    } catch {
      // Stay dirty, retry next interval
    }
  }, [attemptId, getAnswers]);

  // Interval flush
  useEffect(() => {
    const id = setInterval(() => {
      if (dirtyRef.current) flush();
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Online/offline tracking
  useEffect(() => {
    const setOnline = () => { onlineRef.current = true; flush(); };
    const setOffline = () => { onlineRef.current = false; };
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, [flush]);

  // Flush on unmount
  useEffect(() => {
    return () => { if (dirtyRef.current) flush(); };
  }, [flush]);

  return { markDirty, flushNow: flush };
}
