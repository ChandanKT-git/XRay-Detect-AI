import { cn } from "@/lib/utils";

const STYLES = {
  processing: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25",
  error: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/25",
};

const SEVERITY = {
  normal: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25",
  low: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/25",
  moderate: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25",
  high: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/25",
  critical: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/25",
};

export function StatusBadge({ status, className }) {
  const s = (status || "").toLowerCase();
  const style = STYLES[s] || STYLES.processing;
  return (
    <span
      data-testid={`status-${s}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider",
        style,
        className,
      )}
    >
      {s === "processing" && (
        <span className="w-1.5 h-1.5 rounded-full bg-current pulse-dot" />
      )}
      {s === "completed" && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {s === "error" && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {s}
    </span>
  );
}

export function SeverityBadge({ severity, className }) {
  const s = (severity || "normal").toLowerCase();
  const style = SEVERITY[s] || SEVERITY.moderate;
  return (
    <span
      data-testid={`severity-${s}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        style,
        className,
      )}
    >
      {s}
    </span>
  );
}
