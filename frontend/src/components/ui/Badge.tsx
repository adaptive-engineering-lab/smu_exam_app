type Color = "indigo" | "emerald" | "amber" | "red" | "slate" | "sky";

interface Props {
  children: React.ReactNode;
  color?: Color;
}

const colors: Record<Color, string> = {
  indigo:  "bg-indigo-50 text-indigo-700 ring-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber:   "bg-amber-50 text-amber-700 ring-amber-200",
  red:     "bg-red-50 text-red-700 ring-red-200",
  slate:   "bg-slate-100 text-slate-600 ring-slate-200",
  sky:     "bg-sky-50 text-sky-700 ring-sky-200",
};

export function Badge({ children, color = "slate" }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${colors[color]}`}>
      {children}
    </span>
  );
}
