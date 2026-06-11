/**
 * GET / POST /api/admin/marketing-studio/smart-links
 *
 * Owner's trackable smart links. Restaurant scope is ALWAYS from the session.
 *   GET  → the restaurant's links + their scan/order/revenue counters + share URL.
 *   POST → create a link (auto base62 code, defaults to the order page).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { generateLinkCode, buildSmartLinkUrl } from "@/lib/marketing-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const links = await prisma.smartLink.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true, targetPath: true, isActive: true, scanCount: true, orderCount: true, revenueCents: true, createdAt: true },
  });
  return NextResponse.json({ links: links.map((l) => ({ ...l, url: buildSmartLinkUrl(l.code) })) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (name.length < 1) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  // Default the destination to the restaurant's ordering page; accept an
  // owner-supplied in-app path (must start with "/" so it stays on-platform).
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
  const rawTarget = typeof body.targetPath === "string" ? body.targetPath.trim() : "";
  const targetPath = rawTarget.startsWith("/") ? rawTarget.slice(0, 300) : `/order/${restaurant?.slug ?? ""}`;

  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  const code = await generateLinkCode();
  const link = await prisma.smartLink.create({
    data: {
      restaurantId,
      code,
      name,
      targetPath,
      utmSource: str(body.utmSource, 60),
      utmMedium: str(body.utmMedium, 60),
      utmCampaign: str(body.utmCampaign, 60),
      channelHint: str(body.channelHint, 40),
    },
    select: { id: true, code: true, name: true, targetPath: true, isActive: true, scanCount: true, orderCount: true, revenueCents: true, createdAt: true },
  });
  return NextResponse.json({ link: { ...link, url: buildSmartLinkUrl(link.code) } });
}
