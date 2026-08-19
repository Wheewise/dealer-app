import { NextResponse } from "next/server";
import { fetchRto } from "@/lib/rto";
import { apiRequireDealer } from "@/lib/rbac";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Registration numbers are `XX00XX0000`-shaped. Validating before the upstream
// call keeps hostile strings out of the provider's URL and rejects scanning.
const REG_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

/**
 * RTO lookup for the dealer listing form (`components/listings/RtoLookup`).
 *
 * This endpoint reaches a paid third-party registry that returns owner-linked
 * vehicle data, and it was previously open to the internet with no rate limit
 * — anyone could enumerate registration plates and run up the bill. It is now
 * dealer-only (its only caller is the dealer-only listing form, so no UI
 * changes) and rate limited per dealer.
 */
export async function GET(req: Request) {
  // Write-level gate: this lookup only feeds the listing-create/edit form, and
  // a suspended dealer cannot publish listings — so it should not be able to
  // spend the lookup budget either.
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;

  const key = `rto:${gate.ctx.dealerId}:${getClientIp(req)}`;
  const { ok: withinLimit, retryAfter } = await rateLimit(key, 30, 60 * 60 * 1000);
  if (!withinLimit) {
    return NextResponse.json(
      { error: `Too many lookups. Try again in ${retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const reg = searchParams.get("reg");
  if (!reg) {
    return NextResponse.json({ error: "Missing registration number" }, { status: 400 });
  }

  const normalized = reg.replace(/[\s-]/g, "").toUpperCase();
  if (!REG_RE.test(normalized)) {
    return NextResponse.json(
      { error: "Invalid registration number" },
      { status: 400 },
    );
  }

  const vehicle = await fetchRto(normalized);
  if (!vehicle) {
    return NextResponse.json(
      { error: "RTO lookup provider not configured" },
      { status: 503 },
    );
  }

  return NextResponse.json(vehicle);
}
