import { NextResponse, type NextRequest } from "next/server";

const API_URL = process.env.HELPDESK_API_URL ?? "http://127.0.0.1:8100";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // /api/* -> the Python API. The extra header makes free ngrok tunnels pass API calls
  // through instead of showing their "browser warning" page (useful for a live demo).
  if (pathname.startsWith("/api/")) {
    const headers = new Headers(request.headers);
    headers.set("ngrok-skip-browser-warning", "1");
    return NextResponse.rewrite(new URL(`${pathname}${search}`, API_URL), { request: { headers } });
  }

  // The support dashboard needs a login. (The API checks the session on every call too.)
  if (!request.cookies.has("helpdesk_session")) {
    const url = new URL("/staff/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*", "/dashboard"],
};
