"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Field";
import { createReply } from "@/lib/actions/community";

type ReplyData = {
  id: string;
  body: string;
  createdAt: string;
  // No email: public forum reads no longer expose author addresses.
  author: { name: string | null };
};

export function PostReplies({
  postId,
  isLocked,
  replies,
}: {
  postId: string;
  isLocked: boolean;
  replies: ReplyData[];
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <section className="mt-6 space-y-4">
      <h2 className="text-base font-semibold">
        {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
      </h2>

      {replies.map((r) => (
        <div
          key={r.id}
          className="border-border-default bg-background rounded-lg border p-4"
        >
          <p className="text-xs text-zinc-500">
            {r.author.name ?? "Anonymous"} ·{" "}
            {new Date(r.createdAt).toLocaleDateString("en-IN")}
          </p>
          <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-700">{r.body}</p>
        </div>
      ))}

      {!isLocked ? (
        <form
          className="border-border-default bg-background space-y-3 rounded-lg border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            setSaving(true);
            try {
              const res = await createReply(postId, body.trim());
              if (res.ok) {
                setBody("");
              } else {
                alert(res.error);
              }
            } catch (err) {
              alert(err instanceof Error ? err.message : "Failed");
            } finally {
              setSaving(false);
            }
          }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Write a reply…"
            className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
          <Button disabled={saving || !body.trim()}>
            {saving ? "Posting…" : "Reply"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
