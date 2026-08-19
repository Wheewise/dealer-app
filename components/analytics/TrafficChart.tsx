"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { DaySeries } from "@/lib/analytics/types";

interface Props {
  data: DaySeries[];
  days: number;
}

function formatDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  if (days <= 7) return d.toLocaleDateString("en-IN", { weekday: "short" });
  if (days <= 31) return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function hasData(data: DaySeries[]): boolean {
  return data.some((d) => d.views > 0 || d.leads > 0);
}

export function TrafficChart({ data, days }: Props) {
  const empty = !hasData(data);

  const displayData = data.map((d) => ({
    ...d,
    label: formatDate(d.date, days),
  }));

  const step = days <= 7 ? 1 : days <= 31 ? 3 : Math.ceil(days / 12);
  const filtered = displayData.filter((_, i) => i % step === 0 || i === displayData.length - 1);

  return (
    <div className="border-border-default bg-background rounded-lg border p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Traffic overview
      </h2>
      {empty ? (
        <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
          No traffic data for this period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              ticks={filtered.map((d) => d.label)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              formatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
            />
            <Area
              type="monotone"
              dataKey="views"
              stroke="#dc2626"
              strokeWidth={2}
              fill="url(#viewsGrad)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="leads"
              stroke="#2563eb"
              strokeWidth={2}
              fill="url(#leadsGrad)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
