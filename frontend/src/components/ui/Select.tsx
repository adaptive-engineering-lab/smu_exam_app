import type { SelectHTMLAttributes } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  placeholder?: string;
  error?: string;
}

export function Select({ label, placeholder, error, id, children, className = "", ...props }: Props) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 bg-white
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
          disabled:bg-slate-50 disabled:text-slate-400
          ${error ? "border-red-400" : "border-slate-300"}
          ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
