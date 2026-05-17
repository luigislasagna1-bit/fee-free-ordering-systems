import prisma from "@/lib/db";
import { PayoutsClient } from "./PayoutsClient";

export default async function SuperadminPayoutsPage() {
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
