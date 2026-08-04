/**
 * Signed one-click unsubscribe (launch Blocker #6).
 *
 * Every marketing-class email (autopilot campaigns, kickstarter cold
 * invites) carries an RFC 8058 List-Unsubscribe header + footer link built
 * here. Before this, both pointed at the ordering page with `?unsubscribe=1`
 * — which NOTHING handled, so Gmail/Yahoo's one-click button was a silent
 * no-op (CAN-SPAM/CASL violation + a bulk-sender-rules deliverability risk
 * for the shared domain).
 *
 * The link is `/api/public/unsubscribe?token=<jwt>`: an HMAC-signed token
 * (NEXTAUTH_SECRET — same signer the customer-session cookies use) naming
 * exactly WHO is unsubscribing from WHAT, so the endpoint needs no session
 * and the link can't be forged or enumerated:
 *
 *   kind "customer" → Customer.marketingConsent=false (every row for that
 *                     email at that restaurant — duplicate guest rows too)
 *   kind "prospect" → Prospect.unsubscribedAt=now (the kickstarter cron
 *                     already skips prospects with it set)
 *
 * Long expiry (2 years): an unsubscribe link at the bottom of an old email
 * must keep working — CAN-SPAM requires ≥30 days, we give plenty.
 */
import jwt from "jsonwebtoken";
import prisma from "@/lib/db";
import { suppressEmail } from "@/lib/suppression";

const TOKEN_TTL = "730d";

export type UnsubscribePayload =
  | { k: "customer"; r: string; e: string }
  | { k: "prospect"; p: string; e: string };

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET must be set for unsubscribe-token signing");
  return s;
}

export function signUnsubscribeToken(payload: UnsubscribePayload): string {
  return jwt.sign({ t: "unsub", ...payload }, getSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  try {
    const d = jwt.verify(token, getSecret()) as any;
    if (d?.t !== "unsub") return null;
    if (d.k === "customer" && typeof d.r === "string" && typeof d.e === "string") return { k: "customer", r: d.r, e: d.e };
    if (d.k === "prospect" && typeof d.p === "string" && typeof d.e === "string") return { k: "prospect", p: d.p, e: d.e };
    return null;
  } catch {
    return null;
  }
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com").replace(/\/$/, "");
}

/** Absolute unsubscribe URL for a restaurant CUSTOMER (autopilot marketing).
 *  Pass `origin` (a branded restaurant origin, from restaurantOrigin().origin)
 *  to keep the link on the restaurant's own domain; falls back to platform. */
export function customerUnsubscribeUrl(args: { restaurantId: string; email: string; origin?: string }): string {
  const token = signUnsubscribeToken({ k: "customer", r: args.restaurantId, e: args.email.trim().toLowerCase() });
  const base = (args.origin || baseUrl()).replace(/\/$/, "");
  return `${base}/api/public/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Absolute unsubscribe URL for a kickstarter PROSPECT. */
export function prospectUnsubscribeUrl(args: { prospectId: string; email: string; origin?: string }): string {
  const token = signUnsubscribeToken({ k: "prospect", p: args.prospectId, e: args.email.trim().toLowerCase() });
  const base = (args.origin || baseUrl()).replace(/\/$/, "");
  return `${base}/api/public/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Flip the opt-out. Idempotent; returns the (possibly empty) affected count. */
export async function applyUnsubscribe(payload: UnsubscribePayload): Promise<{ ok: boolean }> {
  try {
    if (payload.k === "customer") {
      await prisma.customer.updateMany({
        // Email-keyed within the restaurant so duplicate guest/account rows
        // all flip together — one unsubscribe must silence every send path.
        where: { restaurantId: payload.r, email: payload.e },
        data: { marketingConsent: false, marketingConsentAt: new Date() },
      });
      // Unify: one do-not-email row silences the Prospect path too.
      await suppressEmail({
        restaurantId: payload.r,
        email: payload.e,
        reason: "unsubscribe",
        source: "autopilot_unsub",
      });
    } else {
      await prisma.prospect.updateMany({
        where: { id: payload.p },
        data: { unsubscribedAt: new Date() },
      });
      // Same person may appear in other imported lists — silence those too.
      await prisma.prospect.updateMany({
        where: { email: payload.e, unsubscribedAt: null },
        data: { unsubscribedAt: new Date() },
      });
      // Unify across the Customer path: write a suppression row for EVERY
      // restaurant this email is a prospect of (the primary by id — which
      // survives an email case-mismatch — plus any same-email dupes).
      const rows = await prisma.prospect.findMany({
        where: { OR: [{ id: payload.p }, { email: payload.e }] },
        select: { import: { select: { restaurantId: true } } },
      });
      const restaurantIds = [
        ...new Set(rows.map((r) => r.import?.restaurantId).filter((x): x is string => !!x)),
      ];
      await Promise.all(
        restaurantIds.map((restaurantId) =>
          suppressEmail({ restaurantId, email: payload.e, reason: "unsubscribe", source: "kickstarter_unsub" }),
        ),
      );
    }
    return { ok: true };
  } catch (e) {
    console.error("[unsubscribe] apply failed:", e);
    return { ok: false };
  }
}
