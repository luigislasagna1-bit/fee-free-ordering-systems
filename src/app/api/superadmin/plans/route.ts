import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";

export async function GET() {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { price: "asc" },
  });
  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { name, slug, price, interval, description, features, isActive } = body ?? {};

  if (!name || !slug || typeof price !== "number") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(String(slug))) {
    return NextResponse.json({ error: "Slug must be lowercase a-z, 0-9, hyphens only" }, { status: 400 });
  }

  // Features can be array or stringified JSON; persist as JSON string for now
  const featuresJson = Array.isArray(features) ? JSON.stringify(features) : (features ?? "[]");

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name,
      slug,
      price,
      interval: interval === "year" ? "year" : "month",
      description: description ?? null,
      features: featuresJson,
      isActive: isActive ?? true,
    },
  });
  return NextResponse.json({ plan });
}
