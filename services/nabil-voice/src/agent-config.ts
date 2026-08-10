/**
 * VoiceAgentConfig as consumed by the voice service. The app server
 * (/api/internal/voice/context) sends a `config` object — but an OLDER server
 * may not send one at all, so EVERY field falls back to today's permissive
 * behavior exactly (contract pinned 2026-08-10 in DESIGN-nabil-dashboard.md).
 */
export type AgentConfig = {
  canTakeOrders: boolean;
  canBookReservations: boolean;
  canAnswerFaq: boolean;
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
};

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
    quoteEta: bool(r.quoteEta, true),
    smsConfirmations: bool(r.smsConfirmations, true),
    maxCallSeconds,
    allowScheduledOrders: bool(r.allowScheduledOrders, true),
    afterHoursBehavior: BEHAVIORS.includes(r.afterHoursBehavior as AgentConfig["afterHoursBehavior"])
      ? (r.afterHoursBehavior as AgentConfig["afterHoursBehavior"])
      : "take_orders",
  };
}
