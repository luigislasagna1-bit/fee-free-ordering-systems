import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { RewardsClient } from "./RewardsClient";

export default async function RewardsPage() {
  const user = await getSessionUser();
  // Authed-but-no-restaurant (superadmin) → /superadmin, not /login (AGENTS.md
  // redirect-loop rule).
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const r = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: {
      currency: true,
      rewardsEnabled: true,
      rewardLabelSingular: true,
      rewardLabelPlural: true,
      rewardEarnEnabled: true,
      rewardEarnMode: true,
      rewardEarnPercent: true,
      rewardEarnPerDollar: true,
      rewardRedeemEnabled: true,
      rewardMinRedeemBalance: true,
      rewardMaxRedeemPercent: true,
      rewardSignupBonus: true,
    },
  });

  return (
    <RewardsClient
      currency={r?.currency ?? "usd"}
      initial={{
        rewardsEnabled: r?.rewardsEnabled ?? false,
        rewardLabelSingular: r?.rewardLabelSingular ?? "",
        rewardLabelPlural: r?.rewardLabelPlural ?? "",
        rewardEarnEnabled: r?.rewardEarnEnabled ?? false,
        rewardEarnMode: r?.rewardEarnMode === "per_dollar" ? "per_dollar" : "percent",
        rewardEarnPercent: r?.rewardEarnPercent ?? 0,
        rewardEarnPerDollar: r?.rewardEarnPerDollar ?? 0,
        rewardRedeemEnabled: r?.rewardRedeemEnabled ?? false,
        rewardMinRedeemBalance: r?.rewardMinRedeemBalance ?? 0,
        rewardMaxRedeemPercent: r?.rewardMaxRedeemPercent ?? 100,
        rewardSignupBonus: r?.rewardSignupBonus ?? 0,
      }}
    />
  );
}
