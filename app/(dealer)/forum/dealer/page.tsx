import Link from "next/link";
import { requireDealer } from "@/lib/dealer";
import { getPosts } from "@/lib/actions/community";
import { NewPostForm } from "@/components/community/NewPostForm";

type Post = Awaited<ReturnType<typeof getPosts>>[number];

export default async function DealerForumPage() {
  await requireDealer();
  const posts = await getPosts("DEALER");

  return (
    <div className="bg-surface-muted min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dealer Forum</h1>
            <p className="text-sm text-zinc-500">
              Private discussions among Wheewise dealers.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="bg-brand-red hover:bg-brand-red-dark rounded-md px-3 py-1.5 text-sm font-semibold text-white"
          >
            Dashboard
          </Link>
        </div>

        <div className="mt-6">
          <NewPostForm community="DEALER" />
        </div>

        <section className="mt-6 space-y-3">
          {posts.map((p: Post) => (
            <Link
              key={p.id}
              href={`/forum/dealer/${p.id}`}
              className="border-border-default bg-background hover:border-brand-red block rounded-lg border p-4 transition-colors"
            >
              <div className="flex items-center gap-2">
                {p.isPinned ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                    Pinned
                  </span>
                ) : null}
                <h2 className="text-sm font-semibold">{p.title}</h2>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {p.author.name ?? "Member"} ·{" "}
                {new Date(p.createdAt).toLocaleDateString("en-IN")} · {p._count.replies}{" "}
                replies · {p._count.upvotes} upvotes
              </p>
              {p.tags.length > 0 ? (
                <div className="mt-2 flex gap-1">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="bg-surface-muted rounded px-1.5 py-0.5 text-[10px] text-zinc-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
