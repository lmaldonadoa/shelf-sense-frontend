import { isUserRole, type UserRole } from "@/lib/auth/roles";

export type BootstrapAuthUser = {
  email: string;
  password: string;
  role: UserRole;
  displayName: string;
  userId: string;
};

export type AuthConfig = {
  enabled: boolean;
  cookieName: string;
  secret: string;
  sessionDurationHours: number;
  bootstrapUsers: BootstrapAuthUser[];
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.trim().toLowerCase() === "true";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "user";
}

function parseBootstrapUsers(raw: string | undefined): BootstrapAuthUser[] {
  if (!raw?.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") return null;
        const item = entry as Record<string, unknown>;
        const email = typeof item.email === "string" ? item.email.trim().toLowerCase() : "";
        const password = typeof item.password === "string" ? item.password : "";
        const role = item.role;
        const displayName = typeof item.displayName === "string" && item.displayName.trim()
          ? item.displayName.trim()
          : email;
        const userId = typeof item.userId === "string" && item.userId.trim()
          ? item.userId.trim()
          : `${safeSlug(email || `user-${index + 1}`)}-${index + 1}`;

        if (!email || !password || !isUserRole(role)) return null;

        return {
          email,
          password,
          role,
          displayName,
          userId,
        } satisfies BootstrapAuthUser;
      })
      .filter((user): user is BootstrapAuthUser => user !== null);
  } catch {
    return [];
  }
}

export function getAuthConfig(): AuthConfig {
  return {
    enabled: parseBoolean(process.env.AUTH_ENABLED, false),
    cookieName: process.env.AUTH_COOKIE_NAME?.trim() || "shelfsense_auth",
    secret: process.env.AUTH_SECRET?.trim() || "change-me-before-enable",
    sessionDurationHours: parsePositiveInt(process.env.AUTH_SESSION_HOURS, 12),
    bootstrapUsers: parseBootstrapUsers(process.env.AUTH_BOOTSTRAP_USERS_JSON),
  };
}
