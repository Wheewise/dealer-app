import { requireDealer } from "@/lib/dealer";
import { StoreForm } from "./StoreForm";

export default async function StorePage() {
  const { dealer } = await requireDealer();
  if (!dealer.store) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Storefront</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Customize your shareable showroom link, branding, and bio.
        </p>
      </div>

      <div className="border-border-default bg-background rounded-lg border p-6">
        <StoreForm
          defaults={{
            slug: dealer.store.slug,
            bio: dealer.store.bio ?? "",
            primaryColor: dealer.store.primaryColor,
            logoUrl: dealer.store.logoUrl ?? "",
            bannerUrl: dealer.store.bannerUrl ?? "",
            gstin: dealer.gstin,
            gstVerified: dealer.gstVerified,
          }}
        />
      </div>
    </div>
  );
}
