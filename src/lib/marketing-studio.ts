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
