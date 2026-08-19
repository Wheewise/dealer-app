"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Field";

type KeyData = {
  id: string;
  name: string;
  keyPrefix: string | null;
  isLegacy: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
};

type CreatedKey = {
  id: string;
  name: string;
  plaintextKey: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export function ApiKeyManager({ existingKeys }: { existingKeys: KeyData[] }) {
  const [keys, setKeys] = useState(existingKeys);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const createKey = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/dealer/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const created: CreatedKey = await res.json();
      setJustCreated(created);
      setKeys((prev) => [
        {
          id: created.id,
          name: created.name,
          keyPrefix: created.keyPrefix,
          isLegacy: false,
          lastUsedAt: created.lastUsedAt,
          createdAt: created.createdAt,
        },
        ...prev,
      ]);
      setNewName("");
    }
    setCreating(false);
  }, [newName]);

  const revokeKey = useCallback(async (id: string) => {
    setRevoking(id);
    const res = await fetch(`/api/dealer/api-keys?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.id !== id));
    }
    setRevoking(null);
  }, []);

  return (
    <div className="space-y-4">
      {justCreated ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Copy this key now — it will not be shown again
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Wheewise only stores a hash of your key. If you lose it, revoke and create a
            new one.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded border border-amber-200 bg-white px-3 py-2 font-mono text-xs">
              {justCreated.plaintextKey}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(justCreated.plaintextKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              I&apos;ve saved it
            </button>
          </div>
        </div>
      ) : null}

      <div className="border-border-default bg-background rounded-lg border p-4">
        <p className="text-sm font-semibold">Create a new API key</p>
        <div className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Key name (e.g. Website integration)"
            className="focus:border-brand-red flex-1 rounded-md border px-3 py-2 text-sm outline-none"
          />
          <Button
            type="button"
            onClick={createKey}
            disabled={creating || !newName.trim()}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>

      {keys.length === 0 ? (
        <div className="border-border-default bg-background rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
          No API keys yet. Create one to access the Wheewise API.
        </div>
      ) : (
        <div className="border-border-default bg-background rounded-lg border">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between border-b px-4 py-3 last:border-0"
            >
              <div>
                <span className="text-sm font-semibold">{k.name}</span>
                {k.isLegacy ? (
                  <span className="ml-2 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase">
                    Legacy
                  </span>
                ) : null}
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  {k.keyPrefix ?? "—"}
                  {k.isLegacy ? "" : "…"}
                </p>
                <p className="text-[11px] text-zinc-400">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt
                    ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                    : " · Never used"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revokeKey(k.id)}
                disabled={revoking === k.id}
                className="text-brand-red text-xs font-medium hover:underline"
              >
                {revoking === k.id ? "…" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
