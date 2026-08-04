/**
 * CASL consent-basis rules — the single source of truth for "may we send this
 * person a marketing email, and is that basis still valid?" Used by the
 * marketing chokepoint (src/lib/email.ts sendMarketingEmail), the prospect
 * import route, and the kickstarter cron so the 24-month window is defined ONCE.
 *
 * CASL implied-consent windows:
 *   - Existing Business Relationship (a purchase): 24 months from the purchase.
 *   - Inquiry / application: 6 months from the inquiry.
 *   - Express consent: no expiry (until withdrawn).
 */

export const EBR_MONTHS = 24; // existing business relationship (implied)
export const INQUIRY_MONTHS = 6; // inquiry / application (implied)

/** The Prisma ConsentBasis enum values (kept in sync with schema.prisma). */
export type ConsentBasisValue = "express" | "existing_business_relationship" | "inquiry";

/** Send-time consent basis for one recipient. */
export type MarketingConsentBasis =
  | { kind: "customer_optin" } // Customer.marketingConsent === true (already gated upstream)
  | { kind: "express" }
  | { kind: "existing_business_relationship"; relationshipDate?: Date | null }
  | { kind: "inquiry"; relationshipDate?: Date | null }
  // Prospect imports uploaded BEFORE the 2026-08-04 attestation gate shipped.
  // The owner chose to let these finish as-is (Luigi 2026-08-04); the new
  // attestation + 24-month rules apply only to NEW imports. Suppression still
  // applies, so anyone who unsubscribed/erased is skipped.
  | { kind: "grandfathered" };

export type ConsentCheck = "ok" | "stale" | "no_basis";

/** Month-accurate cutoff `months` before `from` (default now). */
export function monthsAgo(months: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() - months);
  return d;
}

/** Is this basis a valid reason to send right now? */
export function checkConsentBasis(
  basis: MarketingConsentBasis | null | undefined,
  now: Date = new Date(),
): ConsentCheck {
  if (!basis) return "no_basis";
  switch (basis.kind) {
    case "customer_optin":
    case "express":
    case "grandfathered":
      return "ok";
    case "existing_business_relationship":
      if (!basis.relationshipDate) return "stale";
      return basis.relationshipDate >= monthsAgo(EBR_MONTHS, now) ? "ok" : "stale";
    case "inquiry":
      if (!basis.relationshipDate) return "stale";
      return basis.relationshipDate >= monthsAgo(INQUIRY_MONTHS, now) ? "ok" : "stale";
    default:
      return "no_basis";
  }
}

/** Window (in months) an implied basis stays valid; null for express/opt-in. */
export function windowMonthsFor(basis: ConsentBasisValue): number | null {
  if (basis === "existing_business_relationship") return EBR_MONTHS;
  if (basis === "inquiry") return INQUIRY_MONTHS;
  return null; // express — no expiry
}

/** Build a send-time basis from an import's stored consentBasis + a row's date. */
export function basisFromImport(
  consentBasis: ConsentBasisValue | null | undefined,
  relationshipDate: Date | null | undefined,
): MarketingConsentBasis | null {
  if (!consentBasis) return null;
  if (consentBasis === "express") return { kind: "express" };
  return { kind: consentBasis, relationshipDate: relationshipDate ?? null };
}
