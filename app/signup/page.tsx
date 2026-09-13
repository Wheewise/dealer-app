import type { Metadata } from "next";
import { DealerSignupForm } from "./DealerSignupForm";

export const metadata: Metadata = {
  title: "Sell Your Car Online — Register Your Pre-Owned Car Shop",
  description:
    "Turn your dealership into a digital pre-owned car shop. List cars, bikes, and commercial vehicles, reach verified buyers across India, and manage inventory online — free to start, GST-verified onboarding.",
};

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="mb-2 text-xl font-semibold">Register your dealership</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Free to start — 3 months free once billing begins, then ₹299/month.
      </p>
      <DealerSignupForm />
    </div>
  );
}
