import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { phoneDigitsKey } from "@/lib/phone";
import { VOICE_SENTINEL_DOMAIN } from "@/lib/voice/sentinel-identity";
import { MIN_AGREEING, nameHintFromRecentVoiceOrders } from "@/lib/voice/name-hint";

export const runtime = "nodejs";

/**
 * GET /api/internal/voice/returning-caller?slug=&phone=<E.164 or digits>
 *
 * The `lookup_returning_caller` tool. A cheap point lookup on
 * @@index([restaurantId, phoneDigits]) so Nabil can greet a returning caller by
 * name ("Welcome back, Maria") and offer a fast reorder of their usual. Also
 * reports whether the caller is on the block-list so the service can decline.
 *
 * 🚨 This used to say the phone "is passed already normalized by the voice
 * service", and match `phone` exactly. Both halves were false: the service
 * passes Twilio's raw E.164 (`+14168338405`) and checkout stores bare digits
 * (`4168338405`), so the lookup matched NOTHING and every caller looked new.
 * On 2026-08-13 that turned a three-order regular into a stranger who was asked
 * to recite the number we were holding, had her name taken down by
 * speech-to-text, and got a second Customer row. A comment asserting an
 * invariant nobody enforced is what let it ship — so the normalization now
 * happens HERE, on whatever arrives, and cannot be got wrong by a caller.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const sp = req.nextUrl.searchParams;
  const slug = (sp.get("slug") || "").toLowerCase().trim();
  const phone = (sp.get("phone") || "").trim();
  if (!slug) return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Missing phone", code: "missing_phone" }, { status: 400 });

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: { id: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });

  const digits = phoneDigitsKey(phone);

  const [blocked, candidates] = await Promise.all([
    // ⚠️ NOT normalized: BlockedCaller.phone is stored as "+" + digits behind a
    // @@unique([restaurantId, phone]), so this lookup wants the raw E.164 the
    // service sends. Canonicalizing here would quietly stop the block list
    // matching anyone.
    prisma.blockedCaller.findUnique({
      where: { restaurantId_phone: { restaurantId: restaurant.id, phone } },
      select: { id: true },
    }),
    digits
      ? prisma.customer.findMany({
          where: { restaurantId: restaurant.id, phoneDigits: digits },
          orderBy: { lastOrderAt: "desc" },
          // A few, not one: the same person can have more than one row (a voice
          // sentinel twin from before this was fixed, a guest row beside an
          // account row), and `orderBy` alone would hand back whichever ordered
          // most recently — which for a fork is the WRONG one, carrying the
          // speech-to-text name and none of the history.
          take: 5,
          select: { id: true, name: true, email: true, totalOrders: true, lastOrderAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Prefer a real customer record over a voice sentinel twin — but only when
  // there is exactly one. A shared household or work line can sit behind
  // several customers, and greeting the caller as the wrong one ("Welcome back,
  // Maria") then offering "the usual" from somebody else's order history is a
  // privacy leak dressed up as a nice touch. Better to treat them as new.
  const real = candidates.filter((c) => !(c.email ?? "").endsWith(VOICE_SENTINEL_DOMAIN));
  const customer = real.length === 1 ? real[0] : real.length === 0 ? (candidates[0] ?? null) : null;

  if (!customer) {
    // We can't say WHO this is — but we may still know what we called them last
    // time they phoned. A name off OUR OWN previous voice tickets for this exact
    // number is not somebody else's record, and it is offered to the caller as a
    // question ("Is this for Sam?"), never stated as fact. Worth it: on
    // 2026-08-14 a caller was asked three times and the ticket still went out
    // under a mis-heard name (Luigi approved this 2026-08-14).
    //
    // 🚨 But ONE ticket is not a name on file. On 2026-08-15 the last voice
    // order on Luigi's own line was "Dishen" (a tester), so Nabil greeted Sam
    // with "I have you down as Dishen?" — the "random" line he reported. A
    // shared household or work phone does the same. The hint now needs the last
    // MIN_AGREEING voice orders to agree (name-hint.ts); otherwise Nabil asks.
    const recent = digits
      ? await prisma.order.findMany({
          where: { restaurantId: restaurant.id, channel: "voice", customerPhone: { contains: digits } },
          orderBy: { createdAt: "desc" },
          take: MIN_AGREEING,
          select: { customerName: true },
        })
      : [];
    const hint = nameHintFromRecentVoiceOrders(recent.map((o) => o.customerName));
    return NextResponse.json({ found: false, blocked: !!blocked, ...(hint ? { nameHint: hint } : {}) });
  }

  // Compact last-order summary for a "the usual?" reorder prompt.
  const lastOrder = await prisma.order.findFirst({
    where: { restaurantId: restaurant.id, customerId: customer.id },
    orderBy: { createdAt: "desc" },
    select: {
      orderNumber: true,
      type: true,
      total: true,
      createdAt: true,
      items: { select: { quantity: true, name: true, variantName: true }, take: 12 },
    },
  });

  return NextResponse.json({
    found: true,
    blocked: !!blocked,
    // Kept by the voice session and written to VoiceCall.customerId at the
    // end log — the dashboard's caller-history join depends on it.
    customerId: customer.id,
    name: customer.name,
    orderCount: customer.totalOrders,
    lastOrderAt: customer.lastOrderAt ? customer.lastOrderAt.toISOString() : null,
    lastOrder: lastOrder
      ? {
          orderNumber: lastOrder.orderNumber,
          type: lastOrder.type,
          total: lastOrder.total,
          placedAt: lastOrder.createdAt.toISOString(),
          items: lastOrder.items.map((it) => ({
            quantity: it.quantity,
            name: it.name,
            variant: it.variantName ?? null,
          })),
        }
      : null,
  });
}
