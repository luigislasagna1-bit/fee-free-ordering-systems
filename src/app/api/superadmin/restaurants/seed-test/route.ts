import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";

export async function POST() {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pick a unique slug like demo-test-001 / 002 / …
  const existing = await prisma.restaurant.findMany({
    where: { slug: { startsWith: "demo-test-" } },
    select: { slug: true },
  });
  const used = new Set(existing.map((r) => r.slug));
  let n = 1;
  while (used.has(`demo-test-${String(n).padStart(3, "0")}`)) n++;
  const slug = `demo-test-${String(n).padStart(3, "0")}`;
  const name = `Test Restaurant ${n}`;
  const email = `test${n}@example.com`;

  const restaurant = await prisma.restaurant.create({
    data: {
      name,
      slug,
      subdomain: slug, // matches default-subdomain convention
      email,
      subscriptionStatus: "trial",
      isActive: true,
    },
  });

  // Owner login with a known dev password
  const passwordHash = await bcrypt.hash("Test1234!", 10);
  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "restaurant_admin",
      restaurantId: restaurant.id,
    },
  });

  // Default opening hours so /admin loads cleanly
  await prisma.openingHours.createMany({
    data: Array.from({ length: 7 }, (_, dow) => ({
      restaurantId: restaurant.id,
      dayOfWeek: dow,
      isOpen: true,
      openTime: "09:00",
      closeTime: "21:00",
    })),
  });

  // Auto-add the owner as a notification recipient (matches /signup behavior)
  await prisma.notificationRecipient.create({
    data: { restaurantId: restaurant.id, email, name },
  });

  return NextResponse.json({
    ok: true,
    id: restaurant.id,
    slug,
    email,
    password: "Test1234!",
  });
}
