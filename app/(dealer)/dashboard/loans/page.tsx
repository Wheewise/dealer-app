import { getDealerLoanApplications } from "@/lib/actions/finance";
import { formatINR } from "@/lib/format";

type Application = Awaited<ReturnType<typeof getDealerLoanApplications>>[number];

export default async function DealerLoansPage() {
  const applications = await getDealerLoanApplications();

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: "bg-yellow-100 text-yellow-800",
      IN_REVIEW: "bg-blue-100 text-blue-800",
      APPROVED: "bg-green-100 text-green-800",
      REJECTED: "bg-red-100 text-red-800",
      DISBURSED: "bg-emerald-100 text-emerald-800",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-zinc-100 text-zinc-700"}`}
      >
        {status.replace("_", " ")}
      </span>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Loan Applications</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Applications submitted by buyers for your listings.
      </p>

      {applications.length === 0 ? (
        <div className="border-border-default bg-background mt-6 rounded-lg border p-12 text-center">
          <p className="text-sm text-zinc-500">No loan applications yet.</p>
          <p className="mt-1 text-xs text-zinc-400">
            When buyers apply for financing on your listings, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="border-border-default bg-background mt-6 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className="px-4 py-3 text-left font-semibold">Vehicle</th>
                <th className="px-4 py-3 text-left font-semibold">Applicant</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-right font-semibold">EMI</th>
                <th className="px-4 py-3 text-right font-semibold">Tenure</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {applications.map((app: Application) => (
                <tr key={app.id}>
                  <td className="px-4 py-3 font-medium">
                    {app.listing.year} {app.listing.make} {app.listing.model}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{app.buyer.name || app.buyer.email}</div>
                    {app.buyer.phone ? (
                      <div className="text-xs text-zinc-500">{app.buyer.phone}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatINR(Number(app.amount))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatINR(Number(app.monthlyEmi))}
                  </td>
                  <td className="px-4 py-3 text-right">{app.tenureMonths} mo</td>
                  <td className="px-4 py-3 text-center">{statusBadge(app.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
