import { cookies } from "next/headers";
import { getAuthConfig } from "@/lib/auth/config";
import { readSessionFromCookieValue, type AuthSession } from "@/lib/auth/session";

export type AuthState = {
  enabled: boolean;
  session: AuthSession | null;
};

export async function getAuthState(): Promise<AuthState> {
  const config = getAuthConfig();
  if (!config.enabled) {
    return { enabled: false, session: null };
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(config.cookieName)?.value;
  const session = await readSessionFromCookieValue(cookieValue);
  return {
    enabled: true,
    session,
  };
}
