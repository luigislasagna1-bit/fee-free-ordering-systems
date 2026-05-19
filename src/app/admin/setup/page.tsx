import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { loadSetupProgress } from "@/lib/setup-checklist-loader";
import prisma from "@/lib/db";
import { SetupWizardClient } from "./SetupWizardClient";

/**
 * /admin/setup — the dedicated onboarding wizard.
 *
 * A new restaurant lands here the first time they log in (see the
 * redirect logic in /admin/page.tsx). They walk through each section,
 * see which steps are done (green ✓) vs open (○), and finish with a
 * big "Publish my restaurant" button that flips `Restaurant.publishedAt`.
 *
 * Until the restaurant is published:
 *   - Customer order page at /order/[slug] still works (legacy behavior)
 *   - Widget snippets won't render (Phase E enforcement)
 *   - The kitchen display works as normal
 *
 * Already-published restaurants can still visit this page to see their
 * setup status — useful for adding optional steps later (cuisine type,
 * tax rate) or checking what's missing if they want to un-publish.
 */
export default async function SetupWizardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const [progress, restaurant] = await Promise.all([
    loadSetupProgress(user.restaurantId),
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { name: true, slug: true, publishedAt: true },
    }),
  ]);

  if (!progress || !restaurant) {
    return (
      <div className="p-6 text-sm text-red-600">
        Failed to load setup progress. Try refreshing the page.
      </div>
    );
  }

  return (
    <SetupWizardClient
      restaurantName={restaurant.name}
      restaurantSlug={restaurant.slug}
      isPublished={!!restaurant.publishedAt}
      publishedAt={restaurant.publishedAt?.toISOString() ?? null}
      progress={progress}
    />
  );
}
