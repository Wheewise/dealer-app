import { NextResponse } from "next/server";
import { apiRequireDealer } from "@/lib/rbac";
import { db, unwrap } from "@/lib/db";
import { listingSchema } from "@/lib/validators/listing";

const HEADERS = [
  "vehicleType",
  "make",
  "model",
  "year",
  "fuelType",
  "transmission",
  "odometerKm",
  "askingPrice",
  "description",
  "city",
];

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

type RowResult = { row: number; id?: string; error?: string };

export async function POST(req: Request) {
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;

  // `city` is the only extra field needed; the id comes from the session
  // context, never from the request.
  const dealer = unwrap(
    await db.from("Dealer").select("id, city").eq("id", gate.ctx.dealerId!).single(),
    "bulk-upload: dealer",
  );

  // Reject oversized uploads before reading body to avoid memory pressure.
  // 1 MB easily covers the 100-row cap (template row is ~120 bytes).
  const MAX_BYTES = 1_000_000;
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `CSV exceeds ${MAX_BYTES / 1000} KB limit` },
      { status: 413 },
    );
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  // Defence in depth: also enforce the cap on the actual payload size, in case
  // the client omitted/lied about Content-Length.
  if (text.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `CSV exceeds ${MAX_BYTES / 1000} KB limit` },
      { status: 413 },
    );
  }

  const rows = parseCSV(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows found in CSV" }, { status: 400 });
  }
  if (rows.length > 100) {
    return NextResponse.json({ error: "Max 100 rows per upload" }, { status: 400 });
  }

  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, header is row 1

    try {
      const parsed = listingSchema.safeParse({
        vehicleType: row.vehicleType?.toUpperCase() ?? "CAR",
        make: row.make,
        model: row.model,
        year: Number(row.year),
        fuelType: row.fuelType?.toUpperCase() ?? "PETROL",
        transmission: row.transmission?.toUpperCase() || null,
        odometerKm: Number(row.odometerKm),
        askingPrice: Number(row.askingPrice),
        description: row.description ?? "",
        city: row.city || dealer.city,
      });

      if (!parsed.success) {
        const firstError = parsed.error.issues[0];
        results.push({
          row: rowNum,
          error: `${firstError.path.join(".")}: ${firstError.message}`,
        });
        continue;
      }

      // `photoUrls` belongs to the form schema, not the Listing table — the
      // CSV path never supplies photos, and PostgREST rejects unknown columns.
      const { description, photoUrls: _photoUrls, ...data } = parsed.data;
      const { ensureDescription } = await import("@/lib/ai-description");
      const finalDescription = await ensureDescription(description, {
        vehicleType: data.vehicleType,
        make: data.make,
        model: data.model,
        year: data.year,
        fuelType: data.fuelType,
        transmission: data.transmission,
        odometerKm: data.odometerKm,
        askingPrice: data.askingPrice,
        city: data.city,
      });

      const listing = unwrap(
        await db
          .from("Listing")
          .insert({
            ...data,
            description: finalDescription,
            dealerId: dealer.id,
            status: "ACTIVE",
          })
          .select("id")
          .single(),
        "bulk-upload: listing",
      );

      results.push({ row: rowNum, id: listing.id });
    } catch (err) {
      results.push({
        row: rowNum,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const created = results.filter((r) => r.id).length;
  const failed = results.filter((r) => r.error).length;

  return NextResponse.json({
    created,
    failed,
    total: rows.length,
    results,
  });
}

/**
 * CSV template download for the bulk-upload screen. The payload is static and
 * carries no data, but everything under /api/dealer is gated by default —
 * leaving one handler open invites the next one to be added open too. The
 * link is a same-origin `<a href download>`, so the session cookie rides
 * along and the gate is invisible to the dealer.
 */
export async function GET() {
  const gate = await apiRequireDealer();
  if (!gate.ok) return gate.response;

  const headerLine = HEADERS.join(",");
  const exampleLine = [
    "CAR",
    "Maruti Suzuki",
    "Swift VXI",
    "2020",
    "PETROL",
    "MANUAL",
    "45000",
    "450000",
    "Well maintained single owner car",
    "Indore",
  ].join(",");

  const csv = `${headerLine}\n${exampleLine}`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="wheewise-template.csv"',
    },
  });
}
