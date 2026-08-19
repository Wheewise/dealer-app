import "./env";

import { createClient, type SupabaseClient, type PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type Db = SupabaseClient<Database>;

const globalForDb = globalThis as unknown as { supabase?: Db };

/**
 * Server-side data access.
 *
 * This client carries the **service role** key and therefore bypasses RLS —
 * the same position Prisma held. Authorization still lives in `lib/rbac`,
 * which resolves identity, role and dealer id from the database rather than
 * from a client-supplied value. The policies in `supabase/schema.sql` are the
 * second line: they hold for anything that reaches the database by another
 * route (PostgREST, the SQL editor, a future browser client), and they become
 * the primary gate when the app moves to Supabase Auth.
 *
 * Two rules follow from that, and they matter:
 *   - the service key must never be exposed to a browser. Nothing in this
 *     module is importable from a client component; the guard below fails
 *     loudly rather than shipping the key if that ever changes.
 *   - a request-path query is NOT automatically scoped. Every `.eq()` on an
 *     owner column is load-bearing.
 *
 * `userDb()` is the RLS-respecting alternative for code that has a caller's
 * access token.
 */
function createServiceClient(): Db {
  if (typeof window !== "undefined") {
    throw new Error(
      "lib/db.ts was imported into a client bundle — this would leak SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("SUPABASE_URL environment variable is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "wheewise-server" } },
  });
}

export const db: Db = globalForDb.supabase ?? createServiceClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.supabase = db;
}

/**
 * A client scoped to one caller, so RLS applies to every query it makes.
 * Not used on the request path yet — it is what the auth cutover switches to.
 */
export function userDb(accessToken: string): Db {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set");
  }
  return createClient<Database>(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// ---------------------------------------------------------------------------
// Result handling
//
// supabase-js returns `{ data, error }` rather than throwing. Silently reading
// `data` past an error is the failure mode this whole section exists to
// prevent: it produces `null` that looks like "not found" when the truth is
// "the query was rejected".
// ---------------------------------------------------------------------------

export class DbError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;

  constructor(error: PostgrestError, context?: string) {
    super(context ? `${context}: ${error.message}` : error.message);
    this.name = "DbError";
    this.code = error.code;
    this.details = error.details;
  }
}

type Result = { data: unknown; error: PostgrestError | null };

/**
 * The non-null `data` of a supabase-js result.
 *
 * A plain `unwrap<T>(r: { data: T | null })` looks equivalent but is not:
 * supabase-js returns a *discriminated union* (`{data: T, error: null}` or
 * `{data: null, error: PostgrestError}`), and inferring `T` across that union
 * collapses to `never` at every call site — surfacing as hundreds of bogus
 * "property does not exist on type 'never'" errors nowhere near the cause.
 * A distributive conditional reads each branch separately and drops the null
 * one.
 */
type DataOf<R> = R extends { data: infer D } ? Exclude<D, null> : never;

/** Throws on error; returns the data. Use when a failure is not expected. */
export function unwrap<R extends Result>(result: R, context?: string): DataOf<R> {
  if (result.error) throw new DbError(result.error, context);
  return result.data as DataOf<R>;
}

/**
 * Like `unwrap`, but treats "no rows" as `null` instead of an error, which is
 * what `.maybeSingle()` already does — this additionally tolerates PGRST116
 * from a plain `.single()`.
 */
export function unwrapMaybe<R extends Result>(
  result: R,
  context?: string,
): DataOf<R> | null {
  if (result.error) {
    if (result.error.code === "PGRST116") return null;
    throw new DbError(result.error, context);
  }
  return result.data as DataOf<R> | null;
}

/**
 * Reads an embedded `count` aggregate, which PostgREST returns as a
 * one-element array: `select("*, enquiries:Enquiry(count)")` yields
 * `enquiries: [{ count: 3 }]`, and an empty array when there are none.
 * The successor to Prisma's `_count`.
 */
export function embeddedCount(aggregate: { count: number }[] | null): number {
  return aggregate?.[0]?.count ?? 0;
}

/** Postgres unique-violation. The successor to Prisma's P2002. */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "23505";
}

/** Postgres foreign-key violation. The successor to Prisma's P2003. */
export function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === "23503";
}

/**
 * Row count for a filtered query, without transferring the rows.
 *
 *   await count(db.from("Listing").select("id", { count: "exact", head: true })
 *                .eq("dealerId", id))
 */
export async function count(
  query: PromiseLike<{ count: number | null; error: PostgrestError | null }>,
): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw new DbError(error, "count");
  return n ?? 0;
}

/**
 * A structural view of the filter methods, for predicates shared between two
 * queries — typically a page of rows and its `head: true` count.
 *
 * The builder's generic parameters differ between those two (the count query
 * carries no row type), so they have no common named type. This narrows both
 * to the methods a shared predicate actually calls; `withFilters` puts the
 * concrete type back on the way out.
 */
export type FilterChain = {
  eq(column: string, value: unknown): FilterChain;
  neq(column: string, value: unknown): FilterChain;
  in(column: string, values: readonly unknown[]): FilterChain;
  gte(column: string, value: unknown): FilterChain;
  lte(column: string, value: unknown): FilterChain;
  ilike(column: string, pattern: string): FilterChain;
  or(filters: string): FilterChain;
};

/** Applies a shared predicate to a query, preserving the query's own type. */
export function withFilters<Q>(query: Q, apply: (q: FilterChain) => FilterChain): Q {
  return apply(query as FilterChain) as Q;
}

// ---------------------------------------------------------------------------
// JSON boundary
//
// PostgREST hands back ISO strings where Prisma handed back Date objects.
// Converting at the read site rather than everywhere downstream keeps the
// difference in one place.
// ---------------------------------------------------------------------------

export function toDate(value: string): Date;
export function toDate(value: string | null | undefined): Date | null;
export function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}
