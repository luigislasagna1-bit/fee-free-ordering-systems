/**
 * AutopilotState helpers.
 *
 * The AutopilotState row is the GloriaFood-style master gate for all
 * autopilot marketing — masterEnabled flips the whole pillar on/off and
 * the per-campaign booleans gate individual campaigns underneath.
 *
 * The cron + the admin UI both go through these helpers so the
 * "master OR campaign disabled = skip" rule lives in exactly ONE place.
 *
 * One row per restaurant — upserted on first access. The first read for
 * a freshly-onboarded restaurant lazily creates the defaults
 * (everything OFF), so callers can rely on always getting a row back.
 */
import prisma from "@/lib/db";

export type AutopilotCampaignKind =
  | "second_order"
  | "reengagement"
  | "cart_abandonment";

/**
 * Returns the AutopilotState row for a restaurant, creating it on
 * first access with all toggles OFF. Idempotent — concurrent first-
 * access callers race-safely converge on the same row via Prisma's
 * upsert.
 *
 * Return type inferred from the Prisma client — we deliberately don't
 * import the AutopilotState type explicitly because Prisma 7's generated
 * model types aren't barrel-exported under the name `AutopilotState`
 * (only `AutopilotStateModel` is). Inference keeps the type accurate
 * without coupling to a private path.
 */
export async function getOrCreateAutopilotState(restaurantId: string) {
  return prisma.autopilotState.upsert({
    where: { restaurantId },
    update: {},
    create: { restaurantId },
  });
}

/**
 * True when the master toggle is on for this restaurant.
 * Returns false when the row doesn't exist (no auto-create — fast path
 * for cron lookups that don't want to mint rows for inactive shops).
 */
export async function isMasterEnabled(restaurantId: string): Promise<boolean> {
  const row = await prisma.autopilotState.findUnique({
    where: { restaurantId },
    select: { masterEnabled: true },
  });
  return !!row?.masterEnabled;
}

/**
 * True when BOTH the master toggle AND the specific campaign toggle
 * are on. Used by the cron to skip whole campaigns cleanly.
 */
export async function isCampaignEnabled(
  restaurantId: string,
  kind: AutopilotCampaignKind,
): Promise<boolean> {
  const row = await prisma.autopilotState.findUnique({
    where: { restaurantId },
    select: {
      masterEnabled: true,
      secondOrderEnabled: true,
      reEngageEnabled: true,
      cartAbandonmentEnabled: true,
    },
  });
  if (!row || !row.masterEnabled) return false;
  if (kind === "second_order") return row.secondOrderEnabled;
  if (kind === "reengagement") return row.reEngageEnabled;
  if (kind === "cart_abandonment") return row.cartAbandonmentEnabled;
  return false;
}

/**
 * Stamps the per-campaign lastRun timestamp on AutopilotState — used by
 * the cron for run-frequency dedup. Best-effort: silently swallows any
 * write failure so a hiccup here doesn't fail the send pipeline.
 */
export async function markCampaignRan(
  restaurantId: string,
  kind: AutopilotCampaignKind,
): Promise<void> {
  const now = new Date();
  const field =
    kind === "second_order"
      ? { lastSecondOrderRun: now }
      : kind === "reengagement"
        ? { lastReEngageRun: now }
        : { lastCartAbandonRun: now };
  try {
    await prisma.autopilotState.update({
      where: { restaurantId },
      data: field,
    });
  } catch (e) {
    console.error("[autopilot-state] markCampaignRan failed", { restaurantId, kind, e });
  }
}
