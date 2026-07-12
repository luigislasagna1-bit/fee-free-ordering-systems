import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { stripeReady } from "@/lib/stripe";
import { PlansClient } from "./PlansClient";

export default async function SuperadminPlansPage() {
  // Billing config — FULL superadmin only. The layout already bounced
  // unauthenticated visitors to /login; a support user lands back on the
  // dashboard.
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");

  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { price: "asc" },
  });

  const stripeConfigured = await stripeReady();

  return <PlansClient initialPlans={plans as any} stripeConfigured={stripeConfigured} />;
}
