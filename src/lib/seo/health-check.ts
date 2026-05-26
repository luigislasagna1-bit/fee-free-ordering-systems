/**
 * SEO health checker for the Google Ranking report.
 *
 * Returns the 7 "Critical success factors" GloriaFood shows on their
 * report screenshot, run against this restaurant's data + (optionally)
 * a live Google PageSpeed Insights probe.
 *
 * Output shape per check:
 *   { id, label, status, problemCount, hint? }
 *   status = "ok" | "fix" | "unknown"
 *   problemCount counts only when status === "fix"
 *
 * Designed to be cheap: pure data inspection except for `pageSpeed`
 * which fires ONE HTTP call to Google's free Insights API. We
 * tolerate slowness + failure on that call (it gracefully degrades
 * to "unknown" + a hint).
 *
 * No SerpAPI dependency — this is the "what the owner can audit
 * themselves" surface. The ranking-position TREND chart needs
 * SerpAPI; this checklist doesn't.
 */

import type { Restaurant } from "@/generated/prisma/client";

export type CheckStatus = "ok" | "fix" | "unknown";

export interface SeoCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** Count of distinct problems flagged. Renders as "Fix N problem(s)". */
  problemCount: number;
  /** One-liner explanation shown when status = "fix" or "unknown". */
  hint?: string;
}

/**
 * Run all 7 health checks for a restaurant. The Restaurant row should
 * include socialLinks + hostedSiteSettings + cuisineType + domain
 * fields. The optional `hasHostedSite` flag (from the entitlements
 * module) drives the structured-data check, since JSON-LD is only
 * emitted on /site/<slug> when the add-on is active.
 */
export async function runSeoHealthChecks(
  r: Pick<
    Restaurant,
    | "id"
    | "slug"
    | "name"
    | "description"
    | "cuisineType"
    | "phone"
    | "address"
    | "city"
    | "state"
    | "zip"
    | "socialLinks"
    | "subdomain"
    | "customDomain"
    | "customDomainStatus"
  >,
  opts: { hasHostedSite: boolean },
): Promise<SeoCheck[]> {
  const social = parseSocialLinks(r.socialLinks);

  // ─── 1. Content optimization ──────────────────────────────────────
  // We look for the basic SEO signals Google uses to rank a restaurant:
  // a name (always), description (paragraph-ish length), cuisine type
  // (powers our cuisine keyword targeting), and an address (powers
  // local-SEO knowledge-graph).
  const contentProblems: string[] = [];
  if (!r.description || r.description.trim().length < 40) {
    contentProblems.push("Add a 1-2 sentence description on the Profile page (≥40 chars)");
  }
  if (!r.cuisineType) {
    contentProblems.push("Set a cuisine type so the right keywords target your listing");
  }
  if (!r.address || !r.city) {
    contentProblems.push("Fill the full street address on Profile — local SEO needs city + street");
  }
  const contentCheck: SeoCheck = {
    id: "content",
    label: "Content optimization",
    status: contentProblems.length > 0 ? "fix" : "ok",
    problemCount: contentProblems.length,
    hint: contentProblems[0],
  };

  // ─── 2. Google Business listing ───────────────────────────────────
  // We can't actually probe Google Business — we'd need GMB API
  // access. Best signal we have: did the owner paste their GMB URL
  // into the social links field? If yes, they're aware of it. If no,
  // surface a "go claim your listing" nudge.
  const gmbCheck: SeoCheck = social.googleBusiness
    ? { id: "gmb", label: "Google Business listing", status: "ok", problemCount: 0 }
    : {
        id: "gmb",
        label: "Google Business listing",
        status: "fix",
        problemCount: 1,
        hint: "Claim your free Google Business Profile and paste the link in Profile → Social Links",
      };

  // ─── 3. Google Page Speed Test ────────────────────────────────────
  // ONE live HTTP call to Google's free PageSpeed Insights API. The
  // /v5/runPagespeed endpoint doesn't require an API key for limited
  // use. We score "ok" at 80+, "fix" at <80, "unknown" on failure.
  const pageSpeedCheck = await runPageSpeedCheck(r);

  // ─── 4. Domain name ───────────────────────────────────────────────
  // Pure data check. Verified custom domain > subdomain > unconfigured.
  const domainCheck: SeoCheck =
    r.customDomain && r.customDomainStatus === "verified"
      ? { id: "domain", label: "Domain name", status: "ok", problemCount: 0 }
      : r.subdomain
        ? { id: "domain", label: "Domain name", status: "ok", problemCount: 0 }
        : {
            id: "domain",
            label: "Domain name",
            status: "fix",
            problemCount: 1,
            hint: "Set a subdomain or connect your own domain on Setup → Publishing",
          };

  // ─── 5. Security ──────────────────────────────────────────────────
  // We always serve HTTPS — Vercel issues Let's Encrypt for both
  // wildcard subdomains AND custom domains automatically. The only
  // way "security" would be in a bad state is mid-verification on a
  // custom domain (status !== "verified" while customDomain is set).
  const securityCheck: SeoCheck =
    r.customDomain && r.customDomainStatus !== "verified"
      ? {
          id: "security",
          label: "Security (HTTPS / SSL)",
          status: "fix",
          problemCount: 1,
          hint: "Custom domain SSL not provisioned yet — finish DNS verification on Setup → Publishing",
        }
      : { id: "security", label: "Security (HTTPS / SSL)", status: "ok", problemCount: 0 };

  // ─── 6. Structured data ───────────────────────────────────────────
  // The hosted site (/site/<slug>) emits JSON-LD schema for
  // Restaurant + Menu + LocalBusiness. The plain order page
  // (/order/<slug>) doesn't currently. So this check is really
  // "do you have the Sales Optimized Website add-on?"
  const structuredCheck: SeoCheck = opts.hasHostedSite
    ? { id: "structured", label: "Structured data (JSON-LD)", status: "ok", problemCount: 0 }
    : {
        id: "structured",
        label: "Structured data (JSON-LD)",
        status: "fix",
        problemCount: 1,
        hint: "Subscribe to the Sales Optimized Website add-on to enable JSON-LD on your hosted page",
      };

  // ─── 7. Social media + local listings ─────────────────────────────
  // Count populated social-link fields. <2 = surface a "fix" with the
  // count of missing ones. We don't enforce SPECIFIC platforms because
  // the right mix varies by cuisine + market.
  const populatedSocials = Object.entries(social).filter(([, v]) => v && v.trim().length > 0).length;
  const socialCheck: SeoCheck =
    populatedSocials >= 2
      ? { id: "social", label: "Social media + local listings", status: "ok", problemCount: 0 }
      : {
          id: "social",
          label: "Social media + local listings",
          status: "fix",
          problemCount: Math.max(1, 2 - populatedSocials),
          hint: "Add at least 2 of Instagram / Facebook / Yelp / TripAdvisor on Profile → Social Links",
        };

  return [contentCheck, gmbCheck, pageSpeedCheck, domainCheck, securityCheck, structuredCheck, socialCheck];
}

