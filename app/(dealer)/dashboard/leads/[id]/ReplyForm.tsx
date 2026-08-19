"use client";

import { useActionState, useRef } from "react";
import { replyToEnquiry, type ActionResult } from "@/lib/actions/enquiries";

export function ReplyForm({ enquiryId }: { enquiryId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    async (_prev, formData) => {
      const body = String(formData.get("body") ?? "");
      const result = await replyToEnquiry(enquiryId, body);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    undefined,
  );

  return (
    <form ref={formRef} action={formAction} className="border-border-default border-t p-3">
      {state && !state.ok ? (
        <p className="bg-brand-red/10 text-brand-red mb-2 rounded-md px-3 py-2 text-xs">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <textarea
          name="body"
          rows={2}
          required
          placeholder="Type your reply…"
          className="border-border-default focus:border-brand-red focus:ring-brand-red/20 flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-red hover:bg-brand-red-dark self-end rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
