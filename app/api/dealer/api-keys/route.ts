import { NextResponse } from "next/server";
import { apiRequireDealer } from "@/lib/rbac";
import { prisma } from "@/lib/db";
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
  const apiKey = await prisma.apiKey.create({
    data: {
      dealerId: dealer.id,
      name: name.trim(),
      keyHash: hashApiKey(plaintext),
      keyPrefix: keyPrefixOf(plaintext),
    },
  });

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

  const key = await prisma.apiKey.findFirst({
    where: { id, dealerId: dealer.id },
  });
  if (!key) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  // Delete by the row we just proved is ours, so the client-supplied `id`
  // never reaches the delete on its own.
  await prisma.apiKey.delete({ where: { id: key.id } });

  return NextResponse.json({ ok: true });
}
