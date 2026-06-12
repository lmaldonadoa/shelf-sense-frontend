export const USER_ROLES = ["admin", "editor", "viewer"] as const;

export type UserRole = (typeof USER_ROLES)[number];

const ROLE_RANK: Record<UserRole, number> = {
  admin: 3,
  editor: 2,
  viewer: 1,
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function roleMeetsMinimum(role: UserRole, minimumRole: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

export function normalizeRoleLabel(role: UserRole): string {
  if (role === "admin") return "Admin";
  if (role === "editor") return "Editor";
  return "Viewer";
}
