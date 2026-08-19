import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-border-default mt-auto border-t bg-white/40 px-4 py-8 text-xs text-zinc-500 dark:bg-zinc-950/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <div>© {year} Wheewise. Made in India.</div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/browse" className="hover:text-foreground">
            Browse
          </Link>
          <Link href="/community" className="hover:text-foreground">
            Community
          </Link>
          <Link href="/rc-transfer" className="hover:text-foreground">
            RC transfer
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a href="mailto:wheewise@gmail.com" className="hover:text-foreground">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
