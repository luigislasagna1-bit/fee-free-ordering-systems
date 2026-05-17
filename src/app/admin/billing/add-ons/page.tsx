import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listAddOnsForRestaurant } from "@/lib/addons";
import { AddOnsClient } from "./AddOnsClient";

export default async function AddOnsPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const user = await getSessionUser();
  if (!user?.restaurantId) redirect("/login");

  const params = await searchParams;
  const addOns = await listAddOnsForRestaurant(user.restaurantId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/billing"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; Back to billing
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Add-ons</h1>
        <p className="text-sm text-gray-600 mt-1">
          The core product is free forever. Unlock individual features below by
          subscribing to the matching add-on. Cancel anytime — you keep access
          until the end of the billing period.
        </p>
      </div>

      {params.subscribed && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <strong>Success!</strong> Your subscription is being activated. It can
          take up to a minute for the feature to unlock.
        </div>
      )}

      <AddOnsClient addOns={addOns} />
    </div>
  );
}
