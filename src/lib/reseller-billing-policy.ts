/**
 * Reseller white-label billing policy — single source of truth.
 *
 * Every behavior in the white-label subscription flow (subscribe,
 * upgrade, downgrade, cancel) reads from this config. Change a flag
 * here and the UI copy, server-side enforcement, and customer-facing
 * explanations all stay in sync.
 *
 * Current policy (2026-05-25, set by Luigi):
 *   - Monthly recurring billing, charged in full on day 1.
 *   - No refunds for unused time once a month is billed.
 *   - Cancellation keeps service active until the period ends.
 *   - Upgrades are prorated immediately (charged the diff for remaining days).
 *   - Downgrades are NOT exposed in our UI — to move down a tier, the
 *     reseller cancels (keeps service to period end) then resubscribes
 *     at the lower tier on the next billing cycle. This guarantees the
 *     no-refund rule isn't circumvented via Stripe's default downgrade
 *     credit behavior.
 *
 * To change policy:
 *   - Want to allow self-serve downgrades with prorated credit? Set
 *     `allowSelfServeDowngrade = true`. We'd ALSO need to flip the
 *     Stripe Customer Portal setting (Dashboard → Settings → Billing
 *     → Customer portal → enable plan switching) and add downgrade UI
 *     to /reseller/branding.
 *   - Want to issue refunds for partial-period cancellations? Set
 *     `issueRefundsForUnusedTime = true` and update the cancel webhook
 *     handler to call stripe.refunds.create().
 *   - Want shorter/longer minimum commitment? Change `minimumBillingDays`
 *     and update copy. (Note: 30-day minimum is implicit in monthly
 *     recurring + no-refund — there's no separate enforcement code.)
 */
export const WHITE_LABEL_BILLING_POLICY = {
  /** Monthly subscription. We don't currently offer yearly. */
  billingInterval: "month" as const,

  /** Whether tier change creates an immediate prorated invoice. true =
   *  charge the diff now and switch immediately (current behavior).
   *  false = schedule the change for next billing cycle (no immediate
   *  charge). */
  upgradeIsImmediate: true,

  /** Whether resellers can downgrade themselves via UI or Stripe Portal.
   *  false (current) = they must cancel + resubscribe at the new tier.
   *  true = expose a "Downgrade to Basic" button and use Subscription
   *  Schedules to apply the change at period end. */
  allowSelfServeDowngrade: false,

  /** Whether cancellation keeps service to the end of the billing period.
   *  true (current) = uses cancel_at_period_end=true. They keep the tier,
   *  no refund. false = immediate cancel + prorated credit (we DON'T do
   *  this). */
  cancelKeepsServiceToPeriodEnd: true,

  /** Whether we issue refunds for unused time. false (current) = no
   *  refunds ever once a month is billed. true = call stripe.refunds
   *  in the cancellation handler. */
  issueRefundsForUnusedTime: false,

  /** Minimum days of billing once a sub starts. 30 = always at least
   *  one full month paid. This is enforced implicitly by monthly
   *  billing + no-refund — there's no separate code path. */
  minimumBillingDays: 30,

  /** Currency for displayed prices. Stripe actually bills in the
   *  customer's local currency converted from USD on their statement,
   *  but our app displays USD throughout. */
  displayCurrency: "USD" as const,
} as const;

export type WhiteLabelBillingPolicy = typeof WHITE_LABEL_BILLING_POLICY;
