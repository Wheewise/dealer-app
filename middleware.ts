import { updateSession } from "@wheewise/supabase/middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return Response.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|wordmark.png|icon-mark.png|logo-header.png|icon.png|apple-icon.png|opengraph-image.png|manifest.webmanifest|icon-192.png|icon-512.png).*)",
  ],
};
