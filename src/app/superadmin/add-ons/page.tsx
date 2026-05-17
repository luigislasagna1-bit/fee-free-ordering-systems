import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { SuperadminAddOnsClient } from "./SuperadminAddOnsClient";

export default async function SuperadminAddOnsPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "superadmin") redirect("/login");
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
