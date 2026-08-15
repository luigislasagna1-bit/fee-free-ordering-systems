import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../../../guard";
import { buildRegressionScenario } from "@/lib/voice/regression-case";

/**
 * GET /api/admin/phone-ordering/calls/[id]/regression-case
 *
 * "Turn this call into a regression case": downloads a sim Scenario JSON
 * (src/lib/voice/sim/scenario-types.ts) built from this call's event log —
 * the caller's real turns as the script, and the placed Order (or, failing
 * that, the last cart event) as the expected cart. Owner-authenticated and
 * scoped by the session's restaurantId — a call id alone is never trusted.
 * The file is meant to be reviewed and dropped under sim/scenarios/regressions.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A call is minutes long and the service caps events at 600; the cap here
 *  is a safety net, not a page size. */
const MAX_EVENTS = 2000;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;

  const { id } = await params;
  const call = await prisma.voiceCall.findFirst({
    where: { id, restaurantId },
    select: {
      id: true,
      callSid: true,
      startedAt: true,
      outcome: true,
      orderNumber: true,
      restaurant: { select: { slug: true } },
    },
  });
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [events, order] = await Promise.all([
    prisma.voiceCallEvent.findMany({
      where: { callId: call.id, type: { in: ["asr", "cart"] } },
      orderBy: { seq: "asc" },
      take: MAX_EVENTS,
      select: { seq: true, type: true, turn: true, payload: true },
    }),
    call.orderNumber
      ? prisma.order.findFirst({
          where: { restaurantId, orderNumber: call.orderNumber },
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
        where: { id: { in: [...menuItemIds] }, restaurantId, pizzaConfig: { not: null } },
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

  const body = JSON.stringify(scenario, null, 2) + "\n";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="nabil-regression-${call.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
