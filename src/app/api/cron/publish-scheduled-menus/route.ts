/**
 * Publishes scheduled menu versions. Multi-menu Phase 3.
 *
 * Finds every menu whose scheduledActivateAt has arrived (≤ now) and isn't
 * already the active one, and activates it — atomically deactivating whichever
 * menu was live for that restaurant (activateMenu enforces one-active). The
 * owner sets the go-live time in the menu switcher; this cron makes it happen
 * without anyone working overnight.
 *
 * Scheduled: every minute (vercel.json crons), so go-live is accurate to ~1 min.
 * Idempotent: a menu with no due schedule is skipped; activateMenu clears the
 * schedule so it won't fire twice.
 *
 * Auth: Vercel cron via Authorization: Bearer $CRON_SECRET, or a superadmin.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { activateMenu } from "@/lib/menu";

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const due = await prisma.menu.findMany({
      where: {
        scheduledActivateAt: { not: null, lte: new Date() },
        isActive: false,
        isArchived: false,
      },
      select: { id: true, restaurantId: true, name: true },
    });

    let published = 0;
    for (const m of due) {
      try {
        await activateMenu(m.restaurantId, m.id); // clears scheduledActivateAt
        published++;
      } catch (e) {
        console.error("[cron/publish-scheduled-menus] activate failed", { menuId: m.id, e });
      }
    }
    return NextResponse.json({ ok: true, due: due.length, published });
  } catch (err: any) {
    console.error("[cron/publish-scheduled-menus]", err);
    return NextResponse.json({ ok: false, error: err.message ?? "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
