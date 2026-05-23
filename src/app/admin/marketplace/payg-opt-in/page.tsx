import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { Sparkles, AlertCircle, CreditCard, CheckCircle2, Truck, ArrowRight } from "lucide-react";
import { getPlatformTax } from "@/lib/platform-tax";
import { restaurantHasCardOnFile } from "@/lib/addons";
import { getMarketplaceEligibility } from "@/lib/marketplace-eligibility";
import { PaygOptInButton } from "./PaygOptInButton";
import { AddCardButton } from "./AddCardButton";

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

export default async function PaygOptInPage({
  searchParams,
}: {
  searchParams: Promise<{ card_saved?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const params = await searchParams;
  const justSavedCard = params.card_saved === "1";

  const [listing, restaurant, hasCard, eligibility] = await Promise.all([
    prisma.marketplaceListing.findUnique({
      where: { restaurantId: user.restaurantId },
      select: { id: true, billingMode: true, isListed: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { country: true, state: true },
    }),
    restaurantHasCardOnFile(user.restaurantId),
    getMarketplaceEligibility(user.restaurantId, "payg"),
  ]);

  // Already actively listed → no need to re-opt-in. Two cases redirect:
  //   - billingMode "monthly" + listed → they're already on the paid plan
  //   - billingMode "payg" + listed → they already opted in
  // A HIDDEN listing (isListed=false, e.g. post-cancellation) falls
  // through so they can re-confirm PAYG.
  if (listing && listing.isListed) {
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
          <Sparkles className="w-5 h-5 text-emerald-500" />
          Pay-as-you-go Marketplace
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          No subscription. You only pay when customers actually order through
          our marketplace. Opt out any time.
        </p>
      </div>

      {/* Eligibility gate. Several blockers can fire here — not just
          delivery: not_published (most common for new restaurants),
          needs_delivery_source_set, needs_driver_pool,
          needs_online_payments, needs_stripe_connect. Heading now reflects
          the actual reason so owners aren't misled into fixing the wrong
          thing. */}
      {!eligibility.eligible && (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-red-900">
                {eligibility.reason === "not_published"
                  ? "Publish your restaurant first"
                  : eligibility.reason === "needs_online_payments"
                  ? "Online card payments required"
                  : eligibility.reason === "needs_stripe_connect"
                  ? "Finish Stripe Connect setup"
                  : eligibility.reason === "needs_driver_pool"
                  ? "Driver Pool add-on required"
                  : eligibility.reason === "needs_delivery_source_set"
                  ? "Choose a delivery source"
                  : "Setup required before marketplace signup"}
              </h2>
              <p className="text-sm text-red-800 mt-1 leading-relaxed">
                {eligibility.blockerMessage}
              </p>
              {eligibility.blockerHref && (
                <Link
                  href={eligibility.blockerHref}
                  className="mt-3 inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition"
                >
                  Fix this <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Card-on-file gate. Mandatory before allowing PAYG opt-in:
          accruing per-order fees without a way to collect them later is
          a billing dead-end. The Stripe Checkout in setup mode collects
          the card without charging, and our setup_intent webhook sets
          it as the customer's default payment method for future
          invoices (including the monthly settlement). */}
      <div className={`rounded-2xl border-2 p-4 sm:p-5 ${
        hasCard
          ? "border-emerald-200 bg-emerald-50"
          : "border-emerald-300 bg-emerald-50"
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            hasCard ? "bg-emerald-500 text-white" : "bg-emerald-500 text-white"
          }`}>
            {hasCard ? <CheckCircle2 className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`font-bold ${hasCard ? "text-emerald-900" : "text-emerald-900"}`}>
              {hasCard
                ? (justSavedCard ? "Card saved — you're ready to opt in" : "Card on file ✓")
                : "Step 1: Add a payment method"}
            </h2>
            <p className={`text-sm mt-0.5 leading-relaxed ${hasCard ? "text-emerald-800" : "text-emerald-800"}`}>
              {hasCard
                ? "We'll use your saved card to auto-charge the monthly PAYG bill at the end of each billing cycle. You can update it any time from your Stripe billing portal."
                : "PAYG bills you monthly via Stripe based on the orders you got that month. We need a card on file before you can opt in — otherwise we'd have no way to collect at month-end."}
            </p>
            {!hasCard && <AddCardButton />}
          </div>
        </div>
      </div>

      <div className={`bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4 ${
        !hasCard ? "opacity-60 pointer-events-none" : ""
      }`}>
        <h2 className="font-bold text-gray-900">
          {hasCard ? "What you're agreeing to" : "Step 2: Confirm the PAYG terms"}
        </h2>

        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 leading-relaxed">
          💡 <strong>You picked well.</strong> We recommend Pay-As-You-Go until
          you&apos;re consistently doing <strong>60–70 marketplace orders/month</strong>.
          That&apos;s when Monthly ($199.99 flat, unlimited) starts saving money
          vs. PAYG ($3 × 70 = $210). You can switch any time.
        </div>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold flex-shrink-0">$0</span>
            <span>charged today. <strong>You will NOT be charged $199.99 upfront.</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold flex-shrink-0">$3</span>
            <span>per marketplace order — accrued and billed once per month after the fact via Stripe.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold flex-shrink-0">$249.99</span>
            <span>monthly cap. Above ~83 orders/month, every additional marketplace order is <strong>free</strong>.</span>
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
        </ul>

        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 leading-relaxed">
          <strong className="block mb-0.5">Orders from your own website / widget stay FREE.</strong>
          We only charge when an order originates from our Marketplace
          app. Direct customers ordering at <code className="bg-white px-1 rounded">/order/your-slug</code> or
          via your widget never trigger this fee.
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Driver Pool is NOT included</strong> on PAYG. If you want
            ShipDay overflow delivery, either subscribe to Driver Pool
            ($19.99/mo) separately, or switch to the Marketplace Monthly plan
            ($199.99/mo) where it&apos;s bundled.
          </div>
        </div>

        <p className="text-[11px] text-gray-500 leading-snug">
          By clicking the button below, you authorize Fee Free Ordering Systems
          to bill the $3-per-order fee monthly via Stripe (capped at $249.99/month
          plus any applicable tax) until you cancel. Opt out any time from
          <Link href="/admin/marketplace" className="text-emerald-600 hover:underline">{" "}/admin/marketplace</Link>.
        </p>
      </div>

      <PaygOptInButton
        disabled={!hasCard || !eligibility.eligible}
        blockerLabel={
          !hasCard
            ? "Add a payment method to continue"
            : !eligibility.eligible
            ? eligibility.reason === "not_published"
              ? "Publish your restaurant first"
              : eligibility.reason === "needs_online_payments"
              ? "Activate Online Payments add-on first"
              : eligibility.reason === "needs_stripe_connect"
              ? "Finish Stripe Connect setup first"
              : eligibility.reason === "needs_driver_pool"
              ? "Subscribe to Driver Pool first"
              : eligibility.reason === "needs_delivery_source_set"
              ? "Choose a delivery source first"
              : "Resolve the issue above to continue"
            : undefined
        }
      />

      <div className="text-center text-xs text-gray-500">
        Prefer a flat predictable bill?{" "}
        <Link href="/admin/billing/add-ons" className="text-emerald-600 hover:underline font-semibold">
          Subscribe to Marketplace Monthly ($199.99/mo)
        </Link>{" "}
        — unlimited orders, Driver Pool included, charged upfront.
      </div>
    </div>
  );
}
