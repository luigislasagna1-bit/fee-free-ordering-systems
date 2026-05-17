import prisma from "@/lib/db";
import { stripeReady } from "@/lib/stripe";
import { PlansClient } from "./PlansClient";

export default async function SuperadminPlansPage() {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { price: "asc" },
  });

  const stripeConfigured = await stripeReady();

  return <PlansClient initialPlans={plans as any} stripeConfigured={stripeConfigured} />;
}
