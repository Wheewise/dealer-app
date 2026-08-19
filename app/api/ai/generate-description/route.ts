import { NextResponse } from "next/server";
import { apiRequireDealer } from "@/lib/rbac";
import { generateDescription } from "@/lib/ai-description";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;

  // Keyed on the dealer as well as the IP: an IP-only key let one dealer
  // exhaust the shared quota for everyone behind the same NAT.
  const ip = getClientIp(req);
  const { ok: withinLimit, retryAfter } = await rateLimit(
    `ai-desc:${gate.ctx.dealerId}:${ip}`,
    10,
    60 * 60 * 1000,
  );
  if (!withinLimit) {
    return NextResponse.json(
      { error: `Rate limited. Retry in ${retryAfter}s.` },
      { status: 429 },
    );
  }

  let input: {
    vehicleType: string;
    make: string;
    model: string;
    year: number;
    fuelType: string;
    transmission?: string | null;
    odometerKm: number;
    askingPrice: number;
    city: string;
  };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!input.make || !input.model || !input.year || !input.askingPrice) {
    return NextResponse.json(
      { error: "make, model, year, and askingPrice required" },
      { status: 400 },
    );
  }

  const description = await generateDescription(input);
  return NextResponse.json({ description });
}
