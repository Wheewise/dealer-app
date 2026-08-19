"use client";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmClassName = "bg-brand-red hover:bg-brand-red-dark",
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmClassName?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="border-border-default bg-background w-full max-w-sm rounded-t-2xl border-t p-5 sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-foreground text-lg font-bold">{title}</h3>
        <p className="mt-2 text-sm text-zinc-500">{message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border-border-default text-foreground hover:bg-surface-muted flex-1 rounded-md border px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${confirmClassName}`}
          >
            {pending ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
