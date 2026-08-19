import "./env";

import { PrismaClient } from "@prisma/client";
import { PrismaNeonHTTP } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Neon HTTP only, everywhere. No pg/node-postgres: it does internal
// environment detection that conditionally requires "pg-cloudflare", which
// opennextjs-cloudflare's Workers-target bundling can't resolve statically
// ("Could not resolve pg-cloudflare"), even though the code path is never
// actually reached at runtime. No transactions in HTTP mode either — see
// lib/actions/auth.ts and lib/actions/listings.ts for the sequential-writes
// pattern this requires instead of nested creates / $transaction([...]).
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const log: ("error" | "warn")[] =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  const adapter = new PrismaNeonHTTP(url, {});
  return new PrismaClient({ adapter, log });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
