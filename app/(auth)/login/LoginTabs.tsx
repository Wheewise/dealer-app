"use client";

import { useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { OtpLoginForm } from "./OtpLoginForm";

const isDev = process.env.NODE_ENV !== "production";

export function LoginTabs() {
  const [tab, setTab] = useState<"email" | "otp">("email");
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState("");
  const router = useRouter();

  const devSignIn = useCallback(async () => {
    setDevLoading(true);
    setDevError("");
    try {
      const result = await signIn("credentials", {
        email: "dev@wheewise.local",
        password: "ignored",
        dev: true,
        redirect: false,
      });
      if (result?.error) {
        setDevError(result.error);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setDevError("Dev sign-in failed");
    } finally {
      setDevLoading(false);
    }
  }, [router]);

  return (
    <div>
      <div className="mb-6 flex border-b">
        <button
          type="button"
          onClick={() => setTab("email")}
          className={`flex-1 pb-3 text-sm font-medium transition-colors ${
            tab === "email"
              ? "text-brand-red border-brand-red border-b-2"
              : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Email & Password
        </button>
        <button
          type="button"
          onClick={() => setTab("otp")}
          className={`flex-1 pb-3 text-sm font-medium transition-colors ${
            tab === "otp"
              ? "text-brand-red border-brand-red border-b-2"
              : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Phone OTP
        </button>
      </div>
      {tab === "email" ? <LoginForm /> : <OtpLoginForm />}

      {isDev ? (
        <div className="border-border-default mt-6 border-t pt-5">
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
            Dev tools
          </p>
          <button
            type="button"
            onClick={devSignIn}
            disabled={devLoading}
            className="mt-2 w-full rounded-md border border-dashed border-zinc-400 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-800"
          >
            {devLoading ? "Signing in…" : "Dev: Instant sign-in as dealer"}
          </button>
          {devError ? (
            <p className="mt-2 text-xs text-red-600">{devError}</p>
          ) : (
            <p className="mt-1.5 text-xs text-zinc-400">
              Auto-creates a dev dealer with store. Only works locally.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
