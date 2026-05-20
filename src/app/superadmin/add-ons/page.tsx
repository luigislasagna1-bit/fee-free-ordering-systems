import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { SuperadminAddOnsClient } from "./SuperadminAddOnsClient";

// Force dynamic — auth-gated, no caching of unauth redirects to authed users.
export const dynamic = "force-dynamic";

/**
 * /superadmin/add-ons — superadmin-only add-on catalog management.
 *
 * Auth fix (2026-05-19): the recurring "click Add-Ons, get logged out"
 * bug was caused by src/lib/session.ts:203 picking whichever cookie
 * session had a restaurantId, even when that meant downgrading a
 * superadmin (no restaurantId by design) to a stale kitchen_staff
 * session (which always has one). Fix landed in src/lib/session.ts.
 *
 * Keeping a structured log line so we can grep Vercel logs to confirm
 * the fix held in production. Remove the log after a week of clean
 * traffic.
 */
export default async function SuperadminAddOnsPage() {
  const rawSession = await getServerSession(authOptions);
  const user = await getSessionUser();
  const rawRole = (rawSession?.user as { role?: string } | undefined)?.role;
  console.log(
    `[/superadmin/add-ons] auth-check rawSession=${!!rawSession} rawRole=${rawRole ?? "null"} user=${!!user} resolvedRole=${user?.role ?? "null"}`,
  );

  if (!user || user.role !== "superadmin") {
    // If we hit this with a valid rawSession but a non-superadmin
    // resolved user, something is still off — log loudly so we catch
    // it in Vercel logs even after redirecting.
    if (rawSession && rawRole === "superadmin" && user?.role !== "superadmin") {
      console.error(
        `[/superadmin/add-ons] DOWNGRADE DETECTED — rawRole=superadmin but resolvedRole=${user?.role}. The session.ts fix should have prevented this. Investigate cookie state.`,
      );
    }
    redirect("/login");
  }

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
