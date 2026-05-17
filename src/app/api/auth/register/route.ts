import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { slugify } from "@/lib/utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password";
import { sendSignupConfirmationEmail } from "@/lib/email";
import { cookies } from "next/headers";
import { getStripe, stripeReady } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  // Rate limit: 5 registrations per IP per hour
  const ip = getClientIp(req);
  if (!rateLimit(`register:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many registration attempts. Please try again later." }, { status: 429 });
  }

  try {
    const { restaurantName, ownerName, email, password, phone, ref } = await req.json();

    if (!restaurantName || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Reseller attribution: ?ref=<referralCode> on the signup form OR a
    // "feefree_ref" cookie carries the code. Only count it if the matching
    // reseller is approved. This is the *only* place the link is set —
    // restaurants cannot self-claim a reseller later.
    let resellerProfileId: string | null = null;
    const cookieStore0 = await cookies();
    const refCode: string | null =
      (typeof ref === "string" && ref.trim()) ||
      cookieStore0.get("feefree_ref")?.value ||
      null;
    if (refCode) {
      const profile = await prisma.resellerProfile.findUnique({
        where: { referralCode: refCode },
        select: { id: true, status: true },
      });
      if (profile?.status === "approved") {
        resellerProfileId = profile.id;
      }
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
        // Auto-provision a subdomain matching the slug so every new tenant is
        // live at <slug>.<PLATFORM_DOMAIN> immediately, no admin visit needed.
        subdomain: slug,
        phone: phone ? String(phone).trim().slice(0, 30) : null,
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        subscriptionPlanId: starterPlan?.id || null,
        resellerProfileId,
      },
    });

    for (let i = 0; i < 7; i++) {
      await prisma.openingHours.create({
        data: { restaurantId: restaurant.id, dayOfWeek: i, isOpen: true, openTime: "09:00", closeTime: "21:00" },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const ownerNameClean = ownerName ? String(ownerName).trim().slice(0, 100) : restaurantNameClean;
    await prisma.user.create({
      data: {
        email: emailClean,
        name: ownerNameClean,
        passwordHash,
        role: "restaurant_admin",
        restaurantId: restaurant.id,
      },
    });

    // Store the owner's email on the restaurant so notifications & receipts have a default,
    // and auto-create a NotificationRecipient row with all toggles defaulting on.
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { email: emailClean },
    });
    await prisma.notificationRecipient.create({
      data: {
        restaurantId: restaurant.id,
        email: emailClean,
        name: ownerNameClean,
      },
    });

    // Create a Stripe Customer so the restaurant can be billed later via Checkout/Portal.
    // We don't attach a card here — that happens when they convert from trial in /admin/billing.
    // Failure shouldn't break signup; we'll create the customer lazily on first billing action.
    if (await stripeReady()) {
      try {
        const stripe = await getStripe();
        const customer = await stripe.customers.create({
          email: emailClean,
          name: restaurantNameClean,
          metadata: { restaurantId: restaurant.id },
        });
        await prisma.restaurant.update({
          where: { id: restaurant.id },
          data: { stripeCustomerId: customer.id },
        });
      } catch (err) {
        console.error("[register] stripe customer create failed", err);
      }
    }

    // Pick up the signup-form locale from the cookie so the welcome email is
    // in the same language they were just browsing in.
    const cookieStore = await cookies();
    const signupLocale = cookieStore.get("fee-free-locale")?.value || "en";

    // Persist the locale on the freshly-created restaurant so subsequent
    // notifications and surfaces follow the owner's chosen language.
    if (["fr", "es", "it", "pt"].includes(signupLocale)) {
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { defaultLanguage: signupLocale },
      });
    }

    // Welcome email (non-blocking — failure shouldn't break signup)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    sendSignupConfirmationEmail({
      to: emailClean,
      name: ownerNameClean,
      restaurantName: restaurantNameClean,
      loginUrl: `${baseUrl}/login`,
      locale: signupLocale,
    }).catch(() => {});

    return NextResponse.json({ success: true, slug });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
