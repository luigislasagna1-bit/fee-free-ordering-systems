import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { findBetterDeal } from "@/lib/voice/day-deals";
import { findSizeMatch } from "@/lib/voice/item-family";
import { loadRawItem, loadComboData, shapeItemData } from "@/lib/voice/item-loader";
import { buildLineCore, type BuildLineKind, type BuildLineLoaders } from "@/lib/voice/build-line-core";

export const runtime = "nodejs";

/**
 * POST /api/internal/voice/build-line
 *
 * Turns a spoken INTENT into a validated `/api/orders` line.
 *
 * The language model never hand-assembles the wire format. It says what the
 * caller wants — "large, pepperoni on the left half, double mushroom" — and the
 * compiler here writes the payload, including the "(L.H) " prefixes whose
 * trailing space the pricing engine matches on, the per-unit expansion for
 * doubles, the preset toppings that stop a preset pizza billing below list, and
 * the required-group defaults the order route never enforces.
 *
 * Anything it can't resolve confidently comes back in `unresolved[]` so the
 * agent ASKS instead of guessing — an invented option id is a hard 400 on the
 * item path and is silently dropped on a combo child.
 *
 * Body: { slug, kind: "item" | "pizza" | "combo", intent, askGroupIds?, offerDeals? }
 *
 * This file is a thin wrapper: it authenticates, finds the restaurant, and
 * hands Prisma-backed loaders to `buildLineCore`, which owns every decision
 * (kind gates, the size-family swap, the day-deal check) and is unit-tested
 * with in-memory loaders.
 */
export async function POST(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "bad_json" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").toLowerCase().trim();
  const kind = String(body.kind ?? "") as BuildLineKind;
  const askGroupIds = Array.isArray(body.askGroupIds)
    ? (body.askGroupIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  if (!slug) return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  if (kind !== "item" && kind !== "pizza" && kind !== "combo") {
    return NextResponse.json({ error: "kind must be item|pizza|combo", code: "bad_kind" }, { status: 400 });
  }
  const intent = (body.intent && typeof body.intent === "object" ? body.intent : {}) as Record<string, unknown>;
  if (!String(intent.menuItemId ?? "").trim()) {
    return NextResponse.json({ error: "Missing menuItemId", code: "missing_item" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: { id: true, currency: true, timezone: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });
  }

  const menuRestaurantId = await resolveMenuRestaurantId(restaurant.id);

  // One raw row per id for the life of this request: the core asks for the
  // item, may ask whether it is a combo, and may ask for a size sibling — each
  // is a distinct id or a repeat of one already loaded, never a second query
  // for the same row. This is the critical path of a live phone call.
  const rawCache = new Map<string, Awaited<ReturnType<typeof loadRawItem>>>();
  const getRaw = async (id: string) => {
    if (!rawCache.has(id)) rawCache.set(id, await loadRawItem(menuRestaurantId, id));
    return rawCache.get(id) ?? null;
  };

  const loaders: BuildLineLoaders = {
    item: async (id) => {
      const raw = await getRaw(id);
      return raw ? shapeItemData(raw) : null;
    },
    combo: async (id) => {
      const raw = await getRaw(id);
      return raw ? loadComboData(menuRestaurantId, raw) : null;
    },
    sizeMatch: async ({ item, intent, namedSubtotal, timezone }) =>
      findSizeMatch({
        menuRestaurantId,
        item,
        raw: await getRaw(item.menuItemId),
        intent,
        namedSubtotal,
        timezone,
      }),
    betterDeal: async (args) => findBetterDeal({ ...args, menuRestaurantId, kind: args.kind }),
  };

  const out = await buildLineCore(
    {
      kind,
      intent,
      askGroupIds,
      offerDeals: body.offerDeals === true,
      currency: restaurant.currency,
      timezone: restaurant.timezone,
    },
    loaders,
  );
  return NextResponse.json(out.body, { status: out.status });
}
