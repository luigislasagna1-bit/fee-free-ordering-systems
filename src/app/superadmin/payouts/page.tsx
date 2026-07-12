import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { PayoutsClient } from "./PayoutsClient";

export default async function SuperadminPayoutsPage() {
  // Money — FULL superadmin only. The layout already bounced unauthenticated
  // visitors to /login; a support user lands back on the dashboard.
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");

  const payouts = await prisma.payoutRequest.findMany({
    include: {
      resellerProfile: {
        select: {
          id: true,
          companyName: true,
          payoutMethod: true,
          user: { select: { email: true, name: true } },
        },
      },
      _count: { select: { commissions: true } },
    },
    orderBy: { requestedAt: "desc" },
  });

  return <PayoutsClient initial={JSON.parse(JSON.stringify(payouts))} />;
}
