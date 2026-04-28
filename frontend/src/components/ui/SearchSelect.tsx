import { useEffect, useId, useMemo, useRef, useState } from "react";

// A small typeahead combobox that's a drop-in replacement for the existing
// <Select>. Visually matches it (same border, focus ring, label slot) so
// short item lists look identical to the user; the search payoff kicks in
// once a list grows past ~7 items.
//
// Intentionally tiny (~140 LOC, no new dependency). Covers the basics:
// keyboard nav, click-outside-to-close, ARIA combobox/listbox roles. If
// deeper a11y or virtualised lists become important, swap the
// implementation for Headless UI Combobox without changing the call sites.

export type SearchSelectItem = { value: string; label: string; meta?: string };

type Props = {
  label?: string;
  placeholder?: string;
  items: SearchSelectItem[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
};

export function SearchSelect({
  label, placeholder = "— select —", items, value, onChange, disabled, error, className = "",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => items.find((it) => it.value === value),
    [items, value],
  );

  const filtered = useMemo(() => {
    if (!open || query.trim() === "") return items;
    const q = query.trim().toLowerCase();
    return items.filter((it) =>
      it.label.toLowerCase().includes(q)
      || (it.meta?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query, open]);

  // Click outside closes the popover.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Reset highlight when filter changes.
  useEffect(() => { setHighlight(0); }, [query, open]);

  function pick(item: SearchSelectItem) {
    onChange(item.value);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlight]) pick(filtered[highlight]);
      else if (!open) setOpen(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  }

  // What the input shows: the current query while typing/open, otherwise the
  // selected label (or the placeholder when nothing is picked).
  const display = open ? query : (selected?.label ?? "");

  const labelId = useId();

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={wrapRef}>
      {label && (
        <label htmlFor={`${listboxId}-input`} id={labelId} className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[highlight] ? `${listboxId}-opt-${highlight}` : undefined}
          aria-labelledby={label ? labelId : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={display}
          onFocus={() => { if (!disabled) setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onKeyDown={handleKey}
          className={`w-full rounded-lg border px-3 py-2 pr-8 text-sm text-slate-900 bg-white
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            disabled:bg-slate-50 disabled:text-slate-400
            ${error ? "border-red-400" : "border-slate-300"}`}
        />
        {selected && !disabled && !open && (
          <button
            type="button"
            onMouseDown={handleClear}
            aria-label="Clear selection"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm leading-none px-1"
          >×</button>
        )}
        {open && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">No matches</li>
            ) : (
              filtered.map((it, i) => {
                const isSel = it.value === value;
                const isHi = i === highlight;
                return (
                  <li
                    key={it.value}
                    id={`${listboxId}-opt-${i}`}
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => { e.preventDefault(); pick(it); }}
                    className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2
                      ${isHi ? "bg-indigo-50 text-indigo-900" : "text-slate-700"}
                      ${isSel && !isHi ? "font-semibold" : ""}`}
                  >
                    <span className="truncate">{it.label}</span>
                    {it.meta && <span className="ml-auto text-xs text-slate-400 truncate">{it.meta}</span>}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
