import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// useStickyParam — drop-in replacement for useState<string>("") that
// round-trips through both the URL (?<name>=...) and localStorage.
//
// Initial value: URL wins, then localStorage. On set: writes both. On
// browser back/forward: down-syncs from the URL — but only when the URL
// provides a non-null value, so plain navigation back to a page (URL
// has no params, but localStorage does) preserves the restored state.
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

  // Initial value: prefer URL, then localStorage, then "".
  const [value, setValueState] = useState<string>(() => {
    const fromUrl = params.get(name);
    if (fromUrl !== null && fromUrl !== "") return fromUrl;
    if (typeof window !== "undefined") return localStorage.getItem(storageKey) ?? "";
    return "";
  });

  // Down-sync only on real URL changes (back/forward, deep links). If the
  // URL has no key at all (params.get returns null), keep whatever the
  // hook initialised to from localStorage — otherwise navigating back to
  // a page with no query string would clobber the restored selection.
  useEffect(() => {
    const next = params.get(name);
    if (next !== null && next !== value) setValueState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, name]);

  const setValue = useCallback((v: string) => {
    setValueState(v);
    // Build the next URLSearchParams from the *live* URL rather than the
    // captured `params` snapshot — three rapid setValue calls (cascade
    // reset on /lecturer/exams) need to compose, not clobber each other.
    const next = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    if (v === "") next.delete(name);
    else next.set(name, v);
    setParams(next, { replace: true });
    if (typeof window !== "undefined") {
      if (v === "") localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, v);
    }
  }, [name, storageKey, setParams]);

  return [value, setValue];
}
