import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// useStickyParam — drop-in replacement for useState<string>("") that
// round-trips through both the URL (?<name>=...) and localStorage. URL wins
// on initial read so a shared link works; localStorage is the fallback for
// returning users with no params. Setting "" clears both, keeping URLs
// tidy when a slot is unselected.
//
// The hook is intentionally generic and unaware of cascading semantics:
// pages own their own reset logic at the call site (e.g. when school
// changes, the page calls setDegree("") + setCourse("") itself).

type Options = {
  /**
   * localStorage key. Defaults to the URL param name, but pages should
   * pass a page-scoped prefix (e.g. "picker.exams.school") so multiple
   * pages don't fight over the same global slot.
   */
  storageKey?: string;
};

export function useStickyParam(
  name: string,
  opts: Options = {},
): [string, (v: string) => void] {
  const storageKey = opts.storageKey ?? name;
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get(name) ?? "";
  const initial = fromUrl !== ""
    ? fromUrl
    : (typeof window !== "undefined" ? localStorage.getItem(storageKey) ?? "" : "");

  const [value, setValueState] = useState<string>(initial);

  // Track URL changes (back/forward, programmatic navigation) so the
  // visible state mirrors history. Only sync down from the URL — never
  // up from state — to avoid a feedback loop with setValue().
  useEffect(() => {
    const next = params.get(name) ?? "";
    if (next !== value) setValueState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, name]);

  const setValue = useCallback((v: string) => {
    setValueState(v);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === "") next.delete(name);
      else next.set(name, v);
      return next;
    }, { replace: true });
    if (typeof window !== "undefined") {
      if (v === "") localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, v);
    }
  }, [name, storageKey, setParams]);

  return [value, setValue];
}
