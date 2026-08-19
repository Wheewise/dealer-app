import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    post: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../lib/moderation", () => ({ moderateContent: vi.fn(() => ({ ok: true })) }));

import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";
import { getPosts, getPost } from "../../lib/actions/community";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const userFindUnique = prisma.user.findUnique as unknown as M;
const postFindMany = prisma.post.findMany as unknown as M;
const postFindUnique = prisma.post.findUnique as unknown as M;

function signIn(
  row: { id: string; role: string; dealer?: { id: string; status: "ACTIVE" } } | null,
) {
  authMock.mockResolvedValue(row ? { user: { id: row.id, role: row.role } } : null);
  userFindUnique.mockResolvedValue(
    row
      ? {
          id: row.id,
          email: `${row.id}@example.com`,
          name: row.id,
          role: row.role,
          dealer: row.dealer ?? null,
        }
      : null,
  );
}

const DEALER = {
  id: "u_d",
  role: "DEALER",
  dealer: { id: "dealer_A", status: "ACTIVE" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  postFindMany.mockResolvedValue([{ id: "p1" }]);
});

/**
 * `/forum/dealer` is dealer-gated at the page level, but `getPosts` is an
 * exported server action and therefore reachable on its own.
 */
describe("dealer forum is not readable by outsiders", () => {
  it("returns nothing to an anonymous caller", async () => {
    signIn(null);
    await expect(getPosts("DEALER")).resolves.toEqual([]);
    expect(postFindMany).not.toHaveBeenCalled();
  });

  it("returns nothing to a buyer", async () => {
    signIn({ id: "u_b", role: "BUYER" });
    await expect(getPosts("DEALER")).resolves.toEqual([]);
    expect(postFindMany).not.toHaveBeenCalled();
  });

  it("returns posts to a dealer", async () => {
    signIn(DEALER);
    await expect(getPosts("DEALER")).resolves.toEqual([{ id: "p1" }]);
  });

  it("returns posts to an admin", async () => {
    signIn({ id: "u_admin", role: "ADMIN" });
    await expect(getPosts("DEALER")).resolves.toEqual([{ id: "p1" }]);
  });

  it("leaves the buyer community public", async () => {
    signIn(null);
    await expect(getPosts("BUYER")).resolves.toEqual([{ id: "p1" }]);
  });

  it("hides an individual dealer-forum thread from a buyer", async () => {
    signIn({ id: "u_b", role: "BUYER" });
    postFindUnique.mockResolvedValue({ id: "p1", community: "DEALER" });
    await expect(getPost("p1")).resolves.toBeNull();
  });

  it("shows an individual buyer-community thread to anyone", async () => {
    signIn(null);
    postFindUnique.mockResolvedValue({ id: "p1", community: "BUYER" });
    await expect(getPost("p1")).resolves.toMatchObject({ id: "p1" });
  });
});

describe("public forum reads do not carry author emails", () => {
  it("selects only the author's name", async () => {
    signIn(null);
    await getPosts("BUYER");
    const include = postFindMany.mock.calls[0][0].include;
    expect(include.author).toEqual({ select: { name: true } });
    expect(include.author.select.email).toBeUndefined();
  });

  it("applies the same projection to replies", async () => {
    signIn(null);
    postFindUnique.mockResolvedValue({ id: "p1", community: "BUYER" });
    await getPost("p1");
    const include = postFindUnique.mock.calls[0][0].include;
    expect(include.author).toEqual({ select: { name: true } });
    expect(include.replies.include.author).toEqual({ select: { name: true } });
  });
});
