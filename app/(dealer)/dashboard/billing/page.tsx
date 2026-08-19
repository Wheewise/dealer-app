import { redirect } from "next/navigation";
import { requireDealer } from "@/lib/dealer";
import { getDealerPayouts } from "@/lib/actions/admin";
import { prisma } from "@/lib/db";
import { razorpay } from "@/lib/razorpay";
import { isBillingEnabled } from "@/lib/billing";
import { CheckoutButton } from "./CheckoutButton";

type Payout = Awaited<ReturnType<typeof getDealerPayouts>>[number];

const PLANS = [
  {
    id: "MONTHLY" as const,
    name: "Monthly",
    price: 999,
    cadence: "month",
    features: [
      "Unlimited vehicle listings",
      "Enquiry & lead management",
      "Analytics dashboard",
      "Storefront link",
      "Email support",
    ],
  },
  {
    id: "YEARLY" as const,
    name: "Yearly",
    price: 9999,
    cadence: "year",
    popular: true,
    features: [
      "Everything in Monthly",
      "Save ₹1,989 vs paying monthly",
      "Test drive & RC transfer tools",
      "Priority lead notifications",
      "Priority support",
    ],
  },
];

const FAQS = [
  {
    q: "Can I cancel anytime?",
    a: "Yes — cancel anytime from this page. You keep full access until the end of your current billing period.",
  },
  {
    q: "What happens when my trial or subscription ends?",
    a: "Your dashboard access is paused until you subscribe — you won't be able to manage listings or see new leads. Nothing is deleted; all your listings and data are saved and come back as soon as you upgrade.",
  },
  {
    q: "Do you offer refunds?",
    a: "Yes, a full refund is available within 7 days of your first payment.",
  },
  {
    q: "Can I upgrade or downgrade?",
    a: "Yes, switch between Monthly and Yearly anytime — the difference is prorated against your current period.",
  },
];

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export default async function BillingPage() {
  if (!isBillingEnabled()) redirect("/dashboard");

  const { dealer } = await requireDealer({ allowPaywalled: true });
  const sub = dealer.subscription;
  const blocked = sub?.status === "PAST_DUE" || sub?.status === "CANCELLED";
  // Online checkout needs a registered Razorpay business account, which
  // isn't set up yet — falls back to a manual, human-assisted upgrade path
  // until real keys are configured (see .env.example).
  const billingConfigured = Boolean(razorpay);

  const isTrialing = sub?.status === "TRIALING";
  const daysLeft = isTrialing ? daysUntil(sub.currentPeriodEnd) : null;
  // Dealers get a 14-day free trial at signup (see lib/actions/auth.ts) —
  // used as the progress-bar denominator so it reflects the real offer.
  const TRIAL_LENGTH_DAYS = 14;

  const [payouts, payments] = await Promise.all([
    getDealerPayouts(dealer.id),
    prisma.payment.findMany({
      where: { dealerId: dealer.id, kind: "SUBSCRIPTION" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your Wheewise subscription.</p>
      </div>

      {blocked ? (
        <div className="border-brand-red/40 bg-brand-red/5 text-brand-red rounded-lg border p-4 text-sm">
          Your subscription is {sub?.status === "PAST_DUE" ? "past due" : "cancelled"}.
          Renew to regain full dashboard access — your storefront stays paused until
          payment is complete.
        </div>
      ) : null}

      {isTrialing && daysLeft !== null && daysLeft > 0 ? (
        <div className="rounded-2xl border border-amber-600/30 bg-amber-600/10 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-amber-700">Free Trial Active</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {daysLeft} day{daysLeft === 1 ? "" : "s"} remaining — upgrade before your
                trial ends
              </p>
            </div>
            <div className="text-4xl font-black text-amber-600">{daysLeft}d</div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-amber-950/10">
            <div
              className="h-2 rounded-full bg-amber-500 transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, (daysLeft / TRIAL_LENGTH_DAYS) * 100))}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {isTrialing && daysLeft !== null && daysLeft <= 0 ? (
        <div className="rounded-2xl border border-red-600/30 bg-red-600/10 p-6">
          <h2 className="text-lg font-bold text-red-600">Trial Expired</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Upgrade now to continue listing vehicles.
          </p>
        </div>
      ) : null}

      <section className="border-border-default bg-background rounded-lg border p-6">
        <div className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Current plan
        </div>
        <div className="mt-1 text-xl font-bold">
          {sub?.plan === "FREE_TRIAL"
            ? "Free trial"
            : sub?.plan === "MONTHLY"
              ? "Monthly"
              : sub?.plan === "YEARLY"
                ? "Yearly"
                : "—"}
        </div>
        {sub ? (
          <div className="mt-1 text-sm text-zinc-500">
            Status: {sub.status}
            {sub.currentPeriodEnd
              ? ` · ${sub.status === "TRIALING" ? "Trial ends" : "Renews"} ${sub.currentPeriodEnd.toLocaleDateString()}`
              : ""}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="text-base font-semibold">Choose a plan</h2>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              id={plan.id === "YEARLY" ? "yearly-plan" : undefined}
              className={`bg-background relative rounded-2xl border-2 p-6 transition-all ${
                plan.popular ? "border-brand-red sm:scale-105" : "border-border-default"
              }`}
            >
              {plan.popular ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-brand-red rounded-full px-4 py-1 text-xs font-bold text-white">
                    BEST VALUE
                  </span>
                </div>
              ) : null}

              <h3 className="mb-1 text-xl font-bold">{plan.name}</h3>
              <div className="mb-4 flex items-baseline gap-1">
                <span className="text-sm text-zinc-500">₹</span>
                <span className="text-4xl font-black">{plan.price.toLocaleString("en-IN")}</span>
                <span className="text-sm text-zinc-500">/{plan.cadence}</span>
              </div>

              <ul className="mb-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-green-600">✓</span>
                    <span className="text-sm text-zinc-500">{f}</span>
                  </li>
                ))}
              </ul>

              {billingConfigured ? (
                <CheckoutButton plan={plan.id} highlight={plan.popular} />
              ) : (
                <button
                  type="button"
                  disabled
                  title="Online checkout isn't set up yet — contact support below to upgrade"
                  className="border-border-default text-foreground mt-6 w-full cursor-not-allowed rounded-md border px-4 py-2 text-sm font-semibold opacity-60"
                >
                  Coming Soon — Contact Support
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {!billingConfigured ? (
        <div className="border-border-default bg-background rounded-2xl border p-6">
          <h3 className="font-bold">Ready to upgrade?</h3>
          <p className="mt-1 mb-4 text-sm text-zinc-500">
            Online checkout isn&apos;t live yet — email our team and we&apos;ll activate
            your subscription manually.
          </p>
          <a
            href="mailto:wheewise@gmail.com?subject=Upgrade%20my%20Wheewise%20dealer%20plan"
            className="bg-surface-muted hover:bg-border-default inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
          >
            ✉️ Email Support
          </a>
        </div>
      ) : null}

      <div className="border-border-default bg-background flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-6">
        <div>
          <h3 className="font-bold">Save with the Yearly plan</h3>
          <p className="mt-1 text-sm text-zinc-500">
            ₹9,999/year works out to ₹833/month — pay yearly and save ₹1,989 versus
            paying monthly.
          </p>
        </div>
        <a
          href="#yearly-plan"
          className="bg-brand-red hover:bg-brand-red-dark rounded-xl px-6 py-3 text-sm font-bold text-white"
        >
          View Yearly Plan
        </a>
      </div>

      <section>
        <h2 className="text-base font-semibold">Payment history</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Payments you&apos;ve made to Wheewise for your subscription.
        </p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No payment history yet.</p>
        ) : (
          <div className="border-border-default bg-background mt-3 overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted border-border-default border-b">
                  <th className="px-4 py-2 text-left font-semibold text-zinc-500">Date</th>
                  <th className="px-4 py-2 text-right font-semibold text-zinc-500">
                    Amount
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-zinc-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border-default divide-y">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">{p.createdAt.toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      ₹{(p.amount / 100).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                          p.status === "SUCCEEDED"
                            ? "bg-green-100 text-green-700"
                            : p.status === "FAILED"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">Payout history</h2>
        <p className="mt-1 text-xs text-zinc-500">Payouts Wheewise has sent to you.</p>
        {payouts.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No payouts yet.</p>
        ) : (
          <div className="border-border-default bg-background mt-3 rounded-lg border">
            {payouts.map((p: Payout) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b px-4 py-3 last:border-0"
              >
                <div>
                  <span className="text-sm font-semibold">
                    ₹{Number(p.amount).toLocaleString("en-IN")}
                  </span>
                  <p className="text-xs text-zinc-500">
                    {new Date(p.createdAt).toLocaleDateString("en-IN")}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                    p.status === "PAID"
                      ? "bg-green-100 text-green-700"
                      : p.status === "REJECTED"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">Frequently asked questions</h2>
        <div className="border-border-default bg-background divide-border-default mt-3 divide-y rounded-lg border">
          {FAQS.map((faq) => (
            <div key={faq.q} className="p-4">
              <p className="text-sm font-semibold">{faq.q}</p>
              <p className="mt-1 text-sm text-zinc-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
