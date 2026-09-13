import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <div className="rounded-xl border border-border-default bg-background p-6 shadow-sm sm:p-8">
        <h1 className="mb-6 text-center text-xl font-semibold">Dealer sign in</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-sm text-zinc-500">
        New dealer?{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">
          Register with your GST number
        </Link>
      </p>
    </div>
  );
}
