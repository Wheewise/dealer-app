import Link from "next/link";
import { notFound } from "next/navigation";
import { db, unwrapMaybe } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { updateListing } from "@/lib/actions/listings";
import { ListingForm } from "@/components/listings/ListingForm";
import { ListingActions } from "./ListingActions";
import { BoostButton } from "@/components/listings/BoostButton";

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const { dealer } = await requireDealer();

  // The dealerId filter is the ownership check — without it any dealer could
  // open another's listing by id.
  const row = unwrapMaybe(
    await db
      .from("Listing")
      .select("*, photos:ListingPhoto(url, sortOrder)")
      .eq("id", id)
      .eq("dealerId", dealer.id)
      .maybeSingle(),
    "edit listing",
  );
  if (!row) notFound();

  // PostgREST cannot order an embed per parent row.
  const listing = {
    ...row,
    photos: [...row.photos].sort((a, b) => a.sortOrder - b.sortOrder),
  };

  const action = updateListing.bind(null, listing.id);

  return (
    <div className="space-y-6">
      {created === "1" ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          Vehicle listed successfully!
        </p>
      ) : null}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/inventory"
            className="hover:text-foreground text-sm text-zinc-500"
          >
            ← Back to inventory
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            {listing.year} {listing.make} {listing.model}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {listing.viewCount} views · {listing.enquiryCount} enquiries
          </p>
        </div>
        <ListingActions listingId={listing.id} status={listing.status} />
      </div>

      <div id="boost" className="border-border-default bg-background scroll-mt-6 rounded-lg border p-4">
        <BoostButton
          listingId={listing.id}
          isBoosted={listing.isBoosted}
          boostExpiresAt={listing.boostExpiresAt}
        />
      </div>

      <div className="border-border-default bg-background rounded-lg border p-6">
        <ListingForm
          action={action}
          defaults={{
            vehicleType: listing.vehicleType,
            make: listing.make,
            model: listing.model,
            year: listing.year,
            fuelType: listing.fuelType,
            transmission: listing.transmission,
            odometerKm: listing.odometerKm,
            askingPrice: Number(listing.askingPrice),
            condition: listing.condition,
            testDriveAvailable: listing.testDriveAvailable,
            description: listing.description || undefined,
            city: listing.city,
            photoUrls: listing.photos.map((p) => p.url),
          }}
          submitLabel="Save changes"
          lockIdentity
        />
      </div>
    </div>
  );
}
