/**
 * roles.ts â€” Canonical role helpers (mirror of the SQL functions in 088).
 *
 * After migration 088 only TWO roles exist in the database:
 *   'admin'      â†’ admin-equivalent (full access)
 *   'production' â†’ production-equivalent (production module only)
 *
 * The previous legacy strings ('ceo', 'operations_manager', 'shop_floor')
 * were migrated to the new pair and are no longer valid.
 */

export type CanonicalRole = "admin" | "production";
export type DbRole = "admin" | "production";

export const ADMIN_ROLES = ["admin"] as const;
export const PRODUCTION_ROLES = ["production"] as const;
export const ALL_DB_ROLES: DbRole[] = ["admin", "production"];

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

export function isProductionRole(role: string | null | undefined): boolean {
  return role === "production";
}

/** UI-friendly label for a role value. */
export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "production":
      return "Production";
    default:
      return role ?? "Unknown";
  }
}

/** True if a role assignment is allowed for newly-created users from the UI. */
export function isAssignableRole(role: string): role is CanonicalRole {
  return role === "admin" || role === "production";
}
