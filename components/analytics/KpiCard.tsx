import type { ChangeMetric } from "@/lib/analytics/types";

interface KpiCardProps {
  label: string;
  value: string | number;
  metric?: ChangeMetric;
  suffix?: string;
  description?: string;
}

export function KpiCard({ label, value, metric, suffix = "", description }: KpiCardProps) {
  const up   = metric && metric.pct > 0;
  const down = metric && metric.pct < 0;
  const flat = metric && metric.pct === 0;

  return (
    <div className="border-border-default bg-background rounded-lg border p-5">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">
        {value}{suffix}
      </p>
      {metric && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          {up && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2L10 7H2L6 2Z" fill="currentColor" />
              </svg>
              +{metric.pct}%
            </span>
          )}
          {down && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-red-500">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 10L2 5H10L6 10Z" fill="currentColor" />
              </svg>
              {metric.pct}%
            </span>
          )}
          {flat && <span className="text-zinc-400">No change</span>}
          {metric.prev > 0 || metric.value > 0 ? (
            <span className="text-zinc-400">vs prev. period</span>
          ) : null}
        </div>
      )}
      {description && <p className="mt-1 text-xs text-zinc-400">{description}</p>}
    </div>
  );
}
