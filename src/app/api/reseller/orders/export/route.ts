import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { toISODate } from "@/lib/reports/date-range";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";
import type { CsvCell } from "@/lib/reports/csv";
import { listScopeRestaurants, type OrdersScope } from "@/lib/reseller/scope";
import { fetchOrderFeed, FEED_STATUSES, FEED_TYPES, type FeedStatus, type FeedType } from "@/lib/reseller/order-feed";
import { EXPORT_FIELDS, parseExportFields, type ExportFieldId } from "@/lib/reseller/export-fields";

export const runtime = "nodejs";

/**
 * GET /api/reseller/orders/export
 *
 * The Orders List export. Re-derives scope + filters from the SAME query params
 * the screen uses, so the file always matches what the partner is looking at.
 *
 * Row-capped: the restaurant-side export is documented-unbounded, and a
 * cross-restaurant export multiplies that by the size of the portfolio. We cap
 * and say so in the file rather than risk an OOM mid-download.
 */
const EXPORT_ROW_CAP = 5000;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let scope: OrdersScope;
  let slug = "platform";
  if (user.role === "superadmin" || user.role === "platform_support") {
    scope = { kind: "platform" };
  } else if (isResellerView(user) && user.resellerProfileId) {
    scope = { kind: "reseller", resellerProfileId: user.resellerProfileId };
    const p = await prisma.resellerProfile.findUnique({
      where: { id: user.resellerProfileId },
      select: { status: true, companyName: true },
    });
    if (p?.status !== "approved") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    slug = (p.companyName || "partner").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "partner";
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = req.nextUrl;
  const sp: Record<string, string | string[] | undefined> = {};
  url.searchParams.forEach((v, k) => { if (!(k in sp)) sp[k] = v; });

  const restaurants = await listScopeRestaurants(scope);
  const anchorTz = restaurants[0]?.timezone ?? undefined;
  const range = parseDateRangeInTz(sp.preset || sp.from || sp.to ? sp : { ...sp, preset: "last_28" }, anchorTz);

  const statusRaw = url.searchParams.get("status");
  const status = (FEED_STATUSES as readonly string[]).includes(statusRaw ?? "") ? (statusRaw as FeedStatus) : null;
  // The export page allows MULTIPLE types (checkboxes); the list passes one.
  const typeRaw = url.searchParams.getAll("type").flatMap((v) => v.split(","));
  const types = typeRaw.filter((v): v is FeedType => (FEED_TYPES as readonly string[]).includes(v));

  const feed = await fetchOrderFeed({
    scope,
    range,
    q: url.searchParams.get("q")?.trim() || "",
    status,
    types: types.length > 0 ? types : null,
    restaurantId: url.searchParams.get("restaurant") || null,
    page: 1,
    size: EXPORT_ROW_CAP,
    noCap: true,
  });

  const fields = parseExportFields(url.searchParams.get("fields"));
  const labelById = new Map(EXPORT_FIELDS.map((f) => [f.id, f.label]));
  const header: CsvCell[] = fields.map((f) => labelById.get(f) ?? f);

  // The list rows carry display data; the money/meta detail columns need the
  // underlying records, fetched in two batched queries (never per row).
  const orderIds = feed.rows.filter((r) => r.kind === "order").map((r) => r.id);
  const resIds = feed.rows.filter((r) => r.kind === "reservation").map((r) => r.id);
  const [orderDetails, resDetails] = await Promise.all([
    orderIds.length
      ? prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: {
            id: true, subtotal: true, taxAmount: true, deliveryFee: true, tip: true, total: true,
            couponDiscount: true, promoDiscount: true, paymentStatus: true, channel: true, notes: true,
            customerEmail: true, customerPhone: true, acceptedAt: true, completedAt: true,
          },
        })
      : Promise.resolve([]),
    resIds.length
      ? prisma.reservation.findMany({
          where: { id: { in: resIds } },
          select: {
            id: true, partySize: true, depositAmount: true, preOrderTotal: true, notes: true,
            customerEmail: true, customerPhone: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const oMap = new Map(orderDetails.map((o) => [o.id, o]));
  const rMap = new Map(resDetails.map((r) => [r.id, r]));

  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");
  const rows: CsvCell[][] = feed.rows.map((r) => {
    const o = oMap.get(r.id);
    const rv = rMap.get(r.id);
    const pick = (f: ExportFieldId): CsvCell => {
      switch (f) {
        case "restaurantId": return r.restaurant.id;
        case "restaurantName": return r.restaurant.name;
        case "restaurantAddress": return r.restaurant.address;
        case "companyName": return r.restaurant.companyName;
        case "orderId": return r.ref;
        case "channel": return o?.channel ?? (r.kind === "reservation" ? "reservation" : "");
        case "type": return r.type;
        case "outcome": return r.status;
        case "customerName": return r.customerName;
        case "customerEmail": return o?.customerEmail ?? rv?.customerEmail ?? "";
        case "customerPhone": return o?.customerPhone ?? rv?.customerPhone ?? "";
        case "subtotal": return o?.subtotal ?? "";
        case "discount": return o ? (o.couponDiscount ?? 0) + (o.promoDiscount ?? 0) : "";
        case "deliveryFee": return o?.deliveryFee ?? "";
        case "tax": return o?.taxAmount ?? "";
        case "tip": return o?.tip ?? "";
        case "total": return r.total ?? "";
        case "currency": return r.currency.toUpperCase();
        case "paymentMethod": return r.paymentMethod ?? "";
        case "paymentStatus": return o?.paymentStatus ?? "";
        case "placedAt": return iso(r.placedAt);
        case "confirmedAt": return iso(o?.acceptedAt);
        case "fulfilledAt":
          return r.kind === "reservation"
            ? [r.reservationDate, r.reservationTime].filter(Boolean).join(" ")
            : iso(r.fulfilmentAt ?? o?.completedAt ?? null);
        case "guests": return rv?.partySize ?? "";
        case "deposit": return rv?.depositAmount ?? "";
        case "preOrder": return rv?.preOrderTotal ?? "";
        case "notes": return o?.notes ?? rv?.notes ?? "";
        default: return "";
      }
    };
    return fields.map(pick);
  });

  const metadata = [
    `Orders List export — ${restaurants.length} restaurant(s)`,
    `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ...(feed.total > rows.length
      ? [`NOTE: showing the first ${rows.length} of ${feed.total} records. Narrow the range or filter to export the rest.`]
      : []),
  ];

  return buildExportResponse({
    restaurantSlug: slug,
    reportSlug: "orders-list",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format: pickFormat(url),
    rows: [header, ...rows],
    metadata,
  });
}
