import type { RtoVehicle } from "./rto";

/**
 * Calls the real RTO vehicle-registration lookup. Surepass is the assumed
 * provider but the request shape is generic: set RTO_PROVIDER_URL + token to
 * point at any upstream returning the `data` envelope below.
 *
 * Returns `null` when no provider is configured or the lookup fails. Stub
 * data lives in lib/rto.ts and is only returned in dev with an explicit flag.
 */
export async function fetchRtoUpstream(regNumber: string): Promise<RtoVehicle | null> {
  const token = process.env.RTO_PROVIDER_TOKEN ?? process.env.SUREPASS_TOKEN;
  if (!token) return null;

  const baseUrl = process.env.RTO_PROVIDER_URL ?? "https://kyc-api.surepass.io/api/v1";
  const endpoint = `${baseUrl}/rc/rc-full`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id_number: regNumber }),
    });
    if (!res.ok) {
      console.warn(`[rto-provider] upstream ${res.status} for ${regNumber}`);
      return null;
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        registration_number?: string;
        maker_description?: string;
        maker_model?: string;
        manufactured_date_formatted?: string;
        manufactured_year?: number;
        fuel_type?: string;
        cubic_capacity?: number;
        color?: string;
      };
    };
    if (!json.success || !json.data?.registration_number) return null;
    const d = json.data;

    return {
      regNumber: d.registration_number!,
      make: d.maker_description ?? "",
      model: d.maker_model ?? "",
      year:
        d.manufactured_year ??
        (d.manufactured_date_formatted
          ? Number(d.manufactured_date_formatted.slice(-4))
          : new Date().getFullYear()),
      fuelType: (d.fuel_type ?? "PETROL").toUpperCase(),
      engineCc: d.cubic_capacity ?? null,
      color: d.color ?? null,
      trusted: true,
    };
  } catch (err) {
    console.warn(`[rto-provider] error fetching ${regNumber}`, err);
    return null;
  }
}
