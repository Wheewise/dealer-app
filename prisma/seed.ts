import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("demo1234", 10);
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);

  const user = await prisma.user.upsert({
    where: { email: "demo@wheewise.in" },
    update: {},
    create: {
      email: "demo@wheewise.in",
      name: "Rohit Sharma",
      passwordHash: password,
      role: "DEALER",
    },
  });

  const dealer = await prisma.dealer.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      businessName: "Sharma Auto, Indore",
      city: "Indore",
      phone: "+919812345678",
      whatsapp: "+919812345678",
    },
  });

  await prisma.store.upsert({
    where: { dealerId: dealer.id },
    update: {},
    create: {
      dealerId: dealer.id,
      slug: "sharma-auto-indore",
      bio: "Family-run pre-owned car and bike showroom serving Indore for 12 years. Every vehicle is RC verified and warranted for 6 months.",
      primaryColor: "#DC2626",
    },
  });

  await prisma.subscription.upsert({
    where: { dealerId: dealer.id },
    update: {},
    create: {
      dealerId: dealer.id,
      plan: "FREE_TRIAL",
      status: "TRIALING",
      currentPeriodEnd: trialEnds,
    },
  });

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

  await prisma.listing.deleteMany({ where: { dealerId: dealer.id } });

  const seedPhotoUrls: Record<string, string[]> = {
    "Swift VXi": ["https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200"],
    "Creta SX": ["https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200"],
    "City ZX": ["https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200"],
    "Nexon EV Max": [
      "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=1200",
    ],
    "Classic 350": ["https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=1200"],
    "Duke 390": ["https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=1200"],
  };

  for (const l of listings) {
    await prisma.listing.create({
      data: {
        ...l,
        dealerId: dealer.id,
        viewCount: Math.floor(Math.random() * 200) + 20,
        photos: {
          create: (seedPhotoUrls[l.model] ?? []).map((url, i) => ({
            url,
            sortOrder: i,
          })),
        },
      },
    });
  }

  console.log(
    "Seeded demo dealer (demo@wheewise.in / demo1234), storefront /s/sharma-auto-indore, and 6 listings.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
