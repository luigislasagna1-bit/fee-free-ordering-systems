import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [recipients, restaurant] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        customerEmailPickupReady: true,
        customerEmailDeliveryReady: true,
        customerEmailDineInReady: true,
        customerEmailOrderRejected: true,
        customerEmailOrderConfirm: true,
      },
    }),
  ]);

  return NextResponse.json({ recipients, customerEmail: restaurant });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, name } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  const cleanEmail = email.trim().toLowerCase().slice(0, 254);

  const existing = await prisma.notificationRecipient.findFirst({
    where: { restaurantId, email: cleanEmail },
  });
  if (existing) return NextResponse.json({ error: "This email is already a recipient." }, { status: 409 });

  const created = await prisma.notificationRecipient.create({
    data: {
      restaurantId,
      email: cleanEmail,
      name: name ? String(name).trim().slice(0, 100) : null,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
