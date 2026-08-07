import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import { OrdersListView } from "@/app/reseller/orders/OrdersListView";

/**
 * /superadmin/orders — the same Orders List, scoped to EVERY restaurant on the
 * platform. Identical component and feed as the partner view; only the scope
 * differs (see src/lib/reseller/scope.ts).
 *
 * The /superadmin layout already gates on role, but this view reads across every
 * tenant, so it re-checks explicitly rather than inheriting the guard.
 */
export default async function SuperadminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "superadmin" && user.role !== "platform_support") redirect("/admin");

  const sp = await searchParams;
  const t = await getTranslations("reseller.ordersList");

  return (
    <OrdersListView
      scope={{ kind: "platform" }}
      searchParams={sp}
      basePath="/superadmin/orders"
      title={t("pageTitlePlatform")}
    />
  );
}
