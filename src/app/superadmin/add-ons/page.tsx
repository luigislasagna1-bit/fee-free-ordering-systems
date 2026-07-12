import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";
import { SuperadminAddOnsClient } from "./SuperadminAddOnsClient";

// Force dynamic — auth-gated, no caching of unauth redirects to authed users.
export const dynamic = "force-dynamic";

/**
 * /superadmin/add-ons — superadmin-only add-on catalog management.
 *
 * (History: a 2026-05-19 session-tiebreak bug used to downgrade superadmins
 * here — fixed in src/lib/session.ts; the temporary diagnostic logging was
 * removed when this page moved to the shared requireSuperadmin guard.)
 *
 * Billing config — FULL superadmin only. The layout already bounced
 * unauthenticated visitors to /login; a support user lands back on the
 * dashboard.
 */
export default async function SuperadminAddOnsPage() {
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");

  const addOns = await prisma.addOn.findMany({ orderBy: { displayOrder: "asc" } });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add-On Catalog</h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage purchasable add-ons. Set a monthly price &gt; $0 then click
          <strong> Sync to Stripe </strong>
          to create the Product + Price. Restaurants can only subscribe once the
          Price is synced.
        </p>
      </div>
      <SuperadminAddOnsClient initial={addOns} />
    </div>
  );
}
