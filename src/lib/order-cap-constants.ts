/**
 * FREE-plan constants, split out of order-cap.ts so they can be read WITHOUT pulling in
 * Prisma (Luigi 2026-08-14).
 *
 * order-cap.ts imports prisma + entitlements because it enforces the cap. The cap VALUE,
 * though, is just a number, and it is quoted in customer- and partner-facing copy — the
 * Marketing Kit prints "free for your first {cap} orders every month" on flyers handed to
 * restaurant owners. Importing the enforcement module to read a number would drag a database
 * client into a pure render path (and into any client bundle that touched it).
 *
 * ONE source of truth: order-cap.ts re-exports from here, so every existing importer keeps
 * working and the number can never drift between the copy and the enforcement.
 */

/**
 * Orders per calendar month on the FREE plan. Table reservations count toward the SAME pool
 * (Luigi 2026-06-14). Restaurants with ANY active paid add-on are exempt.
 *
 * ⚠️ Marketing copy must say "free for your first 100 orders every month", NOT "free
 * forever" — the reference flyers said the latter, which the product does not do.
 */
export const FREE_PLAN_MONTHLY_CAP = 100;
