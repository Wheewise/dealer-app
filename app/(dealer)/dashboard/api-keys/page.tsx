import { requireDealer } from "@/lib/dealer";
import { prisma } from "@/lib/db";
import { ApiKeyManager } from "./ApiKeyManager";

export default async function ApiKeysPage() {
  const { dealer } = await requireDealer();

  const keys = await prisma.apiKey.findMany({
    where: { dealerId: dealer.id },
    orderBy: { createdAt: "desc" },
  });
  type ApiKey = (typeof keys)[number];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage API keys for programmatic access to your inventory data. Keys are shown
          only once when created — store them somewhere safe.
        </p>
      </div>
      <ApiKeyManager
        existingKeys={keys.map((k: ApiKey) => ({
          id: k.id,
          name: k.name,
          // Pre-migration keys have plaintext `key` but no `keyPrefix`. Show
          // the legacy plaintext until they're rotated; new keys only show prefix.
          keyPrefix: k.keyPrefix ?? k.key,
          isLegacy: k.keyHash == null,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
        }))}
      />
    </div>
  );
}
