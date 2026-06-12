import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import { buildSessionForUser, createSignedSessionValue } from "@/lib/auth/session";

type LoginBody = {
  email?: string;
  password?: string;
  next?: string;
};

function sanitizeNextPath(input: string | undefined): string {
  if (!input || !input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  if (input.startsWith("/api/auth/")) return "/";
  return input;
}

export async function POST(request: NextRequest) {
  const config = getAuthConfig();
  if (!config.enabled) {
    return NextResponse.json({ ok: false, error: "La autenticación todavía está desactivada." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as LoginBody;
  const email = body.email?.trim().toLowerCase() || "";
  const password = body.password || "";
  const redirectTo = sanitizeNextPath(body.next);

  const user = config.bootstrapUsers.find((entry) => entry.email === email && entry.password === password);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Credenciales inválidas." }, { status: 401 });
  }

  const session = buildSessionForUser({
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  });
  const signedValue = await createSignedSessionValue(session);

  const response = NextResponse.json({ ok: true, redirectTo });
  response.cookies.set({
    name: config.cookieName,
    value: signedValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });

  return response;
}
