/**
 * Centralised RBAC. Import from `@/lib/rbac` — not from the sub-modules — so
 * there is one obvious place to look when auditing authorization.
 */
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_APP,
  isKnownRole,
  isAdminRole,
  permissionsFor,
  appFor,
  roleHasPermission,
  type Permission,
  type AppRole,
  type AppSurface,
} from "./permissions";

export {
  getAuthContext,
  hasPermission,
  permittedDealerIds,
  type AuthContext,
} from "./context";

export {
  AuthenticationError,
  AuthorizationError,
  requireAuthContext,
  requirePermission,
  requireAdminContext,
  requireDealerContext,
  assertDealerOwnership,
  assertUserOwnership,
  assertParticipant,
  guardAuthenticated,
  guardAdminPage,
  type DealerContext,
} from "./guards";

export {
  apiRequireAuth,
  apiRequirePermission,
  apiRequireDealer,
  apiRequireAdmin,
  apiNotFound,
  type ApiGate,
  type DealerApiGate,
} from "./api";

export { logSecurityEvent, logAuthzDenied, type SecurityEvent } from "./audit";
