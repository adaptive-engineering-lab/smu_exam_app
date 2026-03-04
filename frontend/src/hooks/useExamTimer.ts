import { useEffect, useRef, useState } from "react";

export function useExamTimer(
  attemptId: string,
  startedAt: string,
  durationMinutes: number,
  onExpire: () => void,
) {
  const storageKey = `timer_${attemptId}`;

  function calcRemaining(): number {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      const parsed = parseInt(cached, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    return Math.max(0, durationMinutes * 60 - elapsed);
  }

  const [remaining, setRemaining] = useState<number>(calcRemaining);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (remaining <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
      return;
    }

    const id = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        localStorage.setItem(storageKey, String(next));
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(id);
          onExpire();
        }
        return Math.max(0, next);
      });
    }, 1000);

    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function fmt(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return { remaining, formatted: fmt(remaining), isWarning: remaining <= 300 };
}
