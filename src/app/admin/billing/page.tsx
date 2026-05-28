import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { stripeReady } from "@/lib/stripe";
import { BillingClient } from "./BillingClient";

export default async function AdminBillingPage() {
  const user = await getSessionUser();
  if (!user || !user.restaurantId) redirect("/login");

  // Fetch in parallel:
  //   - The restaurant (for status, period end, Stripe customer id)
  //   - Every add-on the platform offers (the catalog)
  //   - This restaurant's RestaurantAddOn rows (their subscription state
  //     per add-on)
  //   - Their recent invoices
  // The catalog + per-restaurant rows merge on the client into one list
  // — "every add-on with this restaurant's status (or 'not subscribed')".
  const [restaurant, addOnCatalog, restaurantAddOns, invoices] = await Promise.all([
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
    prisma.subscriptionInvoice.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  if (!restaurant) redirect("/login");

  const billingConfigured = await stripeReady();

  return (
    <BillingClient
      restaurant={JSON.parse(JSON.stringify(restaurant))}
      addOnCatalog={JSON.parse(JSON.stringify(addOnCatalog))}
      restaurantAddOns={JSON.parse(JSON.stringify(restaurantAddOns))}
      invoices={JSON.parse(JSON.stringify(invoices))}
      billingConfigured={billingConfigured}
    />
  );
}
