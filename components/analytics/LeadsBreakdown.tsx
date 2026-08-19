"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { LeadAnalytics } from "@/lib/analytics/leads";

const SOURCE_LABEL: Record<string, string> = {
  FORM:      "Enquiry Form",
  WHATSAPP:  "WhatsApp",
  CALL:      "Phone Call",
};

const COLORS = ["#dc2626", "#2563eb", "#059669", "#d97706"];

interface Props {
  leads: LeadAnalytics;
}

export function LeadsBreakdown({ leads }: Props) {
  const pieData = leads.bySource.map((s) => ({
    name: SOURCE_LABEL[s.source] ?? s.source,
    value: s.count,
  }));

  const contactedPct =
    leads.total > 0 ? Math.round((leads.contacted / leads.total) * 100) : 0;

  return (
    <div className="border-border-default bg-background rounded-lg border p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Lead breakdown
      </h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Donut chart */}
        <div>
          {pieData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
              No leads this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #e4e4e7",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stats */}
        <div className="flex flex-col justify-center gap-4">
          <StatRow label="Total leads" value={leads.total} />
          <StatRow label="Contacted" value={leads.contacted} sub={`${contactedPct}% response rate`} positive />
          <StatRow label="Unread" value={leads.unread} warn={leads.unread > 0} />
          <StatRow label="Hot leads" value={leads.hot} positive={leads.hot > 0} />
        </div>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  sub,
  positive,
  warn,
}: {
  label: string;
  value: number;
  sub?: string;
  positive?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-default pb-3 last:border-0 last:pb-0">
      <div>
        <p className="text-sm text-zinc-600">{label}</p>
        {sub && <p className="text-xs text-zinc-400">{sub}</p>}
      </div>
      <span
        className={`text-lg font-bold tabular-nums ${
          positive ? "text-emerald-600" : warn ? "text-amber-600" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
