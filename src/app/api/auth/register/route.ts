import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { slugify } from "@/lib/utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain at least one special character";
  return null;
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 registrations per IP per hour
  const ip = getClientIp(req);
  if (!rateLimit(`register:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many registration attempts. Please try again later." }, { status: 429 });
  }

  try {
    const { restaurantName, ownerName, email, password, phone } = await req.json();

    if (!restaurantName || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate email format
    const emailClean = String(email).trim().toLowerCase().slice(0, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Validate password complexity
    const pwError = validatePassword(String(password));
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

    const restaurantNameClean = String(restaurantName).trim().slice(0, 100);
    if (restaurantNameClean.length < 2) {
      return NextResponse.json({ error: "Restaurant name must be at least 2 characters" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: emailClean } });
    // Use same error message regardless of existence to prevent email enumeration
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 });
    }

    // Generate unique slug
    let slug = slugify(restaurantNameClean);
    let slugExists = await prisma.restaurant.findUnique({ where: { slug } });
    let counter = 1;
    while (slugExists) {
      slug = `${slugify(restaurantNameClean)}-${counter++}`;
      slugExists = await prisma.restaurant.findUnique({ where: { slug } });
    }

    const starterPlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "starter" } });

    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantNameClean,
        slug,
        phone: phone ? String(phone).trim().slice(0, 30) : null,
        subscriptionStatus: "trial",
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        subscriptionPlanId: starterPlan?.id || null,
      },
    });

    for (let i = 0; i < 7; i++) {
      await prisma.openingHours.create({
        data: { restaurantId: restaurant.id, dayOfWeek: i, isOpen: true, openTime: "09:00", closeTime: "21:00" },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email: emailClean,
        name: ownerName ? String(ownerName).trim().slice(0, 100) : restaurantNameClean,
        passwordHash,
        role: "restaurant_admin",
        restaurantId: restaurant.id,
      },
    });

    return NextResponse.json({ success: true, slug });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
