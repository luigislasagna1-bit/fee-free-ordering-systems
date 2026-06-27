import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import GroupDetailClient from "./GroupDetailClient";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");
  const { id } = await params;

  const group = await prisma.customerGroup.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, name: true, description: true },
  });
  if (!group || group.restaurantId !== user.restaurantId) notFound();

  const promoSelect = {
    id: true, name: true, promotionType: true, isActive: true,
    displayMode: true, couponCode: true, ruleConfig: true, minimumOrder: true,
  } as const;

  const [rows, restaurant, links, allPromos] = await Promise.all([
    prisma.customerGroupMember.findMany({
      where: { groupId: id },
      orderBy: { addedAt: "desc" },
      take: 1000,
      select: {
        id: true, customerId: true, email: true, phone: true, name: true,
        customer: { select: { name: true, email: true, phone: true, passwordHash: true } },
      },
    }),
    prisma.restaurant.findUnique({ where: { id: user.restaurantId }, select: { currency: true } }),
    prisma.customerGroupPromotion.findMany({
      where: { groupId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, promotion: { select: promoSelect } },
    }),
    prisma.promotion.findMany({
      // Active only — an inactive promo can't auto-apply, so it isn't pickable.
      where: { restaurantId: user.restaurantId, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { ...promoSelect, _count: { select: { groupLinks: true } } },
    }),
  ]);

  const members = rows.map((m) => ({
    id: m.id,
    name: m.name ?? m.customer?.name ?? null,
    email: m.email ?? m.customer?.email ?? null,
    phone: m.phone ?? m.customer?.phone ?? null,
    hasAccount: !!m.customer?.passwordHash,
  }));

  const specials = links.map((l) => ({ linkId: l.id, ...l.promotion, ruleConfig: l.promotion.ruleConfig as any }));
  const linkedIds = new Set(specials.map((s) => s.id));
  const pickable = allPromos
    .filter((p) => !linkedIds.has(p.id))
    .map(({ _count, ruleConfig, ...p }) => ({ ...p, ruleConfig: ruleConfig as any, groupCount: _count.groupLinks }));

  return (
    <GroupDetailClient
      group={{ id: group.id, name: group.name, description: group.description }}
      initialMembers={members}
      initialSpecials={specials}
      initialPickable={pickable}
      currency={restaurant?.currency ?? "usd"}
    />
  );
}
