import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/db", () => ({
  prisma: {
    post: { create: vi.fn(), findUnique: vi.fn() },
    reply: { create: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createPost, createReply } from "../../lib/actions/community";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const postCreate = prisma.post.create as unknown as M;
const postFindUnique = prisma.post.findUnique as unknown as M;
const replyCreate = prisma.reply.create as unknown as M;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "user_1", role: "BUYER" } });
});

describe("createPost", () => {
  it("rejects when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await createPost("BUYER", "Hello world!", "A long body here.", []);
    expect(res.ok).toBe(false);
    expect(postCreate).not.toHaveBeenCalled();
  });

  it("rejects BUYER attempting to post in DEALER forum", async () => {
    const res = await createPost("DEALER", "Title here", "Body content.", []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/dealer/i);
    expect(postCreate).not.toHaveBeenCalled();
  });

  it("allows DEALER to post in DEALER forum", async () => {
    authMock.mockResolvedValue({ user: { id: "u", role: "DEALER" } });
    const res = await createPost("DEALER", "Title here", "Body content.", []);
    expect(res.ok).toBe(true);
    expect(postCreate).toHaveBeenCalledOnce();
  });

  it("rejects bodies over 5000 chars", async () => {
    const res = await createPost("BUYER", "Title", "x".repeat(5001), []);
    expect(res.ok).toBe(false);
    expect(postCreate).not.toHaveBeenCalled();
  });

  it("rejects more than 10 tags", async () => {
    const res = await createPost(
      "BUYER",
      "Title here",
      "Body content goes here.",
      Array(11).fill("tag"),
    );
    expect(res.ok).toBe(false);
    expect(postCreate).not.toHaveBeenCalled();
  });

  it("rejects content flagged by moderateContent (bad-word path)", async () => {
    const res = await createPost(
      "BUYER",
      "Selling fake parts cheap",
      "Buy followers and boost your sales today.",
      [],
    );
    expect(res.ok).toBe(false);
    expect(postCreate).not.toHaveBeenCalled();
  });

  it("trims tags and normalises to lowercase", async () => {
    await createPost("BUYER", "Title here", "Body content goes here.", [
      "  Diesel  ",
      "Maintenance",
    ]);
    const call = postCreate.mock.calls[0][0];
    expect(call.data.tags).toEqual(["diesel", "maintenance"]);
  });
});

describe("createReply", () => {
  it("rejects when post is locked", async () => {
    postFindUnique.mockResolvedValue({ isLocked: true, community: "BUYER" });
    const res = await createReply("post_1", "Some reply body");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/locked/i);
    expect(replyCreate).not.toHaveBeenCalled();
  });

  it("rejects BUYER attempting to reply in DEALER forum", async () => {
    postFindUnique.mockResolvedValue({ isLocked: false, community: "DEALER" });
    const res = await createReply("post_1", "Some reply body");
    expect(res.ok).toBe(false);
    expect(replyCreate).not.toHaveBeenCalled();
  });

  it("allows DEALER to reply in DEALER forum", async () => {
    authMock.mockResolvedValue({ user: { id: "u", role: "DEALER" } });
    postFindUnique.mockResolvedValue({ isLocked: false, community: "DEALER" });
    const res = await createReply("post_1", "Reply body content");
    expect(res.ok).toBe(true);
    expect(replyCreate).toHaveBeenCalledOnce();
  });

  it("rejects content flagged by moderation", async () => {
    postFindUnique.mockResolvedValue({ isLocked: false, community: "BUYER" });
    const res = await createReply("post_1", "Call me at 9876543210 for spam");
    expect(res.ok).toBe(false);
    expect(replyCreate).not.toHaveBeenCalled();
  });
});
