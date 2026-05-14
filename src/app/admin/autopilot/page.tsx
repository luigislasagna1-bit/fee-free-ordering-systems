import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { AutopilotClient } from "./AutopilotClient";

export default async function AutopilotPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const [campaigns, coupons] = await Promise.all([
    prisma.autopilotCampaign.findMany({ where: { restaurantId } }),
    prisma.coupon.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, code: true, description: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const emailConfigured = !!(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);

  return (
    <AutopilotClient
      campaigns={campaigns as any}
      coupons={coupons}
      emailConfigured={emailConfigured}
    />
  );
}
