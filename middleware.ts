import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const token = await sessionToken();
  if (token && req.cookies.get(SESSION_COOKIE)?.value === token) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Nie zalogowano." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // Everything except the login page/endpoint, Next's static assets, and the
  // manifest + icons (the browser fetches those without the session cookie).
  matcher: ["/((?!login|api/login|_next/|favicon.ico|manifest.webmanifest|icons/).*)"],
};
