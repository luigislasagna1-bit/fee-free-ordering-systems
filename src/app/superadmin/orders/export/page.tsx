import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listScopeRestaurants } from "@/lib/reseller/scope";
import { ExportForm } from "@/app/reseller/orders/export/ExportForm";

/** /superadmin/orders/export — same export screen, platform-wide scope. */
export default async function SuperadminOrdersExportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "superadmin" && user.role !== "platform_support") redirect("/admin");

  const restaurants = await listScopeRestaurants({ kind: "platform" });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Export orders</h1>
      <ExportForm
        restaurants={restaurants.map((r) => ({ id: r.id, name: r.name }))}
        exportUrl="/api/reseller/orders/export"
        backUrl="/superadmin/orders"
      />
    </div>
  );
}
