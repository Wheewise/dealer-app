import { NextResponse } from "next/server";
import { apiRequireDealer } from "@/lib/rbac";
import { db, unwrap } from "@/lib/db";
import { generateApiKey, hashApiKey, keyPrefixOf } from "@/lib/api-auth";

export async function POST(req: Request) {
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;
  const dealer = { id: gate.ctx.dealerId };

  let name: string;
  try {
    ({ name } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const plaintext = generateApiKey();
  const apiKey = unwrap(
    await db
      .from("ApiKey")
      .insert({
        dealerId: dealer.id,
        name: name.trim(),
        keyHash: hashApiKey(plaintext),
        keyPrefix: keyPrefixOf(plaintext),
      })
      .select("id, name, keyPrefix, lastUsedAt, createdAt")
      .single(),
    "POST /api/dealer/api-keys",
  );

  // Plaintext is returned exactly once. It is NEVER persisted. The dealer
  // must copy it now; subsequent GETs only surface the prefix.
  return NextResponse.json({
    id: apiKey.id,
    name: apiKey.name,
    plaintextKey: plaintext,
    keyPrefix: apiKey.keyPrefix,
    lastUsedAt: apiKey.lastUsedAt,
    createdAt: apiKey.createdAt,
  });
}

export async function DELETE(req: Request) {
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;
  const dealer = { id: gate.ctx.dealerId };

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // The dealerId filter rides on the delete itself, so the client-supplied
  // `id` never selects a row on its own.
  const deleted = unwrap(
    await db
      .from("ApiKey")
      .delete()
      .eq("id", id)
      .eq("dealerId", dealer.id)
      .select("id"),
    "DELETE /api/dealer/api-keys",
  );
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
