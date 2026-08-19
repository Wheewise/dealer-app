import Link from "next/link";
import { requireDealer } from "@/lib/dealer";
import { BulkUploadForm } from "./BulkUploadForm";

export default async function BulkUploadPage() {
  await requireDealer();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/inventory"
          className="hover:text-foreground text-sm text-zinc-500"
        >
          ← Back to inventory
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Bulk upload</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload up to 100 vehicles at once via CSV.
        </p>
      </div>
      <BulkUploadForm />
    </div>
  );
}
