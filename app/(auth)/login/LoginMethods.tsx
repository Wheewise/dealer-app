"use client";

import { useState } from "react";
import { EmailOtpLoginForm } from "./EmailOtpLoginForm";
import { OtpLoginForm } from "./OtpLoginForm";

export function LoginMethods() {
  const [method, setMethod] = useState<"email" | "phone">("email");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1" role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={method === "email"}
          className={`rounded-md px-3 py-2 text-sm font-medium ${method === "email" ? "bg-white shadow-sm" : "text-zinc-600"}`}
          onClick={() => setMethod("email")}
        >
          Email OTP · Recommended
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === "phone"}
          className={`rounded-md px-3 py-2 text-sm font-medium ${method === "phone" ? "bg-white shadow-sm" : "text-zinc-600"}`}
          onClick={() => setMethod("phone")}
        >
          SMS OTP
        </button>
      </div>
      {method === "email" ? <EmailOtpLoginForm /> : <OtpLoginForm />}
    </div>
  );
}
