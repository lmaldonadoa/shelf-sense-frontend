import { getAuthConfig } from "@/lib/auth/config";
import { isUserRole, type UserRole } from "@/lib/auth/roles";

export type AuthSession = {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  issuedAt: string;
  expiresAt: string;
};

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.userId === "string" &&
    typeof session.email === "string" &&
    typeof session.displayName === "string" &&
    typeof session.issuedAt === "string" &&
    typeof session.expiresAt === "string" &&
    isUserRole(session.role)
  );
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSignedSessionValue(session: AuthSession): Promise<string> {
  const { secret } = getAuthConfig();
  const payload = JSON.stringify(session);
  const signature = await signPayload(payload, secret);
  return `${encodeURIComponent(payload)}.${signature}`;
}

export async function readSessionFromCookieValue(cookieValue: string | undefined): Promise<AuthSession | null> {
  if (!cookieValue) return null;
  const lastDot = cookieValue.lastIndexOf(".");
  if (lastDot <= 0) return null;

  const encodedPayload = cookieValue.slice(0, lastDot);
  const signature = cookieValue.slice(lastDot + 1);
  if (!signature) return null;

  try {
    const payload = decodeURIComponent(encodedPayload);
    const { secret } = getAuthConfig();
    const expectedSignature = await signPayload(payload, secret);
    if (!timingSafeEqualHex(signature, expectedSignature)) return null;

    const parsed = JSON.parse(payload) as unknown;
    if (!isAuthSession(parsed)) return null;
    if (Date.parse(parsed.expiresAt) <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildSessionForUser(input: {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
}): AuthSession {
  const { sessionDurationHours } = getAuthConfig();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionDurationHours * 60 * 60 * 1000);

  return {
    userId: input.userId,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
