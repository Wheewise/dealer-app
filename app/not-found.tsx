import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <div className="bg-surface-muted flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo variant="wordmark" size={32} href="/" />
      <h1 className="mt-8 text-4xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-500">
        The link you followed may be broken, or the listing may have been removed by the
        dealer.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="bg-brand-red hover:bg-brand-red-dark rounded-md px-4 py-2 text-sm font-semibold text-white"
        >
          Back home
        </Link>
        <Link
          href="/browse"
          className="border-border-default bg-background hover:bg-surface-muted rounded-md border px-4 py-2 text-sm font-semibold"
        >
          Browse vehicles
        </Link>
      </div>
    </div>
  );
}
