import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/db", async () => {
  const { makeDbModule } = await import("../helpers/supabase-mock");
  return makeDbModule();
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createPost, createReply } from "../../lib/actions/community";
import { auth } from "../../lib/auth";
import * as dbModule from "../../lib/db";
import type { DbMock, RecordedCall } from "../helpers/supabase-mock";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;

function inserts(table: string): RecordedCall[] {
  return dbMock.calls.filter((c) => c.table === table && c.operation === "insert");
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.reset();
  authMock.mockResolvedValue({ user: { id: "user_1", role: "BUYER" } });
  dbMock.on("Post", { data: { id: "p1" } });
  dbMock.on("Reply", { data: { id: "r1" } });
});

describe("createPost", () => {
  it("rejects when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await createPost("BUYER", "Hello world!", "A long body here.", []);
    expect(res.ok).toBe(false);
    expect(inserts("Post")).toHaveLength(0);
  });

  it("rejects BUYER attempting to post in DEALER forum", async () => {
    const res = await createPost("DEALER", "Title here", "Body content.", []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/dealer/i);
    expect(inserts("Post")).toHaveLength(0);
  });

  it("allows DEALER to post in DEALER forum", async () => {
    authMock.mockResolvedValue({ user: { id: "u", role: "DEALER" } });
    const res = await createPost("DEALER", "Title here", "Body content.", []);
    expect(res.ok).toBe(true);
    expect(inserts("Post")).toHaveLength(1);
  });

  it("rejects bodies over 5000 chars", async () => {
    const res = await createPost("BUYER", "Title", "x".repeat(5001), []);
    expect(res.ok).toBe(false);
    expect(inserts("Post")).toHaveLength(0);
  });

  it("rejects more than 10 tags", async () => {
    const res = await createPost(
      "BUYER",
      "Title here",
      "Body content goes here.",
      Array(11).fill("tag"),
    );
    expect(res.ok).toBe(false);
    expect(inserts("Post")).toHaveLength(0);
  });

  it("rejects content flagged by moderateContent (bad-word path)", async () => {
    const res = await createPost(
      "BUYER",
      "Selling fake parts cheap",
      "Buy followers and boost your sales today.",
      [],
    );
    expect(res.ok).toBe(false);
    expect(inserts("Post")).toHaveLength(0);
  });

  it("trims tags and normalises to lowercase", async () => {
    await createPost("BUYER", "Title here", "Body content goes here.", [
      "  Diesel  ",
      "Maintenance",
    ]);
    const payload = inserts("Post")[0].payload as { tags: string[] };
    expect(payload.tags).toEqual(["diesel", "maintenance"]);
  });

  // authorId comes from the session, never from an argument, so a post cannot
  // be attributed to someone else.
  it("pins authorId to the session user", async () => {
    await createPost("BUYER", "Title here", "Body content goes here.", []);
    const payload = inserts("Post")[0].payload as { authorId: string };
    expect(payload.authorId).toBe("user_1");
  });
});

describe("createReply", () => {
  it("rejects when post is locked", async () => {
    dbMock.on("Post", { data: { isLocked: true, community: "BUYER" } });
    const res = await createReply("post_1", "Some reply body");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/locked/i);
    expect(inserts("Reply")).toHaveLength(0);
  });

  it("rejects BUYER attempting to reply in DEALER forum", async () => {
    dbMock.on("Post", { data: { isLocked: false, community: "DEALER" } });
    const res = await createReply("post_1", "Some reply body");
    expect(res.ok).toBe(false);
    expect(inserts("Reply")).toHaveLength(0);
  });

  it("allows DEALER to reply in DEALER forum", async () => {
    authMock.mockResolvedValue({ user: { id: "u", role: "DEALER" } });
    dbMock.on("Post", { data: { isLocked: false, community: "DEALER" } });
    const res = await createReply("post_1", "Reply body content");
    expect(res.ok).toBe(true);
    expect(inserts("Reply")).toHaveLength(1);
  });

  it("rejects content flagged by moderation", async () => {
    dbMock.on("Post", { data: { isLocked: false, community: "BUYER" } });
    const res = await createReply("post_1", "Call me at 9876543210 for spam");
    expect(res.ok).toBe(false);
    expect(inserts("Reply")).toHaveLength(0);
  });
});
