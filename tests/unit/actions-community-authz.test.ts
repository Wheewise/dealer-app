import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/db", async () => {
  const { makeDbModule } = await import("../helpers/supabase-mock");
  return makeDbModule();
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../lib/moderation", () => ({ moderateContent: vi.fn(() => ({ ok: true })) }));

import { auth } from "../../lib/auth";
import * as dbModule from "../../lib/db";
import type { DbMock } from "../helpers/supabase-mock";
import { getPosts, getPost } from "../../lib/actions/community";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;

function postReads() {
  return dbMock.calls.filter((c) => c.table === "Post" && c.operation === "select");
}

function signIn(
  row: { id: string; role: string; dealer?: { id: string; status: "ACTIVE" } } | null,
) {
  authMock.mockResolvedValue(row ? { user: { id: row.id, role: row.role } } : null);
  dbMock.on("User", {
    data: row
      ? {
          id: row.id,
          email: `${row.id}@example.com`,
          name: row.id,
          role: row.role,
          dealer: row.dealer ?? null,
        }
      : null,
  });
}

const DEALER = {
  id: "u_d",
  role: "DEALER",
  dealer: { id: "dealer_A", status: "ACTIVE" as const },
};

/** A list row carries the embedded count aggregates the action reshapes. */
const LIST_ROW = { id: "p1", replies: [{ count: 0 }], upvotes: [{ count: 0 }] };

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.reset();
  dbMock.on("Post", { data: [LIST_ROW] });
});

/**
 * `/forum/dealer` is dealer-gated at the page level, but `getPosts` is an
 * exported server action and therefore reachable on its own.
 */
describe("dealer forum is not readable by outsiders", () => {
  it("returns nothing to an anonymous caller", async () => {
    signIn(null);
    await expect(getPosts("DEALER")).resolves.toEqual([]);
    expect(postReads()).toHaveLength(0);
  });

  it("returns nothing to a buyer", async () => {
    signIn({ id: "u_b", role: "BUYER" });
    await expect(getPosts("DEALER")).resolves.toEqual([]);
    expect(postReads()).toHaveLength(0);
  });

  it("returns posts to a dealer", async () => {
    signIn(DEALER);
    await expect(getPosts("DEALER")).resolves.toMatchObject([{ id: "p1" }]);
  });

  it("returns posts to an admin", async () => {
    signIn({ id: "u_admin", role: "ADMIN" });
    await expect(getPosts("DEALER")).resolves.toMatchObject([{ id: "p1" }]);
  });

  it("leaves the buyer community public", async () => {
    signIn(null);
    await expect(getPosts("BUYER")).resolves.toMatchObject([{ id: "p1" }]);
  });

  it("hides an individual dealer-forum thread from a buyer", async () => {
    signIn({ id: "u_b", role: "BUYER" });
    dbMock.on("Post", {
      data: { id: "p1", community: "DEALER", replies: [], upvotes: [{ count: 0 }] },
    });
    await expect(getPost("p1")).resolves.toBeNull();
  });

  it("shows an individual buyer-community thread to anyone", async () => {
    signIn(null);
    dbMock.on("Post", {
      data: { id: "p1", community: "BUYER", replies: [], upvotes: [{ count: 0 }] },
    });
    await expect(getPost("p1")).resolves.toMatchObject({ id: "p1" });
  });
});

describe("public forum reads do not carry author emails", () => {
  it("selects only the author's name", async () => {
    signIn(null);
    await getPosts("BUYER");
    const projection = postReads()[0].select ?? "";
    expect(projection).toContain("author:User(name)");
    expect(projection).not.toContain("email");
  });

  it("applies the same projection to replies", async () => {
    signIn(null);
    dbMock.on("Post", {
      data: { id: "p1", community: "BUYER", replies: [], upvotes: [{ count: 0 }] },
    });
    await getPost("p1");
    const projection = postReads()[0].select ?? "";
    expect(projection).toContain("author:User(name)");
    expect(projection).toContain("replies:Reply(*, author:User(name))");
    expect(projection).not.toContain("email");
  });
});
