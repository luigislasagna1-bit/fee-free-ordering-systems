/**
 * GET  /api/admin/customer-groups   — list this restaurant's VIP groups
 * POST /api/admin/customer-groups   — create a group
 *
 * VIP Customer Groups (Program 3, Luigi 2026-06-27): named groups of customers
 * (registered accounts AND/OR guest emails) the owner can assign a promotion to
 * all at once. Restaurant-scoped; free feature.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await prisma.customerGroup.findMany({
    where: { restaurantId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { members: true } },
    },
    take: 500,
  });
  return NextResponse.json({ groups });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  const description = body.description?.toString().slice(0, 500) || null;

  try {
    const group = await prisma.customerGroup.create({
      data: { restaurantId, name, description },
      select: { id: true, name: true },
    });
    return NextResponse.json({ ok: true, group });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A group with that name already exists." }, { status: 409 });
    }
    console.error("[customer-groups POST]", e);
    return NextResponse.json({ error: "Could not create the group" }, { status: 500 });
  }
}