/** Parse the JSON socialLinks field into a typed shape. Returns an
 *  empty object on malformed JSON so callers can use optional chaining. */
function parseSocialLinks(raw: string | null | undefined): Record<string, string | undefined> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

/** Build the public URL the PageSpeed API should hit. Prefers the
 *  hosted marketing site over the bare order page since that's the
 *  surface Google will actually rank. Returns null when the restaurant
 *  has no resolvable public URL yet (no subdomain, no custom domain). */
function publicUrlFor(r: { subdomain: string | null; customDomain: string | null; customDomainStatus: string; slug: string }): string | null {
  if (r.customDomain && r.customDomainStatus === "verified") {
    return `https://${r.customDomain}`;
  }
  const platform = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "feefreeordering.com";
  if (r.subdomain) return `https://${r.subdomain}.${platform}`;
  return null;
}

/**
 * Probe Google's PageSpeed Insights API for the restaurant's public
 * page. Free tier doesn't require an API key for reasonable rates.
 * We use the v5 endpoint with strategy=mobile (mobile-first is what
 * Google ranks on now).
 *
 * Errors are swallowed → "unknown" status with a hint that re-running
 * the scan should pick it up.
 */
async function runPageSpeedCheck(r: {
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  customDomainStatus: string;
}): Promise<SeoCheck> {
  const url = publicUrlFor(r);
  if (!url) {
    return {
      id: "pagespeed",
      label: "Google PageSpeed",
      status: "unknown",
      problemCount: 0,
      hint: "Configure a subdomain or custom domain to enable speed testing",
    };
  }
  try {
    const psi = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    psi.searchParams.set("url", url);
    psi.searchParams.set("strategy", "mobile");
    psi.searchParams.set("category", "performance");
    const res = await fetch(psi, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return {
        id: "pagespeed",
        label: "Google PageSpeed",
        status: "unknown",
        problemCount: 0,
        hint: `PageSpeed API returned ${res.status} — try again later`,
      };
    }
    const data = await res.json();
    const score = data?.lighthouseResult?.categories?.performance?.score;
    if (typeof score !== "number") {
      return {
        id: "pagespeed",
        label: "Google PageSpeed",
        status: "unknown",
        problemCount: 0,
        hint: "PageSpeed didn't return a performance score",
      };
    }
    const pct = Math.round(score * 100);
    if (pct >= 80) {
      return { id: "pagespeed", label: `Google PageSpeed (${pct})`, status: "ok", problemCount: 0 };
    }
    return {
      id: "pagespeed",
      label: `Google PageSpeed (${pct})`,
      status: "fix",
      problemCount: 1,
      hint: pct < 50 ? "Performance score is critical — heavy images or scripts on the hosted page" : "Performance below 80 — optimize images + reduce script weight",
    };
  } catch (err) {
    return {
      id: "pagespeed",
      label: "Google PageSpeed",
      status: "unknown",
      problemCount: 0,
      hint: `PageSpeed check failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
