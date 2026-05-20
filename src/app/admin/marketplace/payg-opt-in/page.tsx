import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { Sparkles, AlertCircle } from "lucide-react";
import { getPlatformTax } from "@/lib/platform-tax";
import { PaygOptInButton } from "./PaygOptInButton";

/**
 * /admin/marketplace/payg-opt-in — restaurant opts into the marketplace
 * via pay-as-you-go billing (no Stripe subscription required).
 *
 * Shows a clear summary of what they're agreeing to: $3 per marketplace
 * order, capped at $249.99/month, 13% tax on top, can opt out any time.
 * Confirm button creates the MarketplaceListing in payg mode and routes
 * them to /admin/marketplace.
 *
 * Restaurants already on the monthly plan land here by mistake → we
 * redirect them to /admin/marketplace where the listed billing card
 * already shows their state.
 */
export const dynamic = "force-dynamic";

export default async function PaygOptInPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const [listing, restaurant] = await Promise.all([
    prisma.marketplaceListing.findUnique({
      where: { restaurantId: user.restaurantId },
      select: { id: true, billingMode: true, isListed: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { country: true, state: true },
    }),
  ]);

  // Already on monthly OR already opted into payg → nothing to do here.
  if (listing) {
    redirect("/admin/marketplace");
  }

  // Compute the tax that WILL apply for this restaurant so the agreement
  // shows the exact rate. Non-Canadian / unknown-province restaurants
  // see "0% (tax-exempt)" — no surprises.
  const tax = getPlatformTax({ country: restaurant?.country, state: restaurant?.state });

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <Link href="/admin/marketplace" className="text-sm text-gray-600 hover:text-gray-900">
          &larr; Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-orange-500" />
          Pay-as-you-go Marketplace
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          No subscription. You only pay when customers actually order through
          our marketplace. Opt out any time.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4">
        <h2 className="font-bold text-gray-900">What you&apos;re agreeing to</h2>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold flex-shrink-0">$3</span>
            <span>per marketplace order — billed once per month after the fact.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold flex-shrink-0">$249.99</span>
            <span>monthly cap. Above ~83 orders/month, every additional order is <strong>free</strong>.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 font-bold flex-shrink-0">
              {tax.ratePct > 0 ? `+${tax.ratePct}%` : "0%"}
            </span>
            <span>
              tax on top of the monthly bill ({tax.label}). All amounts in USD;
              Canadian restaurants are charged the destination-province
              GST/HST per CRA; US/international restaurants are tax-exempt.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 font-bold flex-shrink-0">$0</span>
            <span>to sign up. No card on file required for opt-in — we&apos;ll only ask for payment if you actually accrue fees.</span>
          </li>
        </ul>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Driver Pool is NOT included</strong> on PAYG. If you want
            ShipDay overflow delivery, either subscribe to Driver Pool
            ($19.99/mo) separately, or switch to the Marketplace Monthly plan
            ($199.99/mo) where it&apos;s bundled.
          </div>
        </div>
      </div>

      <PaygOptInButton />
    </div>
  );
}
