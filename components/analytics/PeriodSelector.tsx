import Link from "next/link";

const PERIODS = [
  { label: "7d",   value: 7 },
  { label: "30d",  value: 30 },
  { label: "90d",  value: 90 },
  { label: "1yr",  value: 365 },
];

export function PeriodSelector({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border-default bg-background p-1 w-fit">
      {PERIODS.map((p) => (
        <Link
          key={p.value}
          href={`/dashboard/analytics?days=${p.value}`}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            current === p.value
              ? "bg-brand-red text-white"
              : "text-zinc-500 hover:bg-surface-muted hover:text-foreground"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
