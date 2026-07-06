import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import prisma from "@/lib/db";
import { deleteSandbox } from "@/lib/menu-import/sandbox";

export const maxDuration = 120;

/**
 * Daily: delete UNCLAIMED import-to-try sandboxes past their TTL so anonymous
 * trial menus don't accumulate. Claimed sandboxes have no SandboxRestaurant row
 * (it's deleted at claim), so they're never matched here. Batched (take 200) so
 * one run can't blow the function budget; the next run picks up any remainder.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const expired = await prisma.sandboxRestaurant.findMany({
    where: { claimedAt: null, expiresAt: { lt: new Date() } },
    select: { restaurantId: true },
    orderBy: { expiresAt: "asc" },
    take: 200,
  });

  let deleted = 0;
  for (const s of expired) {
    try {
      await deleteSandbox(s.restaurantId);
      deleted++;
    } catch (e) {
      console.error("[cleanup-sandboxes] failed for", s.restaurantId, e instanceof Error ? e.message : String(e));
    }
  }
  console.log(`[cleanup-sandboxes] deleted ${deleted}/${expired.length} expired unclaimed sandboxes`);
  return NextResponse.json({ deleted, found: expired.length });
}
