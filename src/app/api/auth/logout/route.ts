import { NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";

export async function POST(request: Request) {
  const config = getAuthConfig();
  const response = NextResponse.redirect(new URL("/auth/login", request.url));
  response.cookies.set({
    name: config.cookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
