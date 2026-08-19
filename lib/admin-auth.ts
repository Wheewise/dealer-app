import { guardAdminPage } from "@/lib/rbac";

/**
 * Page/layout-level guard for the /admin section — redirects on failure.
 *
 * Thin wrapper over the centralised `guardAdminPage`; kept so existing admin
 * layouts keep importing the same symbol. The throw-based equivalent for
 * server actions is `requireAdminContext` in `@/lib/rbac`.
 */
export async function requireAdmin() {
  return guardAdminPage();
}
