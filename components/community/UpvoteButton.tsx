"use client";

import { useState } from "react";
import { upvotePost } from "@/lib/actions/community";

export function UpvoteButton({ postId, count }: { postId: string; count: number }) {
  const [c, setC] = useState(count);

  return (
    <button
      type="button"
      onClick={async () => {
        setC((prev) => prev + 1);
        try {
          await upvotePost(postId);
        } catch {
          setC((prev) => prev - 1);
        }
      }}
      className="bg-surface-muted flex flex-col items-center rounded-md px-3 py-1.5 text-xs hover:bg-zinc-200"
    >
      <span className="text-sm">▲</span>
      <span className="font-bold">{c}</span>
    </button>
  );
}
