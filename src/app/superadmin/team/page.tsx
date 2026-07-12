import "server-only";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { ROLES } from "@/lib/roles";
import { TeamClient } from "./TeamClient";

/**
 * Platform team management (Team feature, Luigi 2026-07-12): invite platform
 * users (full superadmin or view-only support), deactivate, change roles,
 * resend invites. FULL superadmin only — the layout admits platform_support
 * into /superadmin, so this page enforces its own gate (redirect, not 403:
 * a support user typing the URL just lands back on the dashboard).
 */
export default async function TeamPage() {
  const actor = await requireSuperadmin();
  if (!actor) redirect("/superadmin");

  const members = await prisma.user.findMany({
    where: { role: { in: [ROLES.SUPERADMIN, ROLES.PLATFORM_SUPPORT] } },
    select: {
      id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
      resetTokens: { where: { usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <TeamClient
      selfId={actor.id}
      initialMembers={members.map((m) => ({
        id: m.id, email: m.email, name: m.name, role: m.role,
        isActive: m.isActive, createdAt: m.createdAt.toISOString(),
        invitePending: m.resetTokens.length > 0,
      }))}
    />
  );
}
