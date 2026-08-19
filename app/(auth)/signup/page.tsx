import Link from "next/link";
import type { Metadata } from "next";
import { BuyerSignupForm } from "./BuyerSignupForm";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Save vehicles, message dealers, and get price alerts.
        </p>
      </div>
      <BuyerSignupForm />
      <div className="border-border-default space-y-1 border-t pt-4 text-sm text-zinc-500">
        <div>
          Already have an account?{" "}
          <Link href="/login" className="text-brand-red font-medium hover:underline">
            Sign in
          </Link>
        </div>
        <div>
          Are you a dealer?{" "}
          <Link
            href="/signup/dealer"
            className="text-brand-red font-medium hover:underline"
          >
            Join as a dealer
          </Link>
        </div>
      </div>
    </div>
  );
}
