import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { RestaurantsClient } from "./RestaurantsClient";

export default async function ResellerRestaurantsPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  const restaurants = await prisma.restaurant.findMany({
    where: { resellerProfileId: user.resellerProfileId },
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      createdAt: true,
      subscriptionPlan: { select: { name: true, price: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return <RestaurantsClient initial={JSON.parse(JSON.stringify(restaurants))} />;
}
