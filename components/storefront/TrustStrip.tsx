import { formatNumber } from "@/lib/format";

type Stat = {
  label: string;
  value: string;
  hint?: string;
};

type Props = {
  vehiclesInStock: number;
  soldToDate: number;
  avgInspectionScore: number | null;
  gstVerified: boolean;
  yearsOnPlatform: number;
};

export function TrustStrip({
  vehiclesInStock,
  soldToDate,
  avgInspectionScore,
  gstVerified,
  yearsOnPlatform,
}: Props) {
  const stats: Stat[] = [
    {
      label: "In stock",
      value: formatNumber(vehiclesInStock),
      hint: "vehicles available",
    },
    { label: "Sold to date", value: formatNumber(soldToDate), hint: "via Wheewise" },
    {
      label: "Avg inspection",
      value: avgInspectionScore != null ? `${Math.round(avgInspectionScore)}%` : "—",
      hint: avgInspectionScore != null ? "across listings" : "no inspections yet",
    },
    {
      label: "Verification",
      value: gstVerified ? "GST verified" : "Pending",
      hint: gstVerified ? "by Wheewise" : "verification in progress",
    },
    {
      label: "On Wheewise",
      value: yearsOnPlatform >= 1 ? `${yearsOnPlatform} yr` : "New",
      hint: "trusted dealer",
    },
  ];

  return (
    <section className="border-border-default border-y bg-white/60 backdrop-blur-sm dark:bg-white/[0.02]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden bg-zinc-200/60 sm:grid-cols-5 dark:bg-zinc-800/60">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-background flex flex-col items-start justify-center gap-0.5 px-4 py-4 sm:items-center sm:py-5 sm:text-center"
          >
            <div className="text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">
              {s.label}
            </div>
            <div className="text-lg font-bold tracking-tight sm:text-xl">{s.value}</div>
            {s.hint ? <div className="text-[11px] text-zinc-500">{s.hint}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
