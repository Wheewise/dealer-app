import Link from "next/link";
import { requireDealer } from "@/lib/dealer";
import {
  getTransfersForDealer,
  getSoldListingsAwaitingTransfer,
} from "@/lib/actions/rctransfer";
import { formatINR } from "@/lib/format";
import { InitiateTransferButton } from "./InitiateTransferButton";

export const metadata = { title: "RC Transfers – Wheewise Dashboard" };

const STATUS_BADGE: Record<string, string> = {
  INITIATED: "bg-amber-100 text-amber-800",
  DOCS_PENDING: "bg-amber-100 text-amber-800",
  RTO_PENDING: "bg-blue-100 text-blue-800",
  RTO_APPROVED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-zinc-200 text-zinc-600",
};

export default async function DealerTransfersPage() {
  await requireDealer();
  const [transfers, awaitingTransfer] = await Promise.all([
    getTransfersForDealer(),
    getSoldListingsAwaitingTransfer(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">RC Transfers</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Track vehicle ownership transfers after a sale.
        </p>
      </div>

      <section>
        <h2 className="text-base font-semibold">Sold vehicles awaiting transfer</h2>
        {awaitingTransfer.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            All sold vehicles already have a transfer started.
          </p>
        ) : (
          <div className="border-border-default bg-background mt-3 divide-y divide-border-default rounded-lg border">
            {awaitingTransfer.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="text-sm font-medium">
                  {l.year} {l.make} {l.model}
                </span>
                <InitiateTransferButton
                  listingId={l.id}
                  vehicleName={`${l.year} ${l.make} ${l.model}`}
                  defaultSaleAmount={l.askingPrice}
                  candidates={l.candidates}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">Active transfers</h2>
        {transfers.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No RC transfers yet.</p>
        ) : (
          <div className="border-border-default bg-background mt-3 divide-y divide-border-default rounded-lg border">
            {transfers.map((t) => (
              <Link
                key={t.id}
                href={`/rc-transfer/${t.id}`}
                className="hover:bg-surface-muted flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <span className="text-sm font-medium">{t.vehicleName}</span>
                  <div className="text-xs text-zinc-500">
                    {t.buyer.name ?? "Buyer"} {t.buyer.phone ? `· ${t.buyer.phone}` : ""} ·{" "}
                    {formatINR(Number(t.saleAmount))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">Step {t.currentStep} of 5</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[t.status] ?? "bg-zinc-100 text-zinc-600"}`}
                  >
                    {t.status.replace(/_/g, " ")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
