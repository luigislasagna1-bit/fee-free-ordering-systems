import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { PromotionsClient } from "./PromotionsClient";

export default async function PromotionsPage() {
  const t = await getTranslations("admin.promotionsPage");
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return (
      <div>
        <HeaderBar t={t} />
        <PromotionsClient promotions={[] as any} categories={[]} menuItems={[]} />
      </div>
    );
  }

  // Resolve owner-id set for promo lookups. A child location's
  // /admin/promotions page also shows the parent's brand-scoped rows
  // (read-only at the API level — edit/delete rejects non-owner attempts).
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true },
  });
  const ownerIds: string[] = [restaurantId];
  if (restaurant?.parentRestaurantId) ownerIds.push(restaurant.parentRestaurantId);

  const [promotions, categories, menuItems] = await Promise.all([
    prisma.promotion.findMany({
      where: {
        OR: [
          { restaurantId },
          { restaurantId: { in: ownerIds }, scope: "brand" },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, categoryId: true, price: true },
    }),
  ]);

  return (
    <div>
      <HeaderBar t={t} />
      <PromotionsClient
        promotions={promotions as any}
        categories={categories}
        menuItems={menuItems}
      />
    </div>
  );
}

type TFunc = Awaited<ReturnType<typeof getTranslations<"admin.promotionsPage">>>;

function HeaderBar({ t }: { t: TFunc }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {t("description")}
        </p>
      </div>
      <Link
        href="/admin/promotions/new"
        className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-emerald-600 transition text-sm shadow-sm"
      >
        <Plus className="w-4 h-4" /> {t("newPromo")}
      </Link>
    </div>
  );
}
