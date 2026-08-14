/**
 * Build a reseller's referral/signup URL on their MOST-BRANDED host — the partner
 * equivalent of restaurantOrderUrl() in src/lib/restaurant-url.ts, and modelled on it
 * deliberately so the two preference chains read the same way.
 *
 * WHY THIS EXISTS (Luigi 2026-08-14). The `/signup?ref=<code>` string was hand-rolled in
 * THREE places — src/app/reseller/profile/page.tsx, src/app/reseller/page.tsx, and
 * src/lib/reseller-application-notify.ts — and every one of them hardcoded
 * NEXT_PUBLIC_APP_URL. So a partner paying $19.99/mo for a custom domain was still being
 * shown, and still handing out, a feefreeordering.com link. Printing that on a flyer would
 * have made it permanent, which is what finally forced the fix.
 *
 * PURE + client-safe — no prisma, no server-only imports. The marketing-kit preview renders
 * this in the browser, so it must never pull prisma (→ node:module) into the client bundle.
 * Same discipline as src/lib/white-label.ts.
 *
 * ── The precedence chain MUST mirror /api/internal/resolve-host exactly ─────────────────
 * If it doesn't, we print a URL the proxy refuses to serve. Note the asymmetry, which is
 * easy to miss and expensive to get wrong:
 *   - custom domain  → requires whiteLabelTier === "full"   (resolve-host route.ts:194)
 *   - generic subdomain → does NOT require a tier           (resolve-host route.ts:162-164)
 * Both require status "approved" AND whiteLabelStatus "active".
 *
 * ── The path is ALWAYS /signup ──────────────────────────────────────────────────────────
 * A branded host's bare root rewrites to /login (src/proxy.ts — the pass-through carve-out
 * is /signup, /forgot-password, /reset-password, /verify-email). So printing a bare
 * "acme.com" on a flyer would send restaurateurs to a login screen they have no account for.
 *
 * ── ?ref= is ALWAYS appended, even on a branded host where it's redundant ────────────────
 * Three reasons, in ascending order of importance:
 *   1. It costs nothing visually — the human-readable line printed under a QR is
 *      displayUrl(), which strips both the protocol and the query.
 *   2. On a branded host the proxy passes an AUTHENTICATED visitor straight through with
 *      only an x-reseller-profile-id request header, which /signup never reads — so a
 *      prospect carrying any stale session cookie would sign up UNATTRIBUTED without it.
 *   3. It is the only thing that still works after a subscription lapses. A lapsed branded
 *      host stops resolving (resolve-host gates on whiteLabelStatus "active"); the graceful
 *      redirect added alongside this file forwards to the platform /signup PRESERVING the
 *      query, so ?ref= on already-printed paper keeps attributing. Without it, a partner's
 *      printed flyers become landfill the day they cancel.
 * No conflict with the branded-signup skin: src/app/signup/page.tsx prefers
 * resolveResellerBranding(?reseller=) over resolveResellerBrandingByRef(?ref=), so the
 * host-derived identity still wins when both are present.
 */

const PLATFORM_BASE = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(/\/+$/, "");

/** Bare host of the platform apex ("feefreeordering.com"), for building <sub>.<platform>. */
function platformHost(): string {
  try {
    return new URL(PLATFORM_BASE).host;
  } catch {
    return "feefreeordering.com";
  }
}

/** The fields the chain reads. Accepts a ResellerProfile row directly. */
export interface ResellerReferralUrlInfo {
  referralCode: string;
  status?: string | null;
  whiteLabelStatus?: string | null;
  whiteLabelTier?: string | null;
  customDomain?: string | null;
  /** "verified" means the domain is live + routable (ResellerProfile.customDomainStatus). */
  customDomainStatus?: string | null;
  genericSubdomain?: string | null;
}

export type ResellerReferralUrlKind = "custom" | "generic" | "platform";

export interface ResellerReferralUrl {
  /** Absolute URL for the QR code + copy-to-clipboard. Always carries ?ref=. */
  url: string;
  /** Protocol-less, query-less line for printing under a QR ("acme.com/signup"). */
  displayUrl: string;
  /** Bare origin host, e.g. "acme.com" — for a "your domain" label. */
  host: string;
  kind: ResellerReferralUrlKind;
  /**
   * True when the origin only resolves while the white-label subscription is active.
   * A printed asset carrying a perishable URL relies on the lapse redirect in src/proxy.ts
   * to keep working — surface it in the UI rather than letting it surprise someone.
   */
  perishable: boolean;
}

/** Lowercase, strip protocol/port/path/trailing dot and a leading "www.". */
function bareHostOf(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

function isApprovedActive(r: ResellerReferralUrlInfo): boolean {
  return r.status === "approved" && r.whiteLabelStatus === "active";
}

/**
 * Resolve the origin a reseller's signup link should live on.
 * Preference: verified custom domain (Full tier) → generic subdomain → platform apex.
 */
function resolveOrigin(r: ResellerReferralUrlInfo): { origin: string; kind: ResellerReferralUrlKind } {
  if (
    isApprovedActive(r) &&
    r.whiteLabelTier === "full" &&
    r.customDomainStatus === "verified" &&
    r.customDomain?.trim()
  ) {
    return { origin: `https://${bareHostOf(r.customDomain)}`, kind: "custom" };
  }
  if (isApprovedActive(r) && r.genericSubdomain?.trim()) {
    const sub = r.genericSubdomain.trim().toLowerCase();
    return { origin: `https://${sub}.${platformHost()}`, kind: "generic" };
  }
  return { origin: PLATFORM_BASE, kind: "platform" };
}

/**
 * The full referral URL a reseller shares — as a QR target, a copy-paste link, or an
 * email link. Always `<origin>/signup?ref=<referralCode>`.
 */
export function buildResellerReferralUrl(r: ResellerReferralUrlInfo): ResellerReferralUrl {
  const { origin, kind } = resolveOrigin(r);
  const code = encodeURIComponent(r.referralCode ?? "");
  return {
    url: `${origin}/signup?ref=${code}`,
    displayUrl: `${bareHostOf(origin)}/signup`,
    host: bareHostOf(origin),
    kind,
    perishable: kind !== "platform",
  };
}

/** Convenience: just the absolute URL (the common case at existing call sites). */
export function resellerReferralUrl(r: ResellerReferralUrlInfo): string {
  return buildResellerReferralUrl(r).url;
}

/** Convenience: just the printable line ("acme.com/signup"). */
export function resellerDisplayUrl(r: ResellerReferralUrlInfo): string {
  return buildResellerReferralUrl(r).displayUrl;
}

/**
 * Prisma select fragment for the fields the chain needs. Spread into any query whose
 * result is passed to buildResellerReferralUrl() so a caller can't silently omit a field
 * and quietly fall back to the platform apex — which is exactly the bug this file fixes.
 */
export const RESELLER_REFERRAL_URL_SELECT = {
  referralCode: true,
  status: true,
  whiteLabelStatus: true,
  whiteLabelTier: true,
  customDomain: true,
  customDomainStatus: true,
  genericSubdomain: true,
} as const;
