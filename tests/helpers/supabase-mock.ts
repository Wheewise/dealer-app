/**
 * A fake supabase-js client for unit tests.
 *
 * Prisma's test doubles could be per-method `vi.fn()`s because every call was
 * one method with one options object. PostgREST queries are a *chain*, so a
 * useful double has to record the chain and answer at the end of it. This
 * records every link and resolves to whatever the test queued.
 *
 *   const db = createDbMock();
 *   db.queue({ table: "Listing", data: [{ id: "l1" }] });
 *   ...
 *   expect(db.calls[0].filters).toContainEqual({ method: "eq", args: ["status", "ACTIVE"] });
 *
 * Filters are asserted through `filterFor`, which reads the recorded chain —
 * so a test proves the *scoping* (`.eq("dealerId", …)`) that authorization
 * depends on, which is the thing worth pinning down.
 */

export type Operation = "select" | "insert" | "update" | "upsert" | "delete" | "rpc";

export type RecordedCall = {
  table: string;
  operation: Operation;
  /** The select projection, if one was requested. */
  select?: string;
  /** `{ count: "exact", head: true }` and friends. */
  selectOptions?: Record<string, unknown>;
  /** Insert/update/upsert payload, or the RPC arguments. */
  payload?: unknown;
  /** Every filter link, in call order. */
  filters: Array<{ method: string; args: unknown[] }>;
  order: Array<{ column: string; options?: Record<string, unknown> }>;
  limit?: number;
  range?: [number, number];
  /** Which terminator the caller used, if any. */
  terminator?: "single" | "maybeSingle";
};

export type QueuedResult = {
  data?: unknown;
  error?: { code?: string; message: string; details?: string; hint?: string } | null;
  count?: number | null;
};

const FILTER_METHODS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "or",
  "not",
  "filter",
  "match",
] as const;

export type DbMock = {
  from: (table: string) => unknown;
  rpc: (fn: string, args?: unknown) => unknown;
  /** Every query the code under test issued, in order. */
  calls: RecordedCall[];
  /**
   * Queue the next result. Calls consume the queue in order, ahead of any
   * `on()` default; once both are exhausted every query resolves to
   * `{ data: [], error: null, count: 0 }`, so a test that cares about one
   * query need not stub the rest.
   */
  queue: (result: QueuedResult) => void;
  /**
   * A standing answer for every query against `table`. Use this for rows the
   * code re-reads on each call — the session's User row, say — where a FIFO
   * queue would run dry partway through a test.
   */
  on: (table: string, result: QueuedResult) => void;
  reset: () => void;
  /** The first recorded call against a table, for assertions. */
  callFor: (table: string, operation?: Operation) => RecordedCall | undefined;
  /** Args of the first `method` filter on a table's first matching call. */
  filterFor: (table: string, method: string) => unknown[] | undefined;
};

/**
 * A stand-in for the whole `lib/db` module.
 *
 * The real module builds a Supabase client at import time and throws without
 * credentials, so tests replace the module rather than the client. The result
 * helpers are reimplemented here with the same semantics as lib/db.ts — a test
 * that relies on `unwrap` throwing on error is testing the real contract.
 *
 *   vi.mock("../../lib/db", async () => {
 *     const { makeDbModule } = await import("../helpers/supabase-mock");
 *     return makeDbModule();
 *   });
 *   import * as dbModule from "../../lib/db";
 *   const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;
 */
