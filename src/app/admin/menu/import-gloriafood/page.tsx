import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { isInheritingMenu } from "@/lib/brand";
import { ImportGloriaFoodClient } from "./ImportGloriaFoodClient";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Import from GloriaFood — Fee Free Ordering",
  description: "Pull your existing menu from GloriaFood (or any Sams Restaurant Systems / FoodBooking white-label) in seconds.",
};

/**
 * /admin/menu/import-gloriafood — owner-side wizard that imports the
 * restaurant's existing menu from a GloriaFood-powered platform.
 *
 * Step 1: paste embed snippet / URL / UID
 * Step 2: preview the parsed menu, optionally merge into existing
 *         FFOS categories
 * Step 3: commit (creates everything in one Prisma transaction)
 *
 * Backed by /api/menu/import-gloriafood (POST = preview, PUT = commit).
 */
export default async function ImportGloriaFoodPage() {
  const t = await getTranslations("admin.importGloriaFoodPage");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  // Inheriting locations can't have their own menu — block early so
  // the owner sees a clear message instead of getting a confusing
  // 400 from the API.
  if (await isInheritingMenu(user.restaurantId)) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">{t("inheritingHeading")}</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {t("inheritingBody")}
        </div>
      </div>
    );
  }

  return <ImportGloriaFoodClient />;
}
