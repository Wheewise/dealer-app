import type { GstinVerification } from "./gst";

/**
 * Calls the real GST verification provider (Surepass by default; swap by
 * setting GST_PROVIDER_URL + GST_PROVIDER_TOKEN to any upstream that returns
 * the same shape). Returns `null` when no provider is configured — callers
 * must handle null explicitly; never default to "verified".
 */
export async function verifyGstinUpstream(
  gstin: string,
): Promise<GstinVerification | null> {
  const token = process.env.SUREPASS_TOKEN ?? process.env.GST_PROVIDER_TOKEN;
  if (!token) return null;

  const baseUrl = process.env.SUREPASS_BASE_URL ?? "https://kyc-api.surepass.io/api/v1";
  const endpoint = `${baseUrl}/corporate/gstin`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id_number: gstin }),
    });
    if (!res.ok) {
      console.warn(`[gst-provider] upstream ${res.status} for ${gstin}`);
      return null;
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        legal_name?: string;
        trade_name?: string;
        address?: string;
      };
    };
    if (!json.success || !json.data?.legal_name) return null;

    return {
      legalName: json.data.legal_name,
      tradeName: json.data.trade_name ?? json.data.legal_name,
      address: json.data.address ?? "",
      trusted: true,
    };
  } catch (err) {
    console.warn(`[gst-provider] error verifying ${gstin}`, err);
    return null;
  }
}
