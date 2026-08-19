import Link from "next/link";
import type { Metadata } from "next";
import { DealerSignupForm } from "./DealerSignupForm";

export const metadata: Metadata = { title: "Join as a dealer" };

export default function DealerSignupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Join Wheewise as a dealer</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Get your shareable showroom link and 14 days free. No credit card.
        </p>
      </div>
      <DealerSignupForm />
      <div className="border-border-default border-t pt-4 text-sm text-zinc-500">
        Already a dealer?{" "}
        <Link href="/login" className="text-brand-red font-medium hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
