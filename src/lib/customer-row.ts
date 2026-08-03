/**
 * Deterministic Customer-row selection for (restaurantId, email) lookups.
 *
 * `(restaurantId, email)` is NOT unique on `Customer` — duplicate rows exist
 * in the wild (guest checkouts create a fresh row whenever a prior lookup
 * misses). Every site that resolves "the" Customer row for an email at a
 * restaurant MUST use the exact same ordering, or a gifted/earned balance can
 * land on row A while a later signup or gift-pass exchange hydrates row B,
 * silently stranding the money on an orphan row.
 *
 * Apply this at every findFirst/findMany that resolves a Customer by
 * (restaurantId, email) with more than one plausible match:
 *   - src/app/api/orders/route.ts (guest-order find-or-create)
 *   - src/app/api/restaurants/[slug]/account/signup/route.ts (signup hydrate)
 *   - src/app/api/admin/reward-gifts/route.ts (gift-create guest-twin resolve)
 *   - src/lib/gift-wallet-pass.ts (exchange guest-twin resolve)
 *
 * Preference order: an ACCOUNT row (passwordHash set) always wins over a
 * guest row — a real account should never be shadowed by a duplicate guest
 * row. Among rows that tie on that, the OLDEST row wins (stable, doesn't
 * shift as new orders create new guest rows), and `id` is the final
 * tiebreaker so the ordering is fully deterministic even with equal
 * `createdAt` timestamps.
 *
 * Where-clause semantics are NEVER touched by this — only ordering. Applying
 * this constant to an existing query is a no-op when only one row matches,
 * and deterministic (not just "still working by luck") when duplicates
 * exist.
 */
export const CUSTOMER_ROW_ORDER = [
  { passwordHash: { sort: "desc", nulls: "last" } },
  { createdAt: "asc" },
  { id: "asc" },
] as const;
