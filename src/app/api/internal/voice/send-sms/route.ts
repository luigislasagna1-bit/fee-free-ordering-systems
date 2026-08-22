import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import { sendSms } from "@/lib/sms";
import { formatCurrency } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * POST /api/internal/voice/send-sms  (x-internal-key)
 * The `send_sms_link` tool + confirmation/text-back sender. Texts the caller
 * the owner's configured VoiceTextLink for that kind when there is one, else a
 * BRANDED link (their online-order page, menu, reservation, support, or an
 * order receipt) built from restaurantOrderUrl() — so it's always live on our
 * own hosted pages and never 404s like Loman's dead GloriaFood links.
 *
 * Body: { restaurantId?, slug?, to, linkType, orderId? }
 */
export async function POST(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const to = String(body.to || "").trim();
  const linkType = String(body.linkType || "").trim();
  if (!to || !linkType) {
    return NextResponse.json({ error: "Missing to/linkType", code: "bad_request" }, { status: 400 });
  }

  const r = await prisma.restaurant.findFirst({
    where: { OR: [{ id: body.restaurantId || undefined }, { slug: body.slug || undefined }], isActive: true },
    select: { id: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true, name: true, phone: true, currency: true },
  });
  if (!r) return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });

  const urlInfo = { slug: r.slug, subdomain: r.subdomain, customDomain: r.customDomain, customDomainStatus: r.customDomainStatus };

  // Owner-configured text link (Nabil dashboard → FAQ & Links) wins for the
  // kinds it can express; the branded restaurantOrderUrl() stays the fallback
  // whenever no active row has a url, so an SMS can never end up link-less.
  // `receipt` is deliberately excluded: /status/<orderId> is a per-order
  // tracking URL no owner-supplied link can replace.
  const override = ["order_online", "menu", "reservation", "support"].includes(linkType)
    ? (
        await prisma.voiceTextLink.findFirst({
          where: { restaurantId: r.id, kind: linkType, active: true, url: { not: null } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { url: true },
        })
      )?.url ?? null
    : null;
  const link = () => override ?? restaurantOrderUrl(urlInfo);

  let msg: string;
  switch (linkType) {
    case "receipt": {
      // The order NUMBER belongs in the text, not in the caller's ear (Luigi
      // 2026-08-11: "it shouldn't tell order number by phone, it should text it
      // with the receipt"). A long digit string read aloud is the easiest thing
      // in the whole call to mishear, and the caller has nothing to write on.
      // So the text carries everything they'd want later: the number, what they
      // owe, and a live tracking link.
      const num = typeof body.orderNumber === "string" && body.orderNumber.trim()
        ? String(body.orderNumber).trim()
        : null;
      const amount =
        typeof body.total === "number" && Number.isFinite(body.total)
          ? formatCurrency(body.total, r.currency || "usd")
          : null;
      const track = body.orderId ? restaurantOrderUrl(urlInfo, `/status/${body.orderId}`) : null;
      msg =
        [
          num ? `${r.name} — order ${num} confirmed.` : `Thanks for your ${r.name} order!`,
          amount ? `Total ${amount}.` : "",
          track ? `Track it: ${track}` : restaurantOrderUrl(urlInfo),
        ]
          .filter(Boolean)
          .join(" ");
      break;
    }
    case "tracking": {
      // A5: the live status page of an order the caller asked about (any
      // channel) — found by lookup_recent_orders, never typed by the model.
      if (!body.orderId) {
        return NextResponse.json({ error: "orderId required for tracking", code: "bad_request" }, { status: 400 });
      }
      const order = await prisma.order.findFirst({
        where: { id: String(body.orderId), restaurantId: r.id },
        select: { id: true, orderNumber: true },
      });
      if (!order) return NextResponse.json({ error: "Order not found", code: "not_found" }, { status: 404 });
      msg = `${r.name} — track your order ${order.orderNumber}: ${restaurantOrderUrl(urlInfo, `/status/${order.id}`)}`;
      break;
    }
    case "menu":
      msg = `${r.name} menu & online ordering: ${link()}`;
      break;
    case "reservation":
      msg = `Book a table at ${r.name}: ${link()}`;
      break;
    case "support":
      msg = `${r.name}${r.phone ? ` — call us at ${r.phone}` : ""}: ${link()}`;
      break;
    case "order_online":
    default:
      msg = `Order online at ${r.name}: ${link()}`;
      break;
  }

  // sendSms RETURNS {sent:false, reason} — it does not throw. So the old
  // try/catch never caught anything and this route answered ok:true for every
  // failure there is: Twilio env vars missing, an unusable phone number, a 4xx
  // from Twilio. The voice service trusts that flag (`receiptTexted = !!sms.ok`,
  // tools.ts) and, believing the text went out, has Nabil tell the caller their
  // receipt has been sent instead of reading the total aloud. So the one case
  // where the customer most needs to hear the number is the case where we
  // silently stopped saying it.
  //
  // Same lesson as the email transport on 2026-08-01: report what actually
  // happened, never what was merely attempted. Caught in the Nabil completeness
  // sweep, 2026-08-12.
  try {
    const result = await sendSms({ to, body: msg });
    if (!result.sent) {
      console.error(`[voice/send-sms] NOT sent (${linkType}) — ${result.reason ?? "unknown"}`);
      return NextResponse.json({ ok: false, reason: result.reason ?? "not sent" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sid: result.sid });
  } catch (e) {
    // Defensive only — sendSms catches its own throws. Keep it so an unexpected
    // one can never be reported as a success.
    console.error("[voice/send-sms] threw", e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
