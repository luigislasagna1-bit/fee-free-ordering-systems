import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import { listAddOnsForRestaurant } from "@/lib/addons";
import { AddOnsClient } from "./AddOnsClient";

export default async function AddOnsPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const user = await getSessionUser();
  // Three cases for "no restaurantId":
  //   - Not logged in at all → /login (NextAuth shows the sign-in form)
  //   - Superadmin (logged in, no restaurant ownership) → /superadmin
  //     (the platform admin dashboard — superadmins were ending up in a
  //      redirect loop here because /login bounced them right back as
  //      already-authed, which looked like being logged out)
  //   - Reseller / other role with no restaurantId → /superadmin too (they
  //     don't have a restaurant context, so this restaurant-scoped page
  //     doesn't apply; the platform dashboard is the safe landing)
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const params = await searchParams;
  const [t, tBilling] = await Promise.all([
    getTranslations("admin.addOns"),
    getTranslations("admin.billing"),
  ]);

  const addOns = await listAddOnsForRestaurant(user.restaurantId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/billing"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; {t("backToBilling")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{tBilling("addOnsTitle")}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {t("pageIntro")}
        </p>
      </div>

      {params.subscribed && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {t.rich("subscribedBanner", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </div>
      )}

      <AddOnsClient addOns={addOns} />
    </div>
  );
}
