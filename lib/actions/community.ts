"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { moderateContent } from "@/lib/moderation";
import { getAuthContext, requireAdminContext, type Permission } from "@/lib/rbac";

const TAG_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;

const postSchema = z.object({
  community: z.enum(["BUYER", "DEALER"]),
  title: z.string().trim().min(4).max(200),
  body: z.string().trim().min(10).max(5000),
  tags: z.array(z.string().trim().toLowerCase().regex(TAG_RE)).max(10).default([]),
});

const replySchema = z.object({
  postId: z.string().min(1).max(40),
  body: z.string().trim().min(1).max(5000),
});

export async function createPost(
  community: "BUYER" | "DEALER",
  title: string,
  body: string,
  tags: string[],
) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Unauthorized" };
  if (community === "DEALER" && session.user.role !== "DEALER") {
    return {
      ok: false as const,
      error: "Only dealers can post in the dealer forum",
    };
  }

  const parsed = postSchema.safeParse({ community, title, body, tags });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Invalid post",
      fields: parsed.error.flatten().fieldErrors,
    };
  }

  const review = await moderateContent(`${parsed.data.title}\n${parsed.data.body}`);
  if (!review.isApproved) {
    return {
      ok: false as const,
      error: review.reason ?? "Content rejected by moderation",
    };
  }

  await prisma.post.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      authorId: session.user.id,
      community: parsed.data.community,
      tags: parsed.data.tags,
    },
  });

  const path = community === "DEALER" ? "/forum/dealer" : "/community";
  revalidatePath(path);
  return { ok: true as const };
}

/**
 * Author fields exposed on public forum reads.
 *
 * `email` used to be selected here and rendered as a fallback display name,
 * which published the email address of every participant to anyone who opened
 * the community page — or who called this action directly. Admin moderation
 * (`getAllPosts`) still sees emails; public reads do not.
 */
const PUBLIC_AUTHOR = { select: { name: true } } as const;

/** Only dealers (and admins) may read the dealer forum. */
async function canReadDealerForum(): Promise<boolean> {
  const ctx = await getAuthContext();
  return Boolean(ctx && (ctx.isAdmin || (ctx.role === "DEALER" && ctx.dealerId)));
}

export async function getPosts(community: "BUYER" | "DEALER") {
  // The /forum/dealer page is dealer-gated, but this action is reachable on
  // its own — without this check a buyer could read the dealer-only forum by
  // invoking it directly.
  if (community === "DEALER" && !(await canReadDealerForum())) return [];

  return prisma.post.findMany({
    where: { community },
    include: {
      author: PUBLIC_AUTHOR,
      _count: { select: { replies: true, upvotes: true } },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });
}

export async function getPost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: PUBLIC_AUTHOR,
      _count: { select: { upvotes: true } },
      replies: {
        include: { author: PUBLIC_AUTHOR },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!post) return null;
  // Same rule as the list: a dealer-forum thread is not public. Null rather
  // than a distinct error, so the id is not confirmed to a stranger.
  if (post.community === "DEALER" && !(await canReadDealerForum())) return null;
  return post;
}

export async function createReply(postId: string, body: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Unauthorized" };

  const parsed = replySchema.safeParse({ postId, body });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Invalid reply",
      fields: parsed.error.flatten().fieldErrors,
    };
  }

  const post = await prisma.post.findUnique({
    where: { id: parsed.data.postId },
    select: { isLocked: true, community: true },
  });
  if (!post) return { ok: false as const, error: "Post not found" };
  if (post.isLocked) return { ok: false as const, error: "This discussion is locked" };
  if (post.community === "DEALER" && session.user.role !== "DEALER") {
    return {
      ok: false as const,
      error: "Only dealers can reply in the dealer forum",
    };
  }

  const review = await moderateContent(parsed.data.body);
  if (!review.isApproved) {
    return {
      ok: false as const,
      error: review.reason ?? "Content rejected by moderation",
    };
  }

  await prisma.reply.create({
    data: {
      postId: parsed.data.postId,
      authorId: session.user.id,
      body: parsed.data.body,
    },
  });

  const path =
    post.community === "DEALER"
      ? `/forum/dealer/${parsed.data.postId}`
      : `/community/${parsed.data.postId}`;
  revalidatePath(path);
  return { ok: true as const };
}

export async function upvotePost(postId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { community: true },
  });
  if (!post) throw new Error("Post not found");
  if (post.community === "DEALER" && session.user.role !== "DEALER") {
    throw new Error("Only dealers can vote in the dealer forum");
  }

  const existing = await prisma.postUpvote.findUnique({
    where: { postId_userId: { postId, userId: session.user.id } },
  });
  if (existing) {
    await prisma.postUpvote.delete({ where: { id: existing.id } });
  } else {
    await prisma.postUpvote.create({
      data: { postId, userId: session.user.id },
    });
  }

  revalidatePath(`/community/${postId}`);
  revalidatePath(`/forum/dealer/${postId}`);
  return { ok: true };
}

// --- Admin ---

export async function togglePinPost(postId: string) {
  await requireAdmin("update");
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { isPinned: true },
  });
  if (!post) return;
  await prisma.post.update({
    where: { id: postId },
    data: { isPinned: !post.isPinned },
  });
  revalidatePath("/admin/community");
}

export async function toggleLockPost(postId: string) {
  await requireAdmin("update");
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { isLocked: true },
  });
  if (!post) return;
  await prisma.post.update({
    where: { id: postId },
    data: { isLocked: !post.isLocked },
  });
  revalidatePath("/admin/community");
}

export async function deletePost(postId: string) {
  await requireAdmin("delete");
  await prisma.post.delete({ where: { id: postId } });
  revalidatePath("/admin/community");
}

export async function getAllPosts() {
  await requireAdmin("read");
  return prisma.post.findMany({
    include: {
      author: { select: { name: true, email: true } },
      _count: { select: { replies: true, upvotes: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// Delegates to the central RBAC guard. The previous local copy compared
// `role !== "ADMIN"`, which silently locked SUPER_ADMIN out of moderation.
async function requireAdmin(permission: Permission = "manage_configuration") {
  return requireAdminContext(permission, "community");
}
