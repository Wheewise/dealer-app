import type { Metadata } from "next";
import Link from "next/link";
import { LoginTabs } from "./LoginTabs";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="motion-reduce:animate-none space-y-6 animate-[ww-fade-up_300ms_ease-out]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-zinc-500">Sign in to your Wheewise account.</p>
      </div>

      <LoginTabs />

      <div className="border-border-default space-y-4 border-t pt-4">
        <p className="text-sm text-zinc-500">
          New here?{" "}
          <Link
            href="/signup/start"
            className="text-brand-red motion-reduce:transition-none focus-visible:ring-brand-red/40 rounded-sm font-medium transition-colors duration-150 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Create account
          </Link>
        </p>

        <Link
          href="/signup/dealer"
          className="group border-brand-red/40 text-brand-red hover:border-brand-red hover:bg-brand-red/5 focus-visible:ring-brand-red/40 motion-reduce:transition-none flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
        >
          <span>Are you a dealer? Register your dealership</span>
          <span
            aria-hidden="true"
            className="motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 transition-transform duration-150 group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
      </div>
    </div>
  );
}
