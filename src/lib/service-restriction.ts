/**
 * ONE definition of the pickup/delivery service restriction for menu items
 * and categories (Fabrizio report cmr803ovq, 2026-07-11). PURE — no prisma
 * import, so vitest can pin the semantics.
 *
 * The flags: forPickup / forDelivery (Prisma default true on both models).
 * Semantics: exactly ONE flag false = restricted to the other service.
 * Both true OR BOTH FALSE = NO restriction — unchecking both boxes means
 * "available for every service the restaurant offers", never "blocked".
 * (Both-false used to mean never-orderable; it was never surfaced in the
 * admin, produced a lying customer label, and duplicated the proper
 * Visibility→Hide feature — Fabrizio hit exactly this. Hidden categories
 * belong to Visibility, not service flags.)
 */

export type ServiceFlags = { forPickup?: boolean | null; forDelivery?: boolean | null };
export type ServiceKind = "pickupOnly" | "deliveryOnly" | null;
export type ServiceChannel = "pickup" | "delivery";

/** The entity's OWN restriction: null = unrestricted (both true or both false). */
export function serviceRestrictionKind(x: ServiceFlags | null | undefined): ServiceKind {
  const p = x?.forPickup !== false;
  const d = x?.forDelivery !== false;
  if (p === d) return null;
  return p ? "pickupOnly" : "deliveryOnly";
}

/** Can this entity be ordered via `service`? Both-false = yes for both. */
export function serviceAllows(x: ServiceFlags | null | undefined, service: ServiceChannel): boolean {
  const kind = serviceRestrictionKind(x);
  if (kind === null) return true;
  return service === "delivery" ? kind === "deliveryOnly" : kind === "pickupOnly";
}

/** The restriction that BLOCKS `service`, composing item ∧ category.
 *  Returns the blocking entity's kind (item checked first), or null when
 *  orderable. Missing category (= {}) stays permissive. */
export function blockingServiceKind(
  item: ServiceFlags | null | undefined,
  cat: ServiceFlags | null | undefined,
  service: ServiceChannel,
): ServiceKind {
  if (!serviceAllows(item, service)) return serviceRestrictionKind(item);
  if (!serviceAllows(cat, service)) return serviceRestrictionKind(cat);
  return null;
}

/** Write-side normalization for the save routes: an explicit both-false
 *  request becomes both-true (the canonical "no restriction" form), so the
 *  DB converges even though reads already treat both-false as unrestricted.
 *  Undefined keys are omitted — safe to spread into a Prisma PATCH data
 *  object without clobbering absent fields. */
export function normalizedServiceWrite(
  forPickup: boolean | undefined,
  forDelivery: boolean | undefined,
): { forPickup?: boolean; forDelivery?: boolean } {
  if (forPickup === false && forDelivery === false) return { forPickup: true, forDelivery: true };
  return {
    ...(forPickup !== undefined ? { forPickup: !!forPickup } : {}),
    ...(forDelivery !== undefined ? { forDelivery: !!forDelivery } : {}),
  };
}
