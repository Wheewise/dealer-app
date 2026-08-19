/**
 * Billing feature flag. Payments aren't configured yet, so this stays off by
 * default (unset or any value other than "true") — dealers get free
 * unlimited access with no trial/subscription enforcement until billing is
 * switched on.
 */
export function isBillingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
}
