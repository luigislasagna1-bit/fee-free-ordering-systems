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

  const [rows, restaurant] = await Promise.all([
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
  ]);

  const members = rows.map((m) => ({
    id: m.id,
    name: m.name ?? m.customer?.name ?? null,
    email: m.email ?? m.customer?.email ?? null,
    phone: m.phone ?? m.customer?.phone ?? null,
    hasAccount: !!m.customer?.passwordHash,
  }));

  return (
    <GroupDetailClient
      group={{ id: group.id, name: group.name, description: group.description }}
      initialMembers={members}
      currency={restaurant?.currency ?? "usd"}
    />
  );
}
