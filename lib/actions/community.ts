"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, embeddedCount, unwrap, unwrapMaybe } from "@/lib/db";
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

  unwrap(
    await db
      .from("Post")
      .insert({
        title: parsed.data.title,
        body: parsed.data.body,
        authorId: session.user.id,
        community: parsed.data.community,
        tags: parsed.data.tags,
      })
      .select("id")
      .single(),
    "createPost",
  );

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
const PUBLIC_AUTHOR = "author:User(name)";

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

  const rows = unwrap(
    await db
      .from("Post")
      .select(`*, ${PUBLIC_AUTHOR}, replies:Reply(count), upvotes:PostUpvote(count)`)
      .eq("community", community)
      .order("isPinned", { ascending: false })
      .order("createdAt", { ascending: false }),
    "getPosts",
  );

  return rows.map((p) => ({
    ...p,
    _count: { replies: embeddedCount(p.replies), upvotes: embeddedCount(p.upvotes) },
  }));
}

export async function getPost(postId: string) {
  const post = unwrapMaybe(
    await db
      .from("Post")
      .select(
        `*, ${PUBLIC_AUTHOR},
         upvotes:PostUpvote(count),
         replies:Reply(*, author:User(name))`,
      )
      .eq("id", postId)
      .maybeSingle(),
    "getPost",
  );

  if (!post) return null;
  // Same rule as the list: a dealer-forum thread is not public. Null rather
  // than a distinct error, so the id is not confirmed to a stranger.
  if (post.community === "DEALER" && !(await canReadDealerForum())) return null;

  // PostgREST cannot order an embed per parent row; replies read oldest-first.
  // ISO-8601 sorts correctly as text, so no Date objects are needed.
  const replies = [...post.replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    ...post,
    replies,
    _count: { upvotes: embeddedCount(post.upvotes) },
  };
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

  const post = unwrapMaybe(
    await db
      .from("Post")
      .select("isLocked, community")
      .eq("id", parsed.data.postId)
      .maybeSingle(),
    "createReply lookup",
  );
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

  unwrap(
    await db
      .from("Reply")
      .insert({
        postId: parsed.data.postId,
        authorId: session.user.id,
        body: parsed.data.body,
      })
      .select("id")
      .single(),
    "createReply",
  );

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

  const post = unwrapMaybe(
    await db.from("Post").select("community").eq("id", postId).maybeSingle(),
    "upvotePost lookup",
  );
  if (!post) throw new Error("Post not found");
  if (post.community === "DEALER" && session.user.role !== "DEALER") {
    throw new Error("Only dealers can vote in the dealer forum");
  }

  // Toggle. The unique index on (postId, userId) is what keeps a double-click
  // from producing two upvotes if both requests read "not upvoted".
  const deleted = unwrap(
    await db
      .from("PostUpvote")
      .delete()
      .eq("postId", postId)
      .eq("userId", session.user.id)
      .select("id"),
    "upvotePost: remove",
  );
  if (deleted.length === 0) {
    unwrap(
      await db
        .from("PostUpvote")
        .upsert(
          { postId, userId: session.user.id },
          { onConflict: "postId,userId", ignoreDuplicates: true },
        )
        .select("id"),
      "upvotePost: add",
    );
  }

  revalidatePath(`/community/${postId}`);
  revalidatePath(`/forum/dealer/${postId}`);
  return { ok: true };
}

// --- Admin ---

export async function togglePinPost(postId: string) {
  await requireAdmin("update");
  const post = unwrapMaybe(
    await db.from("Post").select("isPinned").eq("id", postId).maybeSingle(),
    "togglePinPost lookup",
  );
  if (!post) return;
  unwrap(
    await db
      .from("Post")
      .update({ isPinned: !post.isPinned })
      .eq("id", postId)
      .select("id"),
    "togglePinPost",
  );
  revalidatePath("/admin/community");
}

export async function toggleLockPost(postId: string) {
  await requireAdmin("update");
  const post = unwrapMaybe(
    await db.from("Post").select("isLocked").eq("id", postId).maybeSingle(),
    "toggleLockPost lookup",
  );
  if (!post) return;
  unwrap(
    await db
      .from("Post")
      .update({ isLocked: !post.isLocked })
      .eq("id", postId)
      .select("id"),
    "toggleLockPost",
  );
  revalidatePath("/admin/community");
}

export async function deletePost(postId: string) {
  await requireAdmin("delete");
  unwrap(await db.from("Post").delete().eq("id", postId).select("id"), "deletePost");
  revalidatePath("/admin/community");
}

export async function getAllPosts() {
  await requireAdmin("read");
  const rows = unwrap(
    await db
      .from("Post")
      .select("*, author:User(name, email), replies:Reply(count), upvotes:PostUpvote(count)")
      .order("createdAt", { ascending: false }),
    "getAllPosts",
  );

  return rows.map((p) => ({
    ...p,
    _count: { replies: embeddedCount(p.replies), upvotes: embeddedCount(p.upvotes) },
  }));
}

// Delegates to the central RBAC guard. The previous local copy compared
// `role !== "ADMIN"`, which silently locked SUPER_ADMIN out of moderation.
async function requireAdmin(permission: Permission = "manage_configuration") {
  return requireAdminContext(permission, "community");
}
