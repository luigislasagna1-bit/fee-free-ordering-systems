/**
 * PATCH / DELETE /api/admin/marketing-studio/assets/[id]
 *
 * Update or delete a saved flyer. Restaurant-scoped writes (where pins
 * restaurantId from the session).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseDesign } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const design = parseDesign(body);

  let smartLinkId: string | null = null;
  if (design.smartLinkId) {
    const link = await prisma.smartLink.findFirst({ where: { id: design.smartLinkId, restaurantId }, select: { id: true } });
    smartLinkId = link?.id ?? null;
  }

  const data: { name?: string; smartLinkId: string | null; designJson: string } = {
    smartLinkId,
    designJson: JSON.stringify({ ...design, smartLinkId }),
  };
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);

  const res = await prisma.marketingAsset.updateMany({ where: { id, restaurantId }, data });
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const res = await prisma.marketingAsset.deleteMany({ where: { id, restaurantId } });
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
