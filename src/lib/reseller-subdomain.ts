import prisma from "@/lib/db";
import { isReservedSubdomain, SUBDOMAIN_RE } from "@/lib/domains/reserved";

/**
 * Server-only reseller generic-subdomain provisioning (uses prisma). Split out of
 * src/lib/white-label.ts so THAT file stays pure + client-safe — isResellerWhiteLabel is
 * imported by client components (order status / menu / info pages), so white-label.ts must
 * never pull prisma (→ node:module) into the client bundle. Luigi 2026-06-23.
 */

/**
 * Slugify a reseller's company name into a candidate generic-subdomain base.
 * Lowercase, ASCII alphanumerics + hyphens only, collapse runs, strip leading/
 * trailing hyphens, then clamp to the subdomain length window (3–63). Returns
 * "" when nothing usable survives (caller substitutes a fallback). Mirrors the
 * format that validateSubdomainFormat() / SUBDOMAIN_RE accept so a generated
 * value is always claimable through the same rules a reseller types by hand.
 */
export function slugifySubdomainBase(companyName: string | null | undefined): string {
  let base = (companyName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-") // anything non-alnum/hyphen → hyphen
    .replace(/-+/g, "-")          // collapse runs
    .replace(/^-+|-+$/g, "");     // strip leading/trailing hyphens
  // Length window: SUBDOMAIN_RE allows 3–63. Trim to 63 first, then re-strip a
  // trailing hyphen the cut may have exposed.
  if (base.length > 63) base = base.slice(0, 63).replace(/-+$/g, "");
  if (base.length < 3) return "";
  return base;
}

/**
 * Pick a unique, non-reserved generic subdomain derived from `companyName`,
 * unique across BOTH ResellerProfile.genericSubdomain AND Restaurant.subdomain
 * (the schema notes app-enforced cross-table uniqueness — Prisma can't @@unique
 * across two tables). On a reserved base or any collision we append "-2", "-3",
 * … until a free label is found, re-clamping to 63 chars. When the company name
 * yields nothing usable, fall back to `reseller`. Pure read-only resolution —
 * the caller persists the result.
 */
export async function generateUniqueResellerSubdomain(
  companyName: string | null | undefined,
): Promise<string> {
  const fallback = "reseller";
  let base = slugifySubdomainBase(companyName) || fallback;
  // A reserved base can never stand alone; force it into the suffixed branch.
  const baseIsReserved = isReservedSubdomain(base);

  for (let n = 1; n < 1000; n++) {
    let candidate: string;
    if (n === 1 && !baseIsReserved) {
      candidate = base;
    } else {
      const suffix = `-${n + 1}`; // first suffixed attempt is "-2"
      const room = 63 - suffix.length;
      candidate = `${base.slice(0, room).replace(/-+$/g, "")}${suffix}`;
    }
    // Sanity: must satisfy the same format rule the manual claim path enforces.
    if (!SUBDOMAIN_RE.test(candidate) || isReservedSubdomain(candidate)) continue;

    const [restaurantClash, resellerClash] = await Promise.all([
      prisma.restaurant.findFirst({ where: { subdomain: candidate }, select: { id: true } }),
      prisma.resellerProfile.findFirst({ where: { genericSubdomain: candidate }, select: { id: true } }),
    ]);
    if (!restaurantClash && !resellerClash) return candidate;
  }
  // Exhausted the numeric space (absurd) — fall back to a random-ish label that
  // still satisfies the format, rather than throwing in a webhook path.
  return `${fallback}-${Date.now().toString(36).slice(-6)}`;
}

/**
 * Idempotently auto-provision a generic subdomain for a reseller whose
 * white-label just went ACTIVE, so a branded login/signup URL exists out of the
 * box. No-ops (returns the existing value) when `genericSubdomain` is already
 * set — NEVER overwrites a reseller's chosen subdomain, and safe under Stripe
 * webhook retries. Best-effort: the write is guarded so a race (P2002) or
 * transient error never fails the caller's critical path. Returns the subdomain
 * in effect after the call, or null if it couldn't provision one.
 */
export async function ensureResellerGenericSubdomain(
  resellerProfileId: string,
): Promise<string | null> {
  const profile = await prisma.resellerProfile.findUnique({
    where: { id: resellerProfileId },
    select: { genericSubdomain: true, companyName: true, whiteLabelStatus: true },
  });
  if (!profile) return null;
  // Only provision while active; never clobber an existing subdomain.
  if (profile.whiteLabelStatus !== "active") return profile.genericSubdomain ?? null;
  if (profile.genericSubdomain) return profile.genericSubdomain;

  const candidate = await generateUniqueResellerSubdomain(profile.companyName);
  try {
    // Conditional update: only stamp when STILL null, so concurrent webhook
    // retries can't fight over the column (the loser's updateMany matches 0
    // rows and re-reads the winner's value below).
    const res = await prisma.resellerProfile.updateMany({
      where: { id: resellerProfileId, genericSubdomain: null },
      data: { genericSubdomain: candidate },
    });
    if (res.count > 0) return candidate;
    // Lost the race — return whatever the winner stamped.
    const fresh = await prisma.resellerProfile.findUnique({
      where: { id: resellerProfileId },
      select: { genericSubdomain: true },
    });
    return fresh?.genericSubdomain ?? null;
  } catch (e: any) {
    // P2002 = the candidate collided after our pre-check (tiny race). Don't
    // fail the activation path over a vanity URL.
    console.error("[white-label] auto-subdomain provision failed", {
      resellerProfileId,
      candidate,
      code: e?.code,
    });
    return null;
  }
}
