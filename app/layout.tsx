import type { Metadata, Viewport } from "next";
import "./globals.css";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { HeaderSignOut } from "./HeaderSignOut";
import { safeJsonLd } from "../lib/jsonld";

const APP_URL = process.env.APP_URL || "https://dealer.wheewise.com";

// Static, no dealer-entered text involved — see apps/user-app's identical
// helper's rationale for why this still goes through the same escape.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Wheewise Dealer",
  url: APP_URL,
  logo: `${APP_URL}/icon-512.png`,
};

const TITLE = "Wheewise Dealer — Sell Your Car Online, List Your Pre-Owned Inventory";
const DESCRIPTION =
  "Your digital pre-owned car shop. List, manage, and sell your second-hand car, bike, and commercial vehicle inventory to verified buyers across India — GST-verified onboarding, free to start.";

// Individual pages opt into noindex (dashboard, onboarding, login) — the
// root default stays indexable so the one real public page (/signup) can
// actually rank for "sell your car" style searches, which a blanket
// noindex here previously blocked entirely, on every page, app-wide.
export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: TITLE, template: "%s | Wheewise Dealer" },
  description: DESCRIPTION,
  keywords: [
    "sell your car online",
    "digital pre-owned car shop",
    "second hand car shop",
    "list vehicle inventory",
    "become a car dealer online",
  ],
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Wheewise Dealer" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Wheewise Dealer",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#dc2626",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(organizationJsonLd) }} />
        <header className="flex items-center justify-between border-b border-border-default px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-header.png" alt="Wheewise" className="h-8 w-auto" />
          {user ? <HeaderSignOut /> : null}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
