export type GstVerification = {
  gstNumber: string;
  legalName: string;
  status: "Active" | "Cancelled" | "Suspended";
  verified: boolean;
};

/**
 * Verifies a GST number via gstinapi.in (chosen for its free 100-lookup
 * tier — see PROJECT_MEMORY.md). Swap to Appyflow post-launch by changing
 * only this function; callers depend on the GstVerification shape, not the
 * provider's response format.
 */
export async function verifyGst(gstNumber: string): Promise<GstVerification | null> {
  const apiKey = process.env.GSTINAPI_KEY;
  if (!apiKey) {
    const mockEnabled =
      process.env.WHEEWISE_MOCK_GST === "1" && process.env.NODE_ENV === "development";
    if (!mockEnabled) return null;
    console.warn(`[gst] mock verification used for ${gstNumber} — never trust in prod`);
    return { gstNumber, legalName: "Demo Motors Pvt Ltd", status: "Active", verified: true };
  }

  const res = await fetch(`https://www.gstinapi.in/v1/gstin/${gstNumber}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  return {
    gstNumber,
    legalName: data.legal_name ?? data.trade_name ?? "",
    status: data.gstin_status ?? "Active",
    verified: data.gstin_status === "Active",
  };
}
