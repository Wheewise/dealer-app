import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export function Field({
  label,
  name,
  errors,
  hint,
  children,
}: {
  label: string;
  name: string;
  errors?: string[];
  hint?: ReactNode;
  children: ReactNode;
}) {
  const errorId = `${name}-error`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-foreground block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !errors?.length ? <p className="text-xs text-zinc-500">{hint}</p> : null}
      {errors?.length ? (
        <p id={errorId} className="text-brand-red text-xs">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

export function Input(
  props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean },
) {
  const { invalid, className = "", ...rest } = props;
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={`focus:border-brand-red focus:ring-brand-red/20 block w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-colors outline-none focus:ring-2 ${
        invalid ? "border-brand-red" : "border-border-default"
      } ${className}`}
    />
  );
}

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean },
) {
  const { invalid, className = "", children, ...rest } = props;
  return (
    <div className="relative">
      <select
        {...rest}
        aria-invalid={invalid || undefined}
        className={`focus:border-brand-red focus:ring-brand-red/20 bg-background text-foreground block w-full appearance-none rounded-md border px-3 py-2 pr-9 text-sm shadow-xs transition-colors outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          invalid ? "border-brand-red" : "border-border-default"
        } ${className}`}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
      >
        <path
          d="M5 7.5L10 12.5L15 7.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function Button({
  className = "",
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
}) {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2";
  const styles =
    variant === "primary"
      ? "bg-brand-red text-white hover:bg-brand-red-dark"
      : variant === "outline"
        ? "border border-border-default text-foreground hover:bg-surface-muted"
        : "text-foreground hover:bg-surface-muted";
  return <button {...props} className={`${base} ${styles} ${className}`} />;
}
