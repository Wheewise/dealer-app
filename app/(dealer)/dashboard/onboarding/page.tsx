"use client";

import { useRouter } from "next/navigation";

const STEPS = [
  {
    step: "1",
    title: "Add your first vehicle",
    desc: "List your first pre-owned vehicle to start attracting buyers",
    action: "/dashboard/inventory/new",
    label: "Add vehicle",
  },
  {
    step: "2",
    title: "Complete your shop profile",
    desc: "Add your shop logo, description and contact details",
    action: "/dashboard/store",
    label: "Edit profile",
  },
  {
    step: "3",
    title: "Share your showroom link",
    desc: "Share your unique link with customers on WhatsApp",
    action: "/dashboard",
    label: "View dashboard",
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="border-border-default bg-background rounded-lg border p-8">
        <div className="mb-8 text-center">
          <div className="bg-brand-red mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <span className="text-2xl">🎉</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Wheewise!</h1>
          <p className="mt-2 text-zinc-500">
            Your dealer account is ready. Let&apos;s get your showroom set up.
          </p>
        </div>

        <div className="mb-8 space-y-4">
          {STEPS.map((item) => (
            <div
              key={item.step}
              className="border-border-default bg-surface-muted flex items-start gap-4 rounded-lg border p-4"
            >
              <div className="bg-brand-red flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
                {item.step}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-zinc-500">{item.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => router.push(item.action)}
                className="bg-brand-red hover:bg-brand-red-dark flex-shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="border-border-default hover:bg-surface-muted w-full rounded-lg border py-3 font-medium text-zinc-500 transition-colors"
        >
          Skip to dashboard →
        </button>
      </div>
    </div>
  );
}
