import type { Metadata } from "next";
import Link from "next/link";
import { OtpLoginForm } from "./OtpLoginForm";

export const metadata: Metadata = { title: "Dealer portal sign in" };

export default function LoginPage() {
  return (
    <div className="motion-reduce:animate-none space-y-6 animate-[ww-fade-up_300ms_ease-out]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dealer portal</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in to manage your inventory, leads and dealership.
        </p>
      </div>
      <OtpLoginForm />
      <div className="border-border-default border-t pt-4">
        <p className="text-sm text-zinc-500">
          New dealer?{" "}
          <Link href="/signup/dealer" className="text-brand-red font-medium hover:underline">
            Register your dealership
          </Link>
        </p>
      </div>
    </div>
  );
}
