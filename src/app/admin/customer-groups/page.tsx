import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import CustomerGroupsClient from "./CustomerGroupsClient";

export const dynamic = "force-dynamic";

export default async function CustomerGroupsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const [groups, restaurant] = await Promise.all([
    prisma.customerGroup.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, description: true, updatedAt: true, _count: { select: { members: true } } },
      take: 500,
    }),
    prisma.restaurant.findUnique({ where: { id: user.restaurantId }, select: { vipMemberLabel: true } }),
  ]);

  return (
    <CustomerGroupsClient
      initialGroups={groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        memberCount: g._count.members,
        updatedAt: g.updatedAt.toISOString(),
      }))}
      initialMemberLabel={restaurant?.vipMemberLabel ?? ""}
    />
  );
}
