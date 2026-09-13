"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Takes the browser Supabase client as a prop (via a factory) rather than
 * importing @wheewise/supabase directly here — @wheewise/supabase is a
 * peer, not a dependency of @wheewise/ui, so this stays decoupled from it. */
export function SignOutButton({
  signOut,
  className,
}: {
  signOut: () => Promise<void>;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOut();
        router.push("/login");
        router.refresh();
      }}
      className={className ?? "text-sm font-medium text-zinc-500 hover:text-brand hover:underline disabled:opacity-50"}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