export function makeDbModule() {
  const mock = createDbMock();

  class DbError extends Error {
    readonly code: string | undefined;
    constructor(error: { code?: string; message: string }, context?: string) {
      super(context ? `${context}: ${error.message}` : error.message);
      this.name = "DbError";
      this.code = error.code;
    }
  }

  type Result = { data: unknown; error: { code?: string; message: string } | null };

  return {
    __mock: mock,
    db: mock,
    DbError,
    userDb: () => mock,
    unwrap(result: Result, context?: string) {
      if (result.error) throw new DbError(result.error, context);
      return result.data;
    },
    unwrapMaybe(result: Result, context?: string) {
      if (result.error) {
        if (result.error.code === "PGRST116") return null;
        throw new DbError(result.error, context);
      }
      return result.data;
    },
    async count(query: PromiseLike<{ count: number | null; error: unknown }>) {
      const { count: n, error } = await query;
      if (error) throw new DbError(error as { message: string }, "count");
      return n ?? 0;
    },
    embeddedCount(aggregate: { count: number }[] | null) {
      return aggregate?.[0]?.count ?? 0;
    },
    withFilters<Q>(query: Q, apply: (q: unknown) => unknown): Q {
      return apply(query) as Q;
    },
    isUniqueViolation(error: unknown) {
      return (error as { code?: string } | null)?.code === "23505";
    },
    isForeignKeyViolation(error: unknown) {
      return (error as { code?: string } | null)?.code === "23503";
    },
    toDate(value: string | null | undefined) {
      return value ? new Date(value) : null;
    },
  };
}

export function createDbMock(): DbMock {
  const calls: RecordedCall[] = [];
  const queued: QueuedResult[] = [];
  const defaults = new Map<string, QueuedResult>();

  function resolve(table: string): { data: unknown; error: unknown; count: number | null } {
    const next = queued.shift() ?? defaults.get(table);
    return {
      data: next?.data !== undefined ? next.data : [],
      error: next?.error ?? null,
      count: next?.count ?? 0,
    };
  }

  function makeBuilder(record: RecordedCall) {
    // The builder is thenable rather than a real Promise so the chain can keep
    // recording right up to the await.
    const builder: Record<string, unknown> = {
      then(onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(resolve(record.table)).then(onFulfilled, onRejected);
      },
      select(projection?: string, options?: Record<string, unknown>) {
        record.select = projection;
        record.selectOptions = options;
        return builder;
      },
      order(column: string, options?: Record<string, unknown>) {
        record.order.push({ column, options });
        return builder;
      },
      limit(n: number) {
        record.limit = n;
        return builder;
      },
      range(from: number, to: number) {
        record.range = [from, to];
        return builder;
      },
      single() {
        record.terminator = "single";
        return builder;
      },
      maybeSingle() {
        record.terminator = "maybeSingle";
        return builder;
      },
    };

    for (const method of FILTER_METHODS) {
      builder[method] = (...args: unknown[]) => {
        record.filters.push({ method, args });
        return builder;
      };
    }

    return builder;
  }

  function start(table: string, operation: Operation, payload?: unknown) {
    const record: RecordedCall = { table, operation, filters: [], order: [] };
    if (payload !== undefined) record.payload = payload;
    calls.push(record);
    return makeBuilder(record);
  }

  return {
    calls,
    from(table: string) {
      return {
        select: (projection?: string, options?: Record<string, unknown>) => {
          const b = start(table, "select") as Record<string, unknown>;
          return (b.select as (p?: string, o?: Record<string, unknown>) => unknown)(
            projection,
            options,
          );
        },
        insert: (payload: unknown) => start(table, "insert", payload),
        update: (payload: unknown) => start(table, "update", payload),
        upsert: (payload: unknown) => start(table, "upsert", payload),
        delete: () => start(table, "delete"),
      };
    },
    rpc(fn: string, args?: unknown) {
      return start(fn, "rpc", args);
    },
    queue(result: QueuedResult) {
      queued.push(result);
    },
    on(table: string, result: QueuedResult) {
      defaults.set(table, result);
    },
    reset() {
      calls.length = 0;
      queued.length = 0;
      defaults.clear();
    },
    callFor(table: string, operation?: Operation) {
      return calls.find(
        (c) => c.table === table && (operation === undefined || c.operation === operation),
      );
    },
    filterFor(table: string, method: string) {
      for (const call of calls) {
        if (call.table !== table) continue;
        const hit = call.filters.find((f) => f.method === method);
        if (hit) return hit.args;
      }
      return undefined;
    },
  };
}
