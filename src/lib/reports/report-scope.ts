import "server-only";
import { cache } from "react";
import prisma from "@/lib/db";

export type ReportScopeLocation = {
  id: string;
  name: string;
  city: string | null;
  isParent: boolean;
};

export type ReportScope = {
  /** Every restaurant id the report should cover (1 for a single store, N for a chain). */
  ids: string[];
  /** True when this is a brand PARENT rolling up across its locations. */
  isChain: boolean;
  /** The account's own restaurant id (the parent for a chain). */
  primaryId: string;
  /** Currency to format the rollup in (the parent's). */
  currency: string;
  /** Timezone to resolve ranges in (the parent's). null → server-local fallback. */
  timezone: string | null;
  brandName: string;
  /** The locations (parent first), for the per-location breakdown + pickers. */
  locations: ReportScopeLocation[];
  /** A child uses a different currency than the parent → totals are indicative. */
  mixedCurrency: boolean;
  /** A child uses a different timezone than the parent → daily split is approximate. */
  mixedTimezone: boolean;
};

/**
 * Resolve the reporting SCOPE for a restaurant id.
 *
 * For a brand PARENT (has child locations) the scope is the WHOLE chain — every
 * location's id — totalled in the parent's currency + timezone. For a single
 * restaurant it's just `[id]`. Every report page resolves this once and passes
 * `scope.ids` into `reportOrderWhere`, so a brand parent's reports roll up across
 * all locations instead of showing the parent's own (usually sparse) direct
 * orders. The widened `reportOrderWhere(string | string[])` does the rest.
 *
 * `cache()`-wrapped so the dashboard, its KPI links, the header + the
 * per-location table don't refetch within a single request.
 *
 * Multi-currency / multi-timezone chains: we total in the parent's currency/tz
 * and flag `mixedCurrency`/`mixedTimezone` so the UI can show an honest caveat
 * instead of silently mis-summing. FX conversion is deliberately deferred.
 */
export const resolveReportScope = cache(async (restaurantId: string): Promise<ReportScope> => {
  const parent = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, city: true, currency: true, timezone: true },
  });
  const currency = (parent?.currency || "usd").toLowerCase();
  const timezone = parent?.timezone ?? null;
  const brandName = parent?.name ?? "";

  const children = await prisma.restaurant.findMany({
    where: { parentRestaurantId: restaurantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, city: true, currency: true, timezone: true },
  });

  if (children.length === 0) {
    // Single restaurant (or a child location being viewed directly).
    return {
      ids: [restaurantId],
      isChain: false,
      primaryId: restaurantId,
      currency,
      timezone,
      brandName,
      locations: parent
        ? [{ id: parent.id, name: parent.name, city: parent.city, isParent: true }]
        : [],
      mixedCurrency: false,
      mixedTimezone: false,
    };
  }

  const locations: ReportScopeLocation[] = [
    { id: parent!.id, name: parent!.name, city: parent!.city, isParent: true },
    ...children.map((c) => ({ id: c.id, name: c.name, city: c.city, isParent: false })),
  ];
  const mixedCurrency = children.some((c) => (c.currency || "usd").toLowerCase() !== currency);
  const mixedTimezone = children.some((c) => (c.timezone ?? null) !== timezone);

  return {
    ids: locations.map((l) => l.id),
    isChain: true,
    primaryId: restaurantId,
    currency,
    timezone,
    brandName,
    locations,
    mixedCurrency,
    mixedTimezone,
  };
});
