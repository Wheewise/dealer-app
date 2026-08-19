export interface RtoVehicle {
  regNumber: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  engineCc: number | null;
  color: string | null;
  /** false = stub data; UI must not present this as authoritative */
  trusted: boolean;
}

const VEHICLE_MODELS = [
  { make: "Maruti Suzuki", model: "Swift VXI", fuelType: "PETROL", engineCc: 1197 },
  { make: "Hyundai", model: "Creta SX", fuelType: "DIESEL", engineCc: 1493 },
  { make: "Honda", model: "City V", fuelType: "PETROL", engineCc: 1498 },
  { make: "Tata", model: "Nexon XZ+", fuelType: "DIESEL", engineCc: 1497 },
  { make: "Kia", model: "Seltos HTX", fuelType: "PETROL", engineCc: 1497 },
  { make: "Mahindra", model: "Thar LX", fuelType: "DIESEL", engineCc: 2184 },
  { make: "Toyota", model: "Innova Crysta", fuelType: "DIESEL", engineCc: 2393 },
  { make: "Volkswagen", model: "Polo GT TSI", fuelType: "PETROL", engineCc: 999 },
];

const COLORS = [
  "White",
  "Phantom Black",
  "Golden Brown",
  "Radiant Red",
  "Silver",
  "Grey",
];

function hashReg(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Looks up a vehicle by registration number. Tries the real upstream first
 * (Surepass RC API via lib/rto-provider). If no provider is configured,
 * returns deterministic stub data tagged `trusted: false` only when
 * `WHEEWISE_MOCK_RTO=1` AND `NODE_ENV=development` are set.
 */
export async function fetchRto(regNumber: string): Promise<RtoVehicle | null> {
  const cleaned = regNumber.replace(/[\s-]/g, "").toUpperCase();

  if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(cleaned)) {
    return null;
  }

  const { fetchRtoUpstream } = await import("./rto-provider");
  const upstream = await fetchRtoUpstream(cleaned);
  if (upstream) return upstream;

  const mockEnabled =
    process.env.WHEEWISE_MOCK_RTO === "1" && process.env.NODE_ENV === "development";
  if (!mockEnabled) return null;

  console.warn(`[rto] mock lookup used for ${cleaned} — never trust in prod`);
  await new Promise((resolve) => setTimeout(resolve, 800));

  const hash = hashReg(cleaned);
  const baseVehicle = VEHICLE_MODELS[hash % VEHICLE_MODELS.length];
  const year = 2010 + (hash % 15);
  const color = COLORS[hash % COLORS.length];

  return {
    regNumber: cleaned,
    ...baseVehicle,
    year,
    color,
    trusted: false,
  };
}
