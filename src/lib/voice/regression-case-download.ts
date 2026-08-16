import "server-only";
import prisma from "@/lib/db";
import { buildRegressionScenario } from "@/lib/voice/regression-case";
import type { Scenario } from "@/lib/voice/sim/scenario-types";

/**
 * "Turn this call into a regression case" — the DB half, shared by the
 * restaurant route (/api/admin/phone-ordering/calls/[id]/regression-case,
 * scoped to the session's restaurant) and the superadmin route behind a
 * restaurant's call report (/api/superadmin/restaurant-reports/nabil/[id]/
 * regression-case). Both hand in the call id they already authorised; the
 * optional restaurantId is a second lock for the restaurant path.
 *
 * Returns null when the call doesn't exist (or isn't the restaurant's).
 */

/** A call is minutes long and the service caps events at 600; the cap here
 *  is a safety net, not a page size. */
const MAX_EVENTS = 2000;

export async function buildRegressionScenarioForCall(
  callId: string,
  restaurantId?: string,
): Promise<{ scenario: Scenario; call: { id: string } } | null> {
  const call = await prisma.voiceCall.findFirst({
    where: restaurantId ? { id: callId, restaurantId } : { id: callId },
    select: {
      id: true,
      restaurantId: true,
      callSid: true,
      startedAt: true,
      outcome: true,
      orderNumber: true,
      restaurant: { select: { slug: true } },
    },
  });
  if (!call) return null;

  const [events, order] = await Promise.all([
    prisma.voiceCallEvent.findMany({
      where: { callId: call.id, type: { in: ["asr", "cart"] } },
      orderBy: { seq: "asc" },
      take: MAX_EVENTS,
      select: { seq: true, type: true, turn: true, payload: true },
    }),
    call.orderNumber
      ? prisma.order.findFirst({
          where: { restaurantId: call.restaurantId, orderNumber: call.orderNumber },
          select: {
            type: true,
            items: {
              orderBy: { createdAt: "asc" },
              select: {
                menuItemId: true,
                name: true,
                variantName: true,
                quantity: true,
                bundleItems: true,
                modifiers: { select: { name: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  // Which of the ordered items (and combo children) are pizza-builder items —
  // decides whether an unprefixed modifier is a whole-pizza topping.
  const menuItemIds = new Set<string>();
  for (const it of order?.items ?? []) {
    if (it.menuItemId) menuItemIds.add(it.menuItemId);
    if (Array.isArray(it.bundleItems)) {
      for (const c of it.bundleItems as unknown[]) {
        const mid = c && typeof c === "object" ? (c as Record<string, unknown>).menuItemId : null;
        if (typeof mid === "string") menuItemIds.add(mid);
      }
    }
  }
  const pizzaRows = menuItemIds.size
    ? await prisma.menuItem.findMany({
        where: { id: { in: [...menuItemIds] }, restaurantId: call.restaurantId, pizzaConfig: { not: null } },
        select: { id: true },
      })
    : [];
  const pizzaItemIds = new Set(pizzaRows.map((r) => r.id));

  const scenario = buildRegressionScenario({
    callSid: call.callSid,
    startedAt: call.startedAt,
    outcome: call.outcome,
    restaurantSlug: call.restaurant.slug,
    events,
    order: order ? { type: order.type, items: order.items } : null,
    pizzaItemIds,
  });
  return { scenario, call: { id: call.id } };
}

/** The download response both routes return. */
export function regressionScenarioResponse(callId: string, scenario: Scenario): Response {
  const body = JSON.stringify(scenario, null, 2) + "\n";
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="nabil-regression-${callId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
