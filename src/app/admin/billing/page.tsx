import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { stripeReady } from "@/lib/stripe";
import { getOrderCapUsage } from "@/lib/order-cap";
import { BillingClient } from "./BillingClient";

export default async function AdminBillingPage() {
  const user = await getSessionUser();
  if (!user || !user.restaurantId) redirect("/login");

  // Fetch in parallel:
  //   - The restaurant (status, period end, Stripe customer id)
  //   - Every add-on in the catalog
  //   - This restaurant's RestaurantAddOn rows (per-add-on state)
  //   - Their MarketplaceListing — the marketplace add-on is special:
  //     it has TWO billing modes (Monthly $199.99/mo via Stripe sub,
  //     PAYG $3/order via settlement cron). The row tells us which
  //     mode they're on + this month's PAYG order count for billing
  //     transparency.
  //   - Recent invoices
  const [restaurant, addOnCatalog, restaurantAddOns, marketplaceListing, invoices] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    }),
    prisma.addOn.findMany({
      where: { isActive: true },
      orderBy: [{ comingSoon: "asc" }, { displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        monthlyPriceCents: true,
        comingSoon: true,
      },
    }),
    prisma.restaurantAddOn.findMany({
      where: { restaurantId: user.restaurantId },
      select: {
        addOnId: true,
        status: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        activatedAt: true,
        stripeSubscriptionId: true,
      },
    }),
    prisma.marketplaceListing.findUnique({
      where: { restaurantId: user.restaurantId },
      select: {
        billingMode: true,
        currentMonthOrders: true,
        currentMonthRevenue: true,
        currentMonthStartedAt: true,
        isListed: true,
      },
    }),
    prisma.subscriptionInvoice.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  if (!restaurant) redirect("/login");

  const [billingConfigured, capUsage] = await Promise.all([
    stripeReady(),
    getOrderCapUsage(user.restaurantId),
  ]);

  return (
    <BillingClient
      restaurant={JSON.parse(JSON.stringify(restaurant))}
      addOnCatalog={JSON.parse(JSON.stringify(addOnCatalog))}
      restaurantAddOns={JSON.parse(JSON.stringify(restaurantAddOns))}
      marketplaceListing={marketplaceListing ? JSON.parse(JSON.stringify(marketplaceListing)) : null}
      invoices={JSON.parse(JSON.stringify(invoices))}
      billingConfigured={billingConfigured}
      orderCapUsage={{
        count: capUsage.count,
        cap: capUsage.cap,
        exempt: capUsage.exempt,
        resetAt: capUsage.resetAt ? capUsage.resetAt.toISOString() : null,
        level: capUsage.level,
      }}
    />
  );
}
