import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { stripeReady } from "@/lib/stripe";
import { BillingClient } from "./BillingClient";

export default async function AdminBillingPage() {
  const user = await getSessionUser();
  if (!user || !user.restaurantId) redirect("/login");

  const [restaurant, plans, invoices] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      include: { subscriptionPlan: true },
    }),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: "asc" },
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
      plans={JSON.parse(JSON.stringify(plans))}
      invoices={JSON.parse(JSON.stringify(invoices))}
      billingConfigured={billingConfigured}
    />
  );
}
