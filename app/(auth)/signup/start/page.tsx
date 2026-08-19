import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign up" };

const ROLES = [
  {
    href: "/signup",
    emoji: "🚗",
    title: "I'm buying a vehicle",
    subline: "Browse listings, save favourites, contact dealers",
  },
  {
    href: "/signup/dealer",
    emoji: "🏬",
    title: "I'm a dealer / showroom",
    subline: "List vehicles, manage inventory, get leads",
  },
] as const;

export default function SignupStartPage() {
  return (
    <div className="motion-reduce:animate-none space-y-6 animate-[ww-fade-up_300ms_ease-out]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Join Wheewise</h1>
        <p className="mt-1 text-sm text-zinc-500">First, tell us who you are.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ROLES.map((role) => (
          <Link
            key={role.href}
            href={role.href}
            className="group border-border-default hover:border-brand-red motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:ring-brand-red/40 bg-background flex flex-col gap-2 rounded-2xl border-2 p-5 text-left transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="text-3xl" aria-hidden="true">
              {role.emoji}
            </span>
            <span className="group-hover:text-brand-red text-base font-bold transition-colors duration-150">
              {role.title}
            </span>
            <span className="text-sm text-zinc-500">{role.subline}</span>
          </Link>
        ))}
      </div>

      <div className="border-border-default border-t pt-4 text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-brand-red focus-visible:ring-brand-red/40 rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
