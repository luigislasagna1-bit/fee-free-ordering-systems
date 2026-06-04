import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { Sparkles, AlertCircle, CreditCard, CheckCircle2, Truck, ArrowRight } from "lucide-react";
import { getPlatformTax } from "@/lib/platform-tax";
import { restaurantHasCardOnFile } from "@/lib/addons";
import { getMarketplaceEligibility } from "@/lib/marketplace-eligibility";
import { PaygOptInButton } from "./PaygOptInButton";
import { AddCardButton } from "./AddCardButton";
import { SwitchToPaygButton } from "./SwitchToPaygButton";

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
  const t = await getTranslations("admin.paygOptInPage");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const params = await searchParams;
  const justSavedCard = params.card_saved === "1";

  // Pull the marketplace add-on subscription too — needed to detect
  // Monthly subscribers and surface the switch-to-PAYG confirmation
  // view instead of redirecting them away.
  const marketplaceAddOn = await prisma.addOn.findUnique({
    where: { slug: "marketplace" },
    select: { id: true },
  });
  const monthlySub = marketplaceAddOn
    ? await prisma.restaurantAddOn.findUnique({
        where: {
          restaurantId_addOnId: {
            restaurantId: user.restaurantId,
            addOnId: marketplaceAddOn.id,
          },
        },
        select: {
          status: true,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: true,
        },
      })
    : null;

  const [listing, restaurant, hasCard, eligibility] = await Promise.all([
    prisma.marketplaceListing.findUnique({
      where: { restaurantId: user.restaurantId },
      select: { id: true, billingMode: true, isListed: true, switchToPaygOnCancel: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { country: true, state: true },
    }),
    restaurantHasCardOnFile(user.restaurantId),
    getMarketplaceEligibility(user.restaurantId, "payg"),
  ]);

  const isOnMonthly = !!monthlySub && (monthlySub.status === "active" || monthlySub.status === "trialing");

  // Monthly subscriber → render the SWITCH-TO-PAYG confirmation view.
  // Don't redirect them away (the old behaviour) — they explicitly
  // clicked "Switch to Pay-As-You-Go" on the billing page and expect
  // to land somewhere actionable.
  if (isOnMonthly) {
    return (
      <SwitchFromMonthlyView
        switchPending={!!monthlySub.cancelAtPeriodEnd && !!listing?.switchToPaygOnCancel}
        switchAt={monthlySub.currentPeriodEnd}
      />
    );
  }

  // Already on PAYG and listed → no need to re-opt-in. Send them to
  // the marketplace settings page where they can manage their listing.
  if (listing && listing.isListed && listing.billingMode === "payg") {
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
          &larr; {t("backLink")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          {t("pageTitle")}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {t("pageSubtitle")}
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
                  ? t("eligibility.notPublished")
                  : eligibility.reason === "needs_online_payments"
                  ? t("eligibility.needsOnlinePayments")
                  : eligibility.reason === "needs_stripe_connect"
                  ? t("eligibility.needsStripeConnect")
                  : eligibility.reason === "needs_driver_pool"
                  ? t("eligibility.needsDriverPool")
                  : eligibility.reason === "needs_delivery_source_set"
                  ? t("eligibility.needsDeliverySource")
                  : t("eligibility.setupRequired")}
              </h2>
              <p className="text-sm text-red-800 mt-1 leading-relaxed">
                {eligibility.blockerMessage}
              </p>
              {eligibility.blockerHref && (
                <Link
                  href={eligibility.blockerHref}
                  className="mt-3 inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition"
                >
                  {t("eligibility.fixThisButton")} <ArrowRight className="w-4 h-4" />
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
                ? (justSavedCard ? t("card.savedReady") : t("card.onFile"))
                : t("card.step1AddCard")}
            </h2>
            <p className={`text-sm mt-0.5 leading-relaxed ${hasCard ? "text-emerald-800" : "text-emerald-800"}`}>
              {hasCard
                ? t("card.savedDescription")
                : t("card.noCardDescription")}
            </p>
            {!hasCard && <AddCardButton />}
          </div>
        </div>
      </div>

      <div className={`bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4 ${
        !hasCard ? "opacity-60 pointer-events-none" : ""
      }`}>
        <h2 className="font-bold text-gray-900">
          {hasCard ? t("terms.heading") : t("terms.step2Heading")}
        </h2>

        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 leading-relaxed">
          {t.rich("terms.pickWellNote", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </div>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold flex-shrink-0">$0</span>
            <span>{t.rich("terms.chargedToday", { strong: (chunks) => <strong>{chunks}</strong> })}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold flex-shrink-0">$3</span>
            <span>{t("terms.perOrder")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold flex-shrink-0">$249.99</span>
            <span>{t.rich("terms.monthlyCap", { strong: (chunks) => <strong>{chunks}</strong> })}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 font-bold flex-shrink-0">
              {tax.ratePct > 0 ? `+${tax.ratePct}%` : "0%"}
            </span>
            <span>
              {t("terms.taxNote", { taxLabel: tax.label })}
            </span>
          </li>
        </ul>

        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 leading-relaxed">
          <strong className="block mb-0.5">{t("terms.directOrdersFreeHeading")}</strong>
          {t.rich("terms.directOrdersFreeBody", {
            code: (chunks) => <code className="bg-white px-1 rounded">{chunks}</code>,
          })}
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            {t.rich("terms.driverPoolNotIncluded", { strong: (chunks) => <strong>{chunks}</strong> })}
          </div>
        </div>

        <p className="text-[11px] text-gray-500 leading-snug">
          {t.rich("terms.authorization", {
            link: (chunks) => <Link href="/admin/marketplace" className="text-emerald-600 hover:underline">{chunks}</Link>,
          })}
        </p>
      </div>

      <PaygOptInButton
        disabled={!hasCard || !eligibility.eligible}
        blockerLabel={
          !hasCard
            ? t("blocker.addPaymentMethod")
            : !eligibility.eligible
            ? eligibility.reason === "not_published"
              ? t("blocker.publishFirst")
              : eligibility.reason === "needs_online_payments"
              ? t("blocker.activateOnlinePayments")
              : eligibility.reason === "needs_stripe_connect"
              ? t("blocker.finishStripeConnect")
              : eligibility.reason === "needs_driver_pool"
              ? t("blocker.subscribeDriverPool")
              : eligibility.reason === "needs_delivery_source_set"
              ? t("blocker.chooseDeliverySource")
              : t("blocker.resolveAbove")
            : undefined
        }
      />

      <div className="text-center text-xs text-gray-500">
        {t.rich("monthlyUpsell", {
          link: (chunks) => (
            <Link href="/admin/billing/add-ons" className="text-emerald-600 hover:underline font-semibold">
              {chunks}
            </Link>
          ),
        })}
      </div>
    </div>
  );
}

/**
 * Renders the switch-from-Monthly confirmation view. Two states:
 *
 *   - No switch pending → big "Switch to Pay-As-You-Go" button. Click
 *     triggers POST /api/admin/marketplace/switch-to-payg which sets
 *     Stripe's cancel_at_period_end=true on the Monthly sub and
 *     writes a flag on MarketplaceListing for the webhook to read.
 *
 *   - Switch already pending → green "Switch scheduled" panel showing
 *     the exact date the transition will happen, plus an "Undo / stay
 *     on Monthly" button that DELETEs to the same endpoint.
 *
 * In both states the user stays on Monthly until the period ends —
 * unlimited orders, Driver Pool bundled. PAYG ($3/order) only kicks
 * in after the cycle closes; no proration, no surprise charges.
 */
async function SwitchFromMonthlyView({
  switchPending,
  switchAt,
}: {
  switchPending: boolean;
  switchAt: Date | null;
}) {
  const t = await getTranslations("admin.paygOptInPage");
  const switchDateLabel = switchAt
    ? new Date(switchAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <Link href="/admin/billing" className="text-sm text-gray-600 hover:text-gray-900">
          &larr; {t("switch.backToBilling")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          {t("switch.pageTitle")}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {t.rich("switch.pageSubtitle", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </div>

      {switchPending && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-emerald-900">{t("switch.scheduledHeading")}</h2>
              <p className="text-sm text-emerald-800 mt-1 leading-relaxed">
                {t.rich("switch.scheduledBody", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                  switchDate: switchDateLabel ?? t("switch.endOfCycle"),
                })}
              </p>
            </div>
          </div>

          {/* Loud Driver Pool warning. The bundled Driver Pool inclusion
              ends with the Monthly plan — without an active Driver Pool
              subscription the owner loses ShipDay dispatch AND can't
              fulfil Marketplace orders post-switch (Marketplace orders
              need drivers). Existing italic caption was too easy to
              miss; promoted to its own panel with a direct subscribe
              link. Luigi 2026-05-31. */}
          <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-amber-900">
                  {t("switch.driverPoolEndsHeading")}
                </h2>
                <p className="text-sm text-amber-900 mt-1 leading-relaxed">
                  {t.rich("switch.driverPoolEndsBody", { strong: (chunks) => <strong>{chunks}</strong> })}
                </p>
                <Link
                  href="/admin/billing/add-ons#driver_pool"
                  className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition"
                >
                  {t("switch.subscribeDriverPool")}
                </Link>
              </div>
            </div>
          </div>
          <SwitchToPaygButton mode="undo" />
        </div>
      )}

      {!switchPending && (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4">
            <h2 className="font-bold text-gray-900">{t("switch.whatHappensHeading")}</h2>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 font-bold flex-shrink-0 w-16">{t("switch.timelineNow")}</span>
                <span>
                  {t.rich("switch.timelineNowBody", { strong: (chunks) => <strong>{chunks}</strong> })}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-500 font-bold flex-shrink-0 w-16">
                  {switchDateLabel ?? t("switch.cycleEnd")}
                </span>
                <span>
                  {t("switch.timelineSwitchDateBody")}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-500 font-bold flex-shrink-0 w-16">{t("switch.timelineAfter")}</span>
                <span>
                  {t("switch.timelineAfterBody")}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-500 font-bold flex-shrink-0 w-16">{t("switch.timelineUndo")}</span>
                <span>
                  {t.rich("switch.timelineUndoBody", { q: (chunks) => <>&quot;{chunks}&quot;</> })}
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              {t.rich("switch.reminderNote", { strong: (chunks) => <strong>{chunks}</strong> })}
            </div>
          </div>

          <SwitchToPaygButton mode="schedule" />
        </>
      )}

      <div className="text-center text-xs text-gray-500">
        {t.rich("switch.changedMind", {
          link: (chunks) => (
            <Link href="/admin/billing" className="text-emerald-600 hover:underline font-semibold">
              {chunks}
            </Link>
          ),
        })}
      </div>
    </div>
  );
}
