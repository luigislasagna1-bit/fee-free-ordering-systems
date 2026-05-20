import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { loadSetupProgress } from "@/lib/setup-checklist-loader";
import prisma from "@/lib/db";

/**
 * /admin/setup/next — guided walkthrough entry point.
 *
 * Instead of dumping the owner on the full checklist (where they have to
 * pick what to work on next themselves), this route reads their current
 * progress and 307s them directly to the FIRST incomplete required step.
 * After they save that step, the sticky "Finish setup" banner on the next
 * page keeps pointing at /admin/setup/next, so clicking it again advances
 * to step 2, step 3, … Once nothing required is left, we land on
 * /admin/setup (the wizard view) where the green "Publish my restaurant"
 * CTA lives.
 *
 * Always force-dynamic — the redirect target depends on per-user DB state.
 */
export const dynamic = "force-dynamic";

export default async function SetupNextPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const [progress, restaurant] = await Promise.all([
    loadSetupProgress(user.restaurantId),
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { publishedAt: true },
    }),
  ]);

  // Already published or progress couldn't load — drop them on the wizard
  // page, which handles both states gracefully.
  if (!progress || restaurant?.publishedAt) {
    redirect("/admin/setup");
  }

  const next = progress.requiredStepsRemaining[0];

  // No required steps left but not yet published — show the wizard so the
  // owner sees the green Publish CTA.
  if (!next) {
    redirect("/admin/setup");
  }

  redirect(next.href);
}
