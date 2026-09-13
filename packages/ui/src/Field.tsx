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
      <label htmlFor={name} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && !errors?.length ? <p className="text-xs text-zinc-500">{hint}</p> : null}
      {errors?.length ? (
        <p id={errorId} className="text-xs text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className = "", ...rest } = props;
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={`block w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:ring-2 focus:border-brand focus:ring-brand/20 ${
        invalid ? "border-danger" : "border-border-default"
      } ${className}`}
    />
  );
}

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean },
) {
  const { invalid, className = "", children, ...rest } = props;
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      className={`block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors focus:ring-2 focus:border-brand focus:ring-brand/20 ${
        invalid ? "border-danger" : "border-border-default"
      } ${className}`}
    >
      {children}
    </select>
  );
}

export function Button({
  className = "",
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    outline: "border border-border-default text-foreground hover:bg-surface-muted",
    ghost: "text-foreground hover:bg-surface-muted",
    danger: "text-danger hover:bg-danger/10",
  }[variant];
  return <button {...props} className={`${base} ${styles} ${className}`} />;
}
