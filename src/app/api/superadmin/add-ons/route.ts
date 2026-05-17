import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const addOns = await prisma.addOn.findMany({ orderBy: { displayOrder: "asc" } });
  return NextResponse.json({ addOns });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any));
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 100);
  if (typeof body.description === "string") data.description = body.description.trim();
  if (typeof body.monthlyPriceCents === "number") data.monthlyPriceCents = Math.max(0, Math.floor(body.monthlyPriceCents));
  if (typeof body.yearlyPriceCents === "number") data.yearlyPriceCents = Math.max(0, Math.floor(body.yearlyPriceCents));
  if (typeof body.trialDays === "number") data.trialDays = Math.max(0, Math.floor(body.trialDays));
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body.displayOrder === "number") data.displayOrder = Math.floor(body.displayOrder);

  const updated = await prisma.addOn.update({ where: { id }, data });
  return NextResponse.json({ addOn: updated });
}
