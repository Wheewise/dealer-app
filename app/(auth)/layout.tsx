import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-muted flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo size={36} />
      </div>
      <div className="border-border-default bg-background w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </div>
  );
}
