import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Web Crypto is global in the Edge runtime — do not import node:crypto here.

function buildCsp(nonce: string): string {
  // Locked-down policy with a per-request nonce for inline scripts (used by
  // Next's hydration shim and JSON-LD blocks). 'strict-dynamic' lets the
  // nonce-allowed bootstrap pull in other scripts. R2 images, Razorpay
  // checkout, and Resend tracking pixels are explicitly allow-listed.
  const isDev = process.env.NODE_ENV !== "production";

  // React + Turbopack use eval() in dev for HMR and callstack reconstruction.
  // 'strict-dynamic' ignores host/source allowlists but NOT 'unsafe-eval',
  // so this only loosens eval and only in development.
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://checkout.razorpay.com",
    isDev ? "'unsafe-eval'" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const connectSrc = [
    "connect-src 'self'",
    "https://api.razorpay.com",
    "https://lumberjack.razorpay.com",
    isDev ? "ws: wss:" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    connectSrc,
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  // Surface the nonce to RSC so JSON-LD and inline scripts can read it.
  response.headers.set("x-nonce", nonce);
  return response;
}

export default function middleware(req: NextRequest) {
  // Per-request nonce. crypto.randomUUID is available on the edge runtime.
  const nonce = crypto.randomUUID().replace(/-/g, "");

  // Forward the nonce to downstream handlers via request header.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return withSecurityHeaders(response, nonce);
}

export const config = {
  // Cover all routes so CSP applies project-wide.
  // Exclude static + image-optimization paths that Next handles separately.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|robots.txt|sitemap.xml).*)",
  ],
};
