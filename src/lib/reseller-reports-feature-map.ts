/**
 * A compact map of the platform's feature areas → the code that powers
 * them. Fed to Claude when it triages a reseller report so its
 * "likely affected area" suggestions point at real modules instead of
 * guessing blind (the live server can't see the source tree).
 *
 * Keep this current as the architecture moves — it's the difference
 * between "check the promotions code somewhere" and "check
 * src/lib/promo-engine.ts + /api/public/apply-promos".
 */
export const FEATURE_MAP = `
PLATFORM: multi-tenant restaurant ordering SaaS (Next.js 16 App Router, Prisma 7 + Postgres/Neon, NextAuth).

FEATURE AREAS → CODE:
- Customer ordering / cart / checkout: src/app/order/[slug] (OrderingPageClient). Cart, order-type selection, totals.
- Promotions (auto-apply rules): src/lib/promo-engine.ts + POST /api/public/apply-promos. Rules: min order, category/item BOGO, %/$ off, time-of-day windows, day-of-week. Cart items must carry categoryId to match category rules.
- Coupons (code-based): Coupon model + POST /api/public/coupon.
- Promotion BANNER on the customer page (the visual "PROMO / X% off" banner + its "pickup/delivery only" labels): rendered in the ordering page client from the restaurant's services + active promotions.
- Menu / categories / items: src/app/admin/menu. Modifier groups (library / category-level / item-level), variants.
- Services (pickup / delivery / dine-in / catering / takeout / reservations): boolean fields on Restaurant + serviceSettings JSON. Admin: /admin/services.
- Kitchen display: src/app/kitchen (polls every ~4s). Order tabs, status transitions, sounds.
- Receipt printing: src/lib/receipt.ts + receipt-schema.ts; PrintNode (/api/kitchen/printnode/print) and direct LAN (/api/kitchen/network-print). Star TSP143 specifics.
- Payments / Stripe: src/lib/stripe/*; Stripe Connect, webhooks (idempotent), marketplace settlement.
- Delivery (ShipDay) + delivery zones: DeliveryMap, zone polygons (Leaflet).
- Theme / website builder: src/lib/theme.ts, /admin/website (colors, carousel/grid layout, banner config).
- Email (Resend): src/lib/email.ts + src/emails/templates/* (React Email). Order confirmations, status updates, digests.
- Auth / sessions / roles: src/lib/session.ts, src/lib/roles.ts, edge logic in src/proxy.ts.
- Reseller program / commissions / white-label branding: src/app/reseller/*.
- Reservations: reservation models + confirmation emails.
- Promotions/coupons applied to an order are surfaced on receipts + confirmation emails.
`.trim();
