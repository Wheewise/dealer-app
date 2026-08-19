const GSTIN_RE = /^(?!00)[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;

export function isValidGstin(gstin: string): boolean {
  return GSTIN_RE.test(gstin.replace(/\s/g, "").toUpperCase());
}

const COMPANY_NAMES = [
  "Motors Private Limited",
  "Auto Hub",
  "Wheels",
  "Car Dealership",
  "Automotives",
  "Car Zone",
  "Auto Sales",
];

const CITIES = [
  "Indore, MP",
  "Mumbai, MH",
  "Delhi, DL",
  "Bangalore, KA",
  "Pune, MH",
  "Chennai, TN",
];

function hashStr(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export type GstinVerification = {
  legalName: string;
  tradeName: string;
  address: string;
  /** false = stub data; do NOT mark dealer.gstVerified */
  trusted: boolean;
};

/**
 * Verifies a GSTIN. Tries the real upstream provider first (Surepass via
 * lib/gst-provider). If no provider is configured, returns synthetic data
 * with `trusted: false` only when both `WHEEWISE_MOCK_GST=1` and
 * `NODE_ENV=development` are set. Otherwise returns null.
 *
 * Callers must check `trusted` before flipping `dealer.gstVerified`.
 */
export async function verifyGstin(gstin: string): Promise<GstinVerification | null> {
  const cleaned = gstin.replace(/\s/g, "").toUpperCase();
  if (!isValidGstin(cleaned)) return null;

  // Real provider first — if it has a token, use it.
  const { verifyGstinUpstream } = await import("./gst-provider");
  const upstream = await verifyGstinUpstream(cleaned);
  if (upstream) return upstream;

  const mockEnabled =
    process.env.WHEEWISE_MOCK_GST === "1" && process.env.NODE_ENV === "development";
  if (!mockEnabled) return null;

  console.warn(`[gst] mock verification used for ${cleaned} — never trust in prod`);
  await new Promise((resolve) => setTimeout(resolve, 600));

  const hash = hashStr(cleaned);
  const tradeName = `Demo ${COMPANY_NAMES[hash % COMPANY_NAMES.length]}`;
  const city = CITIES[hash % CITIES.length];

  return {
    legalName: `${tradeName} PVT LTD`,
    tradeName,
    address: `Shop ${hash % 100}, Auto Nagar, ${city}`,
    trusted: false,
  };
}
