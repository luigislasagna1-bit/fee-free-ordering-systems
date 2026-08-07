import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";

/**
 * POST /api/internal/voice/send-sms  (x-internal-key)
 * The `send_sms_link` tool + confirmation/text-back sender. Texts the caller a
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
    select: { slug: true, subdomain: true, customDomain: true, customDomainStatus: true, name: true, phone: true },
  });
  if (!r) return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });

  const urlInfo = { slug: r.slug, subdomain: r.subdomain, customDomain: r.customDomain, customDomainStatus: r.customDomainStatus };
  let msg: string;
  switch (linkType) {
    case "receipt":
      msg = body.orderId
        ? `Your ${r.name} order — track it here: ${restaurantOrderUrl(urlInfo, `/status/${body.orderId}`)}`
        : `Thanks for your ${r.name} order! ${restaurantOrderUrl(urlInfo)}`;
      break;
    case "menu":
      msg = `${r.name} menu & online ordering: ${restaurantOrderUrl(urlInfo)}`;
      break;
    case "reservation":
      msg = `Book a table at ${r.name}: ${restaurantOrderUrl(urlInfo)}`;
      break;
    case "support":
      msg = `${r.name}${r.phone ? ` — call us at ${r.phone}` : ""}: ${restaurantOrderUrl(urlInfo)}`;
      break;
    case "order_online":
    default:
      msg = `Order online at ${r.name}: ${restaurantOrderUrl(urlInfo)}`;
      break;
  }

  try {
    await sendSms({ to, body: msg });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[voice/send-sms] failed", e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
