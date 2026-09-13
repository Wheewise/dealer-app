import type { Metadata } from "next";
import { ListingForm } from "./ListingForm";

// Signed-in-only dealer tooling — nothing here is worth a search engine
// indexing.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NewListingPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">Add a vehicle</h1>
      <ListingForm />
    </div>
  );
}
