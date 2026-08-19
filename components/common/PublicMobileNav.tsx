"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/browse", label: "Browse" },
  { href: "/login", label: "Sign in" },
  { href: "/signup/dealer", label: "Join as a dealer" },
];

export function PublicMobileNav() {
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  function close() {
    setEntered(false);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="text-foreground hover:bg-surface-muted -mr-2 rounded-md p-2 md:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
              entered ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden="true"
            onClick={close}
          />
          <div
            className={`border-border-default bg-background absolute inset-y-0 right-0 flex w-64 max-w-[80vw] flex-col border-l shadow-xl transition-transform duration-200 ${
              entered ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="border-border-default flex h-14 items-center justify-between border-b px-4">
              <span className="text-foreground text-sm font-semibold">Menu</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={close}
                className="text-foreground hover:bg-surface-muted rounded-md p-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-4" onClick={close}>
              <ul className="space-y-1">
                {LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-foreground hover:bg-surface-muted block rounded-md px-3 py-2 text-sm font-medium"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
