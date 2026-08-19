"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Field";
import { createPost } from "@/lib/actions/community";

export function NewPostForm({ community }: { community: "BUYER" | "DEALER" }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full text-sm">
        + New discussion
      </Button>
    );
  }

  return (
    <form
      className="border-border-default bg-background space-y-3 rounded-lg border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || !body.trim()) return;
        setSaving(true);
        try {
          const res = await createPost(
            community,
            title.trim(),
            body.trim(),
            tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          );
          if (res.ok) {
            setTitle("");
            setBody("");
            setTags("");
            setOpen(false);
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
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">New discussion</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:underline"
        >
          Cancel
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-2 text-sm outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Share your thoughts…"
        className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-2 text-sm outline-none"
      />
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (comma separated)"
        className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-2 text-sm outline-none"
      />
      <Button disabled={saving || !title.trim() || !body.trim()}>
        {saving ? "Posting…" : "Post"}
      </Button>
    </form>
  );
}
