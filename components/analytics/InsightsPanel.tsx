import Link from "next/link";
import type { Insight, Recommendation } from "@/lib/analytics/types";

const INSIGHT_STYLES = {
  positive: "bg-emerald-50 border-emerald-200 text-emerald-900",
  warning:  "bg-amber-50  border-amber-200  text-amber-900",
  neutral:  "bg-blue-50   border-blue-200   text-blue-900",
};

const INSIGHT_DOT = {
  positive: "bg-emerald-500",
  warning:  "bg-amber-500",
  neutral:  "bg-blue-500",
};

const REC_ICON: Record<string, string> = {
  boost:   "↑",
  price:   "₹",
  update:  "↺",
  promote: "+",
};

interface Props {
  insights: Insight[];
  recommendations: Recommendation[];
}

export function InsightsPanel({ insights, recommendations }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          AI Insights
        </h2>
        {insights.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Add inventory and start driving traffic to unlock insights.
          </p>
        ) : (
          <div className="space-y-3">
            {insights.map((ins, i) => (
              <div
                key={i}
                className={`rounded-lg border p-4 ${INSIGHT_STYLES[ins.type]}`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${INSIGHT_DOT[ins.type]}`} />
                  <div>
                    <p className="text-sm font-semibold">{ins.title}</p>
                    <p className="mt-0.5 text-xs opacity-80">{ins.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Recommendations
        </h2>
        {recommendations.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Great work — no action items right now.
          </p>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className="border-border-default bg-background flex items-start gap-3 rounded-lg border p-4"
              >
                <span className="bg-surface-muted flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-sm font-bold text-zinc-600">
                  {REC_ICON[rec.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{rec.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{rec.description}</p>
                </div>
                {rec.listingId && (
                  <Link
                    href={`/dashboard/inventory/${rec.listingId}/edit`}
                    className="flex-shrink-0 text-xs font-semibold text-brand-red hover:underline"
                  >
                    View
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
