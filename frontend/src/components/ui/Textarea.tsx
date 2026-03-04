import type { TextareaHTMLAttributes } from "react";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, id, className = "", ...props }: Props) {
  const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={textareaId} className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none
          ${error ? "border-red-400 bg-red-50" : "border-slate-300 bg-white"}
          ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
