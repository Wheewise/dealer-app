/**
 * Demo data for local development.
 *
 * Runs against Supabase with the service role, so it is exempt from RLS —
 * which is what lets it write a dealer's inventory without a dealer session.
 * Never point it at production.
 *
 *   npm run db:seed
 */

import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY first.",
  );
  process.exit(1);
}

const db = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * supabase-js reports failures in the payload; a seed should stop at the first.
 *
 * The distributive conditional is deliberate — inferring a plain `T` across
 * supabase-js's `{data, error}` union collapses it to `never`. See `unwrap` in
 * lib/db.ts for the same problem and the same fix.
 */
type DataOf<R> = R extends { data: infer D } ? Exclude<D, null> : never;

function ok<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string,
): DataOf<R> {
  if (result.error) {
    console.error(`${what}: ${result.error.message}`);
    process.exit(1);
  }
  return result.data as DataOf<R>;
}

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);

  const user = ok(
    await db
      .from("User")
      .upsert(
        {
          email: "demo@wheewise.in",
          name: "Rohit Sharma",
          passwordHash,
          role: "DEALER",
        },
        { onConflict: "email" },
      )
      .select("id")
      .single(),
    "seed user",
  );

  const dealer = ok(
    await db
      .from("Dealer")
      .upsert(
        {
          userId: user.id,
          businessName: "Sharma Auto, Indore",
          city: "Indore",
          phone: "+919812345678",
          whatsapp: "+919812345678",
        },
        { onConflict: "userId" },
      )
      .select("id")
      .single(),
    "seed dealer",
  );

  ok(
    await db
      .from("Store")
      .upsert(
        {
          dealerId: dealer.id,
          slug: "sharma-auto-indore",
          bio: "Family-run pre-owned car and bike showroom serving Indore for 12 years. Every vehicle is RC verified and warranted for 6 months.",
          primaryColor: "#DC2626",
        },
        { onConflict: "dealerId" },
      )
      .select("id")
      .single(),
    "seed store",
  );

  ok(
    await db
      .from("Subscription")
      .upsert(
        {
          dealerId: dealer.id,
          plan: "FREE_TRIAL",
          status: "TRIALING",
          currentPeriodEnd: trialEnds.toISOString(),
        },
        { onConflict: "dealerId" },
      )
      .select("id")
      .single(),
    "seed subscription",
  );

  const listings = [
    {
      vehicleType: "CAR" as const,
      make: "Maruti Suzuki",
      model: "Swift VXi",
      year: 2021,
      fuelType: "PETROL" as const,
      transmission: "MANUAL" as const,
      odometerKm: 28500,
      askingPrice: 625000,
      city: "Indore",
      description:
        "Single-owner Swift VXi in mint condition. Full service history at Maruti, all 4 tyres at 80%, no accidents. Music system, reverse parking sensors, fog lamps.",
    },
    {
      vehicleType: "CAR" as const,
      make: "Hyundai",
      model: "Creta SX",
      year: 2022,
      fuelType: "DIESEL" as const,
      transmission: "AUTOMATIC" as const,
      odometerKm: 19200,
      askingPrice: 1485000,
      city: "Indore",
      description:
        "Top-spec Creta SX(O) diesel automatic. Sunroof, leather seats, 360 camera, ventilated front seats. Under manufacturer warranty until 2027.",
    },
    {
      vehicleType: "CAR" as const,
      make: "Honda",
      model: "City ZX",
      year: 2019,
      fuelType: "PETROL" as const,
      transmission: "AUTOMATIC" as const,
      odometerKm: 42100,
      askingPrice: 895000,
      city: "Indore",
      description:
        "Honda City ZX CVT, second owner, accident-free. New battery installed last month. All paint original.",
    },
    {
      vehicleType: "CAR" as const,
      make: "Tata",
      model: "Nexon EV Max",
      year: 2023,
      fuelType: "ELECTRIC" as const,
      transmission: "AUTOMATIC" as const,
      odometerKm: 11800,
      askingPrice: 1625000,
      city: "Indore",
      description:
        "Tata Nexon EV Max XZ+ Lux. 437 km claimed range. Battery health certified at 96%. Single owner, garage parked.",
    },
    {
      vehicleType: "BIKE" as const,
      make: "Royal Enfield",
      model: "Classic 350",
      year: 2022,
      fuelType: "PETROL" as const,
      odometerKm: 8400,
      askingPrice: 175000,
      city: "Indore",
      description:
        "Classic 350 Halcyon Black with all stock accessories. Original service records, single owner. Comes with Royal Enfield saddle bags.",
    },
    {
      vehicleType: "BIKE" as const,
      make: "KTM",
      model: "Duke 390",
      year: 2021,
      fuelType: "PETROL" as const,
      odometerKm: 14500,
      askingPrice: 245000,
      city: "Indore",
      description:
        "KTM Duke 390 in factory orange. Akrapovič-style exhaust, frame sliders, tank pad. Tyres replaced 2,000 km ago.",
    },
  ];

  const seedPhotoUrls: Record<string, string[]> = {
    "Swift VXi": ["https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200"],
    "Creta SX": ["https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200"],
    "City ZX": ["https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200"],
    "Nexon EV Max": ["https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=1200"],
    "Classic 350": ["https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=1200"],
    "Duke 390": ["https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=1200"],
  };

  // Photos cascade with their listing, so this clears both.
  const { error: clearError } = await db.from("Listing").delete().eq("dealerId", dealer.id);
  if (clearError) {
    console.error(`clear listings: ${clearError.message}`);
    process.exit(1);
  }

  const created = ok(
    await db
      .from("Listing")
      .insert(
        listings.map((l) => ({
          ...l,
          dealerId: dealer.id,
          viewCount: Math.floor(Math.random() * 200) + 20,
        })),
      )
      .select("id, model"),
    "seed listings",
  );

  const photos = created.flatMap((l) =>
    (seedPhotoUrls[l.model] ?? []).map((url, i) => ({
      listingId: l.id,
      url,
      sortOrder: i,
    })),
  );
  if (photos.length > 0) {
    ok(await db.from("ListingPhoto").insert(photos).select("id"), "seed photos");
  }

  console.log(
    "Seeded demo dealer (demo@wheewise.in / demo1234), storefront /s/sharma-auto-indore, and 6 listings.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
