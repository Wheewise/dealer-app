import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BrandIntro } from "@/components/common/BrandIntro";
import { CookieConsent } from "@/components/ui/CookieConsent";
import { Footer } from "@/components/brand/Footer";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// middleware.ts issues a fresh crypto.randomUUID() nonce on every request
// for the CSP script-src. That only matches the <script> nonces actually
// baked into the HTML if this HTML is rendered fresh per-request too — a
// cached/statically-prerendered page keeps the nonce from whenever it was
// generated, while the CSP header always advertises a new one, so every
// script (including React's own hydration bundle) gets blocked as a CSP
// violation. Forcing dynamic rendering here (cascades to every route under
// this root layout) keeps the two in sync, at the cost of losing static
// generation/edge-cache for pages that would otherwise qualify.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://wheewise.com"),
  title: {
    default: "Wheewise — Where Smart Wheels Begin",
    template: "%s · Wheewise",
  },
  description:
    "India's dealer-first marketplace for pre-owned cars and bikes. One shareable link for your entire showroom — verified buyers, zero commission.",
  openGraph: {
    type: "website",
    siteName: "Wheewise",
    images: ["/brand/wheewise.png"],
  },
  icons: {
    icon: "/brand/wheewise.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <BrandIntro />
        {children}
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
