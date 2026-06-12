import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import { canAccessPath, isPublicAuthPath } from "@/lib/auth/route-access";
import { readSessionFromCookieValue } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const config = getAuthConfig();
  if (!config.enabled) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  const cookieValue = request.cookies.get(config.cookieName)?.value;
  const session = await readSessionFromCookieValue(cookieValue);

  if (isPublicAuthPath(pathname)) {
    if (pathname === "/auth/login" && session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessPath(pathname, session.role)) {
    const deniedUrl = new URL("/auth/denied", request.url);
    deniedUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(deniedUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
