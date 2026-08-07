import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { listScopeRestaurants } from "@/lib/reseller/scope";
import { ExportForm } from "./ExportForm";

/** /reseller/orders/export — the dedicated "Export orders" screen. */
export default async function ResellerOrdersExportPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) redirect("/reseller/holding");
  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  const restaurants = await listScopeRestaurants({ kind: "reseller", resellerProfileId: user.resellerProfileId });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Export orders</h1>
      <ExportForm
        restaurants={restaurants.map((r) => ({ id: r.id, name: r.name }))}
        exportUrl="/api/reseller/orders/export"
        backUrl="/reseller/orders"
      />
    </div>
  );
}
