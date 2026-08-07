import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { OrdersListView } from "./OrdersListView";

/**
 * /reseller/orders — the partner Orders List.
 *
 * Requested by Fabrizio (reseller report cmshrr94z001d04l7x8kpet3z): one view
 * of every order + table reservation across all of a partner's restaurants,
 * with search by customer name / order ID / phone / email.
 *
 * Guarded with the portal's standard gate; the feed itself is additionally
 * scoped by `restaurant.resellerProfileId`, so a tampered `?restaurant=` can
 * only ever match zero rows.
 */
export default async function ResellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) redirect("/reseller/holding");

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  const sp = await searchParams;
  const t = await getTranslations("reseller.ordersList");

  return (
    <OrdersListView
      scope={{ kind: "reseller", resellerProfileId: user.resellerProfileId }}
      searchParams={sp}
      basePath="/reseller/orders"
      title={t("pageTitle")}
    />
  );
}
