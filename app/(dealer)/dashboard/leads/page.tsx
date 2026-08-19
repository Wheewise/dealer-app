import Link from "next/link";
import { requireDealer } from "@/lib/dealer";
import { getEnquiriesForDealer } from "@/lib/actions/enquiries";
import { LeadActions } from "./LeadActions";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  OPEN: { label: "New", className: "bg-brand-red text-white" },
  REPLIED: { label: "Replied", className: "bg-emerald-100 text-emerald-800" },
  CLOSED: { label: "Closed", className: "bg-zinc-200 text-zinc-600" },
};

export default async function LeadsPage() {
  const { dealer } = await requireDealer();
  const leads = await getEnquiriesForDealer();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {leads.length} enquir{leads.length === 1 ? "y" : "ies"} from buyers, prioritized
          by intent.
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="border-border-default bg-background rounded-lg border border-dashed p-10 text-center">
          <h2 className="text-base font-semibold">No leads yet</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Share your storefront link to start receiving enquiries.
          </p>
        </div>
      ) : (
        <div className="border-border-default bg-background overflow-hidden rounded-lg border">
          <ul className="divide-border-default divide-y">
            {leads.map((lead) => {
              const waNumber = lead.buyerPhone.replace(/[^\d]/g, "");
              const vehicle = `${lead.listing.year} ${lead.listing.make} ${lead.listing.model}`;
              const waMsg = encodeURIComponent(
                `Hi ${lead.buyerName}, this is ${dealer.businessName} regarding the ${vehicle}.`,
              );
              const badge = STATUS_BADGE[lead.status] ?? STATUS_BADGE.OPEN;
              const photo = lead.listing.photos[0]?.url;
              return (
                <li
                  key={lead.id}
                  className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between ${
                    lead.isRead ? "" : "bg-brand-red/5"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    {photo ? (
                      <img
                        src={photo}
                        alt={vehicle}
                        className="h-14 w-20 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="bg-surface-muted h-14 w-20 shrink-0 rounded-md" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{lead.buyerName}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {lead.priority >= 50 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 uppercase">
                            Hot
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm text-zinc-600">
                        <Link
                          href={`/dashboard/inventory/${lead.listing.id}/edit`}
                          className="font-medium hover:underline"
                        >
                          {vehicle}
                        </Link>
                        {" · "}
                        {lead.buyerPhone}
                        {lead.buyerEmail ? ` · ${lead.buyerEmail}` : ""}
                      </div>
                      {lead.message ? (
                        <p className="text-foreground mt-2 text-sm">“{lead.message}”</p>
                      ) : null}
                      <div className="mt-2 text-xs text-zinc-500">
                        {lead.createdAt.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {lead.buyerId ? (
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="bg-brand-red hover:bg-brand-red-dark rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        View conversation
                      </Link>
                    ) : null}
                    <a
                      href={`https://wa.me/${waNumber}?text=${waMsg}`}
                      target="_blank"
                      rel="noopener"
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      WhatsApp
                    </a>
                    <a
                      href={`tel:${lead.buyerPhone}`}
                      className="border-border-default bg-background text-foreground hover:bg-surface-muted rounded-md border px-3 py-1.5 text-xs font-semibold"
                    >
                      Call
                    </a>
                    <LeadActions
                      leadId={lead.id}
                      isRead={lead.isRead}
                      isContacted={lead.isContacted}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
