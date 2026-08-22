/**
 * VoiceAgentConfig as consumed by the voice service. The app server
 * (/api/internal/voice/context) sends a `config` object — but an OLDER server
 * may not send one at all, so EVERY field falls back to today's permissive
 * behavior exactly (contract pinned 2026-08-10 in DESIGN-nabil-dashboard.md).
 */
/** VoiceAgentConfig.pickupPaymentMode / deliveryPaymentMode. */
export type PaymentMode = "unpaid" | "paid" | "both";
const PAYMENT_MODES: PaymentMode[] = ["unpaid", "paid", "both"];

export type AgentConfig = {
  canTakeOrders: boolean;
  canBookReservations: boolean;
  canAnswerFaq: boolean;
  canAnswerOrderStatus: boolean;
  /** May quote ready-time estimates (pickup/delivery minutes) to the caller. */
  quoteEta: boolean;
  /** Gates ALL texting: the send_sms_link tool, every prompt offer to text,
   *  and the missed-call text-back at finalize. */
  smsConfirmations: boolean;
  /** Call-length cap in seconds: wrap-up nudge at T-45s, hangup at T+15s
   *  grace. null = no cap (today's behavior). */
  maxCallSeconds: number | null;
  /** Voice can't schedule ahead either way — true still refuses but offers
   *  the SMS ordering link; false refuses outright (store takes none). */
  allowScheduledOrders: boolean;
  afterHoursBehavior: "take_orders" | "reservations_only" | "message_only" | "transfer";
  /** v2: BUILD pizzas + combos by voice instead of transferring them.
   *  Defaults FALSE — an older server that sends no config, or a store that
   *  hasn't opted in, keeps v1's transfer behavior exactly. */
  allowPizzaCombo: boolean;
  /** Pizza option-group ids the store wants confirmed aloud every time rather
   *  than silently defaulted (Luigi: "let the store choose which ones to always
   *  offer"). Empty = smart defaults. */
  pizzaAskGroups: string[];
  /** How a PHONE order is paid, per order type — deliberately separate from the
   *  store's web payment settings (Luigi 2026-08-12: "there should be separate
   *  toggles for ONLINE orders and separate toggles for PHONE ORDERS").
   *    unpaid = pay at the store (cash) — what every store does today
   *    paid   = the caller must pay a link before we accept the order
   *    both   = link, with a pay-at-store fallback when it isn't paid in time
   *  Until pay-by-link exists, "paid" REFUSES rather than quietly taking cash:
   *  an owner who asked for prepayment must not be handed an unpaid order. */
  pickupPaymentMode: PaymentMode;
  deliveryPaymentMode: PaymentMode;
  /** Extra languages the owner enabled. Non-empty ⇒ the phone system is
   *  auto-detecting the caller's language, so the agent must answer in it. */
  languages: string[];
  /** Offer a cheaper same-day deal when one covers what the caller asked for. */
  offerDayDeals: boolean;
  /** The persona name the agent answers to on calls ("Hi, this is Sophia").
   *  Restaurant's own choice (Settings → General / onboarding wizard); an
   *  older server or a store that never set one sends nothing, so this always
   *  falls back to "Nabil" — the product's own default persona. */
  agentName: string;
  /** Per-store TRANSFER POLICY (Luigi 2026-08-22: "some stores don't want ANY
   *  transfers, some very little, some as soon as the customer asks").
   *    never     = no caller-requested transfers; deflect + keep helping, offer
   *                to take a message
   *    reluctant = deflect the first ask; transfer on the second explicit ask
   *                or when the agent is genuinely stuck
   *    immediate = transfer as soon as the caller asks (today's behaviour)
   *  Enforced by tools.ts applyTransferPolicy — the ONE place every transfer
   *  request passes through — never by prompt text alone. Default "immediate"
   *  so an older server / unset store keeps today's behaviour exactly. */
  transferPolicy: TransferPolicy;
  /** The store's own deflection line; null ⇒ the localized default
   *  ("Our staff is busy preparing orders and can't take calls right now…"). */
  transferDeflectionMessage: string | null;
  /** When a transfer is refused, offer to take a message for a callback. */
  transferTakeMessage: boolean;
};

export type TransferPolicy = "never" | "reluctant" | "immediate";
const TRANSFER_POLICIES: TransferPolicy[] = ["never", "reluctant", "immediate"];

const BEHAVIORS: ReadonlyArray<AgentConfig["afterHoursBehavior"]> = [
  "take_orders",
  "reservations_only",
  "message_only",
  "transfer",
];

export function normalizeAgentConfig(raw: unknown): AgentConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);
  const maxCallSeconds =
    typeof r.maxCallSeconds === "number" && Number.isFinite(r.maxCallSeconds) && r.maxCallSeconds > 0
      ? Math.floor(r.maxCallSeconds)
      : null;
  return {
    canTakeOrders: bool(r.canTakeOrders, true),
    canBookReservations: bool(r.canBookReservations, true),
    canAnswerFaq: bool(r.canAnswerFaq, true),
    canAnswerOrderStatus: bool(r.canAnswerOrderStatus, true),
    quoteEta: bool(r.quoteEta, true),
    smsConfirmations: bool(r.smsConfirmations, true),
    maxCallSeconds,
    allowScheduledOrders: bool(r.allowScheduledOrders, true),
    afterHoursBehavior: BEHAVIORS.includes(r.afterHoursBehavior as AgentConfig["afterHoursBehavior"])
      ? (r.afterHoursBehavior as AgentConfig["afterHoursBehavior"])
      : "take_orders",
    // Opt-in, and deliberately NOT permissive-by-default like the rest: pizza
    // pricing is the most defect-prone path in the product, so a missing config
    // must mean "keep transferring", never "start building".
    allowPizzaCombo: bool(r.allowPizzaCombo, false),
    pizzaAskGroups: Array.isArray(r.pizzaAskGroups)
      ? r.pizzaAskGroups.filter((x): x is string => typeof x === "string").slice(0, 20)
      : [],
    // "unpaid" is the safe default in both directions: it is the schema default,
    // it is what every store does today, and an OLDER app server that sends no
    // config at all must keep taking pay-at-store orders rather than suddenly
    // refusing them because it looks like prepayment was required.
    pickupPaymentMode: PAYMENT_MODES.includes(r.pickupPaymentMode as PaymentMode)
      ? (r.pickupPaymentMode as PaymentMode)
      : "unpaid",
    deliveryPaymentMode: PAYMENT_MODES.includes(r.deliveryPaymentMode as PaymentMode)
      ? (r.deliveryPaymentMode as PaymentMode)
      : "unpaid",
    languages: Array.isArray(r.languages)
      ? r.languages.filter((x): x is string => typeof x === "string").slice(0, 38)
      : [],
    offerDayDeals: bool(r.offerDayDeals, false),
    agentName: typeof r.agentName === "string" && r.agentName.trim() ? r.agentName.trim().slice(0, 40) : "Nabil",
    transferPolicy: TRANSFER_POLICIES.includes(r.transferPolicy as TransferPolicy) ? (r.transferPolicy as TransferPolicy) : "immediate",
    transferDeflectionMessage:
      typeof r.transferDeflectionMessage === "string" && r.transferDeflectionMessage.trim()
        ? r.transferDeflectionMessage.trim().slice(0, 300)
        : null,
    transferTakeMessage: bool(r.transferTakeMessage, true),
  };
}
