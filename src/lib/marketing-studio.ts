/**
 * Marketing Studio core (Luigi 2026-06-10).
 *
 * Smart links are trackable /m/<code> redirects. A scan 302s to the restaurant's
 * ordering page (with ?ref=<code> + utm); the existing visit tracker stores the
 * ref on WebsiteVisit; when a visit carrying that ref later places an order,
 * `recordSmartLinkOrder` attributes it — bumping the link's order + revenue
 * counters EXACTLY once (idempotent claim, mirroring recordMarketplaceOrder).
 */
import crypto from "node:crypto";
import prisma from "@/lib/db";

/** Canonical platform base URL. Smart links ALWAYS use the primary domain — a
 *  tenant subdomain would be rewritten to /order/<slug>/m/<code> by the proxy
 *  and 404. */
export function platformBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(/\/$/, "");
}

/** Strip protocol + trailing slash for a clean, human-readable URL on a flyer. */
function displayUrl(u: string): string {
  return u.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/**
 * Best default "website" line for a flyer, derived from the restaurant: a
 * verified custom domain → their social-links website → the public ordering
 * page on the platform (always live, so a printed flyer never points at a dead
 * URL). Always editable in the flyer builder. Luigi 2026-06-11.
 */
export function flyerWebsiteDefault(r: {
  slug: string;
  customDomain?: string | null;
  customDomainStatus?: string | null;
  socialLinks?: string | null;
}): string {
  if (r.customDomain && r.customDomainStatus === "verified") return displayUrl(r.customDomain);
  try {
    const sl = r.socialLinks ? (JSON.parse(r.socialLinks) as Record<string, string>) : null;
    if (sl?.website) return displayUrl(sl.website);
  } catch {
    /* malformed socialLinks — fall through to the order page */
  }
  return `${displayUrl(platformBaseUrl())}/order/${r.slug}`;
}

// Unambiguous base62 (no 0/O/1/I/l) so a code printed on a flyer can't be misread.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomCode(len: number): string {
  const bytes = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

/** A globally-unique short code, with retry-on-conflict (the code carries no
 *  restaurant context so it must be unique platform-wide). */
export async function generateLinkCode(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode(7);
    const exists = await prisma.smartLink.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  return randomCode(11); // astronomically unlikely to collide
}

/** The shareable/QR URL for a smart link (primary domain). */
export function buildSmartLinkUrl(code: string): string {
  return `${platformBaseUrl()}/m/${code}`;
}

/**
 * Attribute an order to a smart link, exactly once. Mirrors
 * `recordMarketplaceOrder`'s atomic-claim idempotency so retries / status flips
 * never double-count. Internally safe — never throws into the order path.
 */
export async function recordSmartLinkOrder(opts: {
  orderId: string;
  refCode: string;
  restaurantId: string;
  revenueCents: number;
}): Promise<void> {
  try {
    const link = await prisma.smartLink.findFirst({
      where: { code: opts.refCode, restaurantId: opts.restaurantId },
      select: { id: true },
    });
    if (!link) return;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: opts.orderId, smartLinkCounterApplied: false },
        data: { smartLinkCounterApplied: true, smartLinkId: link.id },
      });
      if (claimed.count === 0) return; // already counted
      await tx.smartLink.update({
        where: { id: link.id },
        data: { orderCount: { increment: 1 }, revenueCents: { increment: Math.max(0, Math.round(opts.revenueCents)) } },
      });
    });
  } catch (e) {
    console.error("[marketing-studio recordSmartLinkOrder]", e);
  }
}

/**
 * Reverse a previous recordSmartLinkOrder when an attributed order is
 * rejected / cancelled / auto-rejected, so a smart link's Orders + Revenue
 * reflect only orders that actually stuck (matches what the marketplace
 * counters do via unrecordMarketplaceOrder). Reads the attributed link id off
 * the order (set at record time), so callers don't need the ref code.
 *
 * Idempotency mirrors record: atomically flips Order.smartLinkCounterApplied
 * true → false exactly once, then decrements the link counters — clamped at 0
 * so a manual DB edit can't push them negative. Internally safe — never throws
 * into the order path. Revenue is in CENTS (same unit record incremented).
 */
export async function unrecordSmartLinkOrder(opts: {
  orderId: string;
  orderTotalCents: number;
}): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: opts.orderId },
        select: { smartLinkId: true, smartLinkCounterApplied: true },
      });
      if (!order?.smartLinkId || !order.smartLinkCounterApplied) return;

      // Atomic release: only decrement if the flag is still true. updateMany
      // returns count=0 if another flip already released it.
      const released = await tx.order.updateMany({
        where: { id: opts.orderId, smartLinkCounterApplied: true },
        data: { smartLinkCounterApplied: false },
      });
      if (released.count === 0) return;

      const link = await tx.smartLink.findUnique({
        where: { id: order.smartLinkId },
        select: { orderCount: true, revenueCents: true },
      });
      if (!link) return;
      const dec = Math.max(0, Math.round(opts.orderTotalCents));
      await tx.smartLink.update({
        where: { id: order.smartLinkId },
        data: {
          orderCount: { decrement: link.orderCount > 0 ? 1 : 0 },
          revenueCents: { decrement: Math.min(link.revenueCents, dec) },
        },
      });
    });
  } catch (e) {
    console.error("[marketing-studio unrecordSmartLinkOrder]", e);
  }
}
