/**
 * /admin/kickstarter — Marketing Suite Phase 4 server entry.
 *
 * Loads:
 *   - The session-scoped KickstarterState (upsert-on-read so the first
 *     visit can't 404)
 *   - The First Buy Promo id (if one's been auto-created) for the
 *     "Edit this promo" deep link
 *   - The 5 most recent ProspectImport rows for the imports history
 *
 * Auth: same pattern used by every owner-facing admin page —
 *   no user      → /login
 *   no restaurant→ /superadmin   (superadmins legitimately have no
 *                                  restaurantId and shouldn't be
 *                                  bounced into login per AGENTS.md)
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import {
  KICKSTARTER_FIRST_BUY_REF,
  getOrCreateKickstarterState,
} from "@/lib/kickstarter";
import { featureGate } from "@/lib/feature-gate";
import { getAddOnBillingState } from "@/lib/dunning";
import { AddOnBillingNotice } from "@/components/admin/AddOnBillingNotice";
import { KickstarterClient } from "./KickstarterClient";

export const dynamic = "force-dynamic";

export default async function KickstarterPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");
  const restaurantId = user.restaurantId;

  // Paid add-on: free accounts see the locked upsell. Luigi 2026-06-11.
  const billingState = await getAddOnBillingState(restaurantId, "kickstarter");
  const gate = await featureGate(restaurantId, "kickstarter", "kickstarter");
  if (gate) {
    // Downgraded (grace expired) lands here — explain why above the locked view.
    return (
      <>
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <AddOnBillingNotice state={billingState} addOnSlug="kickstarter" />
        </div>
        {gate}
      </>
    );
  }

  const [state, firstBuyPromo, imports] = await Promise.all([
    getOrCreateKickstarterState(restaurantId),
    prisma.promotion.findFirst({
      where: { restaurantId, campaignRef: KICKSTARTER_FIRST_BUY_REF },
      select: { id: true, isActive: true },
    }),
    prisma.prospectImport.findMany({
      where: { restaurantId },
      orderBy: { uploadedAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <AddOnBillingNotice state={billingState} addOnSlug="kickstarter" />
      </div>
      <KickstarterClient
      initialFirstBuyEnabled={state.firstBuyPromoEnabled}
      initialInviteEnabled={state.inviteProspectsEnabled}
      initialFirstBuyPromoId={firstBuyPromo?.id ?? null}
      initialImports={imports.map((i) => ({
        id: i.id,
        filename: i.filename,
        totalRows: i.totalRows,
        successRows: i.successRows,
        errorRows: i.errorRows,
        emailsSent: i.emailsSent,
        emailsLastSent: i.emailsLastSent?.toISOString() ?? null,
        isComplete: i.isComplete,
        uploadedAt: i.uploadedAt.toISOString(),
      }))}
    />
    </>
  );
}
