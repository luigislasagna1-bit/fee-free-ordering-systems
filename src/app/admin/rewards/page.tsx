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

  // VIP groups for the per-group earn-rate card (member count for context).
  // Promise.all — a bare PrismaPromise only dispatches when awaited, so the
  // sequential form ran the two queries back-to-back (review 2026-07-19).
  const [groupRows, r] = await Promise.all([
    prisma.customerGroup.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        rewardEarnPercent: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.restaurant.findUnique({
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
        rewardSignupBannerEnabled: true,
      },
    }),
  ]);

  const groups = groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    rewardEarnPercent: g.rewardEarnPercent,
    memberCount: g._count.members,
  }));

  return (
    <RewardsClient
      currency={r?.currency ?? "usd"}
      groups={groups}
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
        rewardSignupBannerEnabled: r?.rewardSignupBannerEnabled ?? false,
      }}
    />
  );
}
