import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isResellerPartner } from "@/lib/roles";
import { availableBalanceCents } from "@/lib/commission";
import { PayoutsClient } from "./PayoutsClient";

export default async function ResellerPayoutsPage() {
  const user = await getSessionUser();
  if (!user || !isResellerPartner(user.role) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const [payouts, availableCents, profile] = await Promise.all([
    prisma.payoutRequest.findMany({
      where: { resellerProfileId: user.resellerProfileId },
      orderBy: { requestedAt: "desc" },
      include: { _count: { select: { commissions: true } } },
    }),
    availableBalanceCents(user.resellerProfileId),
    prisma.resellerProfile.findUnique({
      where: { id: user.resellerProfileId },
      select: { payoutMethod: true },
    }),
  ]);

  return (
    <PayoutsClient
      initial={JSON.parse(JSON.stringify(payouts))}
      availableCents={availableCents}
      payoutMethodConfigured={!!profile?.payoutMethod}
    />
  );
}
