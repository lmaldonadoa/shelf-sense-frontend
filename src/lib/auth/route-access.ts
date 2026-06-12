import { roleMeetsMinimum, type UserRole } from "@/lib/auth/roles";

type RouteGuard = {
  pattern: RegExp;
  minimumRole: UserRole;
};

const ROUTE_GUARDS: RouteGuard[] = [
  { pattern: /^\/$/, minimumRole: "viewer" },
  { pattern: /^\/analytics(?:\/.*)?$/, minimumRole: "viewer" },
  { pattern: /^\/jobs\/new(?:\/.*)?$/, minimumRole: "editor" },
  { pattern: /^\/jobs\/[^/]+(?:\/.*)?$/, minimumRole: "viewer" },
  { pattern: /^\/ops(?:\/.*)?$/, minimumRole: "admin" },
  { pattern: /^\/configs(?:\/.*)?$/, minimumRole: "admin" },
  { pattern: /^\/admin(?:\/.*)?$/, minimumRole: "admin" },
  { pattern: /^\/accounts\/[^/]+\/api-keys(?:\/.*)?$/, minimumRole: "admin" },
  { pattern: /^\/accounts\/[^/]+\/inbound-whatsapp(?:\/.*)?$/, minimumRole: "admin" },
  { pattern: /^\/accounts\/[^/]+\/settings\/llm(?:\/.*)?$/, minimumRole: "admin" },
  { pattern: /^\/accounts\/[^/]+\/jobs\/maintenance(?:\/.*)?$/, minimumRole: "admin" },
  { pattern: /^\/accounts\/[^/]+\/(jobs|quality|preview)(?:\/.*)?$/, minimumRole: "viewer" },
  { pattern: /^\/accounts\/[^/]+\/(training|aliases|config|chains|semantic-knowledge|semantic-review|semantic-lab|playground|masterdata|shelf)(?:\/.*)?$/, minimumRole: "editor" },
];

export function isPublicAuthPath(pathname: string): boolean {
  return pathname === "/auth/login" || pathname === "/auth/denied" || pathname.startsWith("/api/auth/");
}

export function requiredRoleForPath(pathname: string): UserRole {
  const matched = ROUTE_GUARDS.find((guard) => guard.pattern.test(pathname));
  return matched?.minimumRole ?? "admin";
}

export function canAccessPath(pathname: string, role: UserRole): boolean {
  return roleMeetsMinimum(role, requiredRoleForPath(pathname));
}
