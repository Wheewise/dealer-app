import Link from "next/link";
import { count, db, unwrap } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { Button } from "@/components/ui/Field";
import { siteUrl } from "@/lib/site-url";
import { isBillingEnabled } from "@/lib/billing";
import { CopyStoreLink } from "@/components/dealer/CopyStoreLink";

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export default async function DashboardPage() {
  const { dealer } = await requireDealer();

  const [activeListings, totalLeads, counters, recentLeads] = await Promise.all([
    count(
      db
        .from("Listing")
        .select("id", { count: "exact", head: true })
        .eq("dealerId", dealer.id)
        .eq("status", "ACTIVE"),
    ),
    count(
      db
        .from("Enquiry")
        .select("id", { count: "exact", head: true })
        .eq("dealerId", dealer.id),
    ),
    // SUM has no PostgREST equivalent. The two counters are per-listing and
    // this dealer's inventory is small, so they are added here.
    db
      .from("Listing")
      .select("viewCount, enquiryCount")
      .eq("dealerId", dealer.id)
      .then((r) => unwrap(r, "dashboard: counters")),
    db
      .from("Enquiry")
      .select("*, listing:Listing(make, model, year)")
      .eq("dealerId", dealer.id)
      .order("priority", { ascending: false })
      .order("createdAt", { ascending: false })
      .limit(5)
      .then((r) => unwrap(r, "dashboard: recent leads")),
  ]);

  const totalViews = counters.reduce((s, l) => s + l.viewCount, 0);
  const totalEnquiries = counters.reduce((s, l) => s + l.enquiryCount, 0);
  const ratio =
    totalViews > 0 ? `${((totalEnquiries / totalViews) * 100).toFixed(1)}%` : "—";

  const sub = dealer.subscription;
  const periodEnd = sub ? new Date(sub.currentPeriodEnd) : null;
  const subLabel = sub
    ? sub.status === "TRIALING"
      ? `Free trial · ends ${periodEnd!.toLocaleDateString()}`
      : `${sub.plan} · ${sub.status}`
    : "No subscription";

  const billingOn = isBillingEnabled();
  const trialDaysLeft =
    sub?.status === "TRIALING" && periodEnd ? daysUntil(periodEnd) : null;
  const showTrialWarning = billingOn && trialDaysLeft !== null && trialDaysLeft <= 7;

  const storeUrl = siteUrl(`/s/${dealer.store?.slug ?? ""}`);
  const waShareLink = `https://wa.me/?text=${encodeURIComponent(`Check out my showroom: ${storeUrl}`)}`;

  return (
    <div className="space-y-8">
      {showTrialWarning ? (
        <Link
          href="/dashboard/billing"
          className="border-brand-red/40 bg-brand-red/5 hover:bg-brand-red/10 block rounded-lg border p-4 text-sm font-medium"
        >
          ⚠️ Trial expires in {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} —
          Upgrade now to keep your listings live
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {dealer.businessName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your showroom link:{" "}
            <Link
              href={`/s/${dealer.store?.slug ?? ""}/showcase`}
              className="text-brand-red font-medium hover:underline"
            >
              /s/{dealer.store?.slug}
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CopyStoreLink url={storeUrl} />
            <a
              href={waShareLink}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              Share on WhatsApp
            </a>
          </div>
        </div>
        <Link href="/dashboard/inventory/new">
          <Button>Add vehicle</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Active listings" value={activeListings} />
        <Kpi label="Total leads" value={totalLeads} />
        <Kpi label="Lead-to-view" value={ratio} />
        {billingOn ? <Kpi label="Subscription" value={subLabel} small /> : null}
      </div>

      <section className="border-border-default bg-background rounded-lg border">
        <div className="border-border-default flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Recent leads</h2>
          <Link
            href="/dashboard/leads"
            className="text-brand-red text-sm font-medium hover:underline"
          >
            View all
          </Link>
        </div>
        {recentLeads.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No leads yet. Share your showroom link to start receiving enquiries.
          </div>
        ) : (
          <ul className="divide-border-default divide-y">
            {recentLeads.map((lead) => {
              const listing = Array.isArray(lead.listing) ? lead.listing[0] : lead.listing;
              return (
                <li key={lead.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-sm font-medium">{lead.buyerName}</div>
                    <div className="text-xs text-zinc-500">
                      {listing?.year} {listing?.make} {listing?.model} · {lead.buyerPhone}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500">{timeAgo(lead.createdAt)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="border-border-default bg-background rounded-lg border border-t-2 border-t-red-600/30 p-4">
      <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {label}
      </div>
      <div
        className={`mt-1 font-bold tracking-tight ${small ? "text-base" : "text-2xl"}`}
      >
        {value}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
