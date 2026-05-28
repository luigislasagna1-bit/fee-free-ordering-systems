import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listAddOnsForRestaurant } from "@/lib/addons";
import prisma from "@/lib/db";
import { AddOnsClient } from "./AddOnsClient";

export default async function AddOnsPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const user = await getSessionUser();
  // Three cases for "no restaurantId":
  //   - Not logged in at all → /login (NextAuth shows the sign-in form)
  //   - Superadmin (logged in, no restaurant ownership) → /superadmin
  //     (the platform admin dashboard — superadmins were ending up in a
  //      redirect loop here because /login bounced them right back as
  //      already-authed, which looked like being logged out)
  //   - Reseller / other role with no restaurantId → /superadmin too (they
  //     don't have a restaurant context, so this restaurant-scoped page
  //     doesn't apply; the platform dashboard is the safe landing)
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const params = await searchParams;
  // Pull marketplace listing data so the marketplace add-on card can show
  // dual-plan info: which mode the restaurant is on (Monthly vs PAYG),
  // whether a Monthly→PAYG switch is currently scheduled, and surface
  // the correct "Switch to" CTAs. AddOnsClient ignores this prop for
  // every other slug; marketplace is the only one with two billing modes.
  const [addOns, marketplaceListing] = await Promise.all([
    listAddOnsForRestaurant(user.restaurantId),
    prisma.marketplaceListing.findUnique({
      where: { restaurantId: user.restaurantId },
      select: {
        billingMode: true,
        isListed: true,
        switchToPaygOnCancel: true,
      },
    }),
  ]);

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

      <AddOnsClient
        addOns={addOns}
        marketplaceListing={marketplaceListing ? JSON.parse(JSON.stringify(marketplaceListing)) : null}
      />
    </div>
  );
}
