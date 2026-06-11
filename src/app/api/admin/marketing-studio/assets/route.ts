/**
 * GET / POST /api/admin/marketing-studio/assets
 *
 * Saved flyers/posters. Session-scoped. designJson holds the owner inputs
 * (templateId, headline, offerText, smartLinkId) — branding + QR are pulled live
 * at render so the asset always reflects current branding.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { isFlyerTemplate } from "@/lib/marketing-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function parseDesign(body: Record<string, unknown>) {
  return {
    templateId: isFlyerTemplate(body.templateId) ? (body.templateId as string) : "bold",
    headline: String(body.headline ?? "").slice(0, 120),
    offerText: String(body.offerText ?? "").slice(0, 200),
    smartLinkId: typeof body.smartLinkId === "string" ? body.smartLinkId : null,
  };
}

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assets = await prisma.marketingAsset.findMany({
    where: { restaurantId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, type: true, designJson: true, smartLinkId: true, updatedAt: true },
  });
  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80) || "Flyer";
  const design = parseDesign(body);

  // Validate the chosen smart link belongs to this restaurant.
  let smartLinkId: string | null = null;
  if (design.smartLinkId) {
    const link = await prisma.smartLink.findFirst({ where: { id: design.smartLinkId, restaurantId }, select: { id: true } });
    smartLinkId = link?.id ?? null;
  }

  const asset = await prisma.marketingAsset.create({
    data: { restaurantId, type: "flyer", name, smartLinkId, designJson: JSON.stringify({ ...design, smartLinkId }) },
    select: { id: true, name: true, type: true, designJson: true, smartLinkId: true, updatedAt: true },
  });
  return NextResponse.json({ asset });
}
