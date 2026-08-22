/**
 * The ONE place every transfer request passes through (A1b, Luigi 2026-08-22:
 * "some stores don't want ANY transfers, some very little, some as soon as the
 * customer asks… the agent should respond 'staff is busy preparing orders and
 * can't take calls now but I can help with anything store related'").
 *
 * Callers: transfer_to_human (tools.ts), the struggle hand-off and the DTMF-0
 * fast path (session.ts). A prompt paragraph (playbook.ts transferPolicyText)
 * tells the model what to expect, but the decision is made HERE — the model
 * can only say the sentence it is handed.
 *
 *   immediate  every request goes through (today's behaviour, the default)
 *   reluctant  the first explicit ask is deflected; the second explicit ask,
 *              or a genuine struggle, goes through
 *   never      no caller-requested transfer at all; deflect + keep helping
 *              (+ offer to take a message when the store allows it)
 */
import type { AgentConfig } from "./agent-config";
import { voicePhrase } from "./voice-i18n";

export type TransferTrigger = "caller_request" | "dtmf" | "struggle" | "tool_failure";

export type TransferPolicyContext = {
  cfg: AgentConfig;
  /** The caller's language (BCP-47 or locale code) for the spoken deflection. */
  language?: string | null;
  /** Explicit asks so far this call — incremented here for caller_request/dtmf. */
  transferAsks?: number;
};

export type TransferDecision = {
  allowed: boolean;
  reason: string;
  /** When refused: the exact sentence to speak (store's own line or the
   *  localized default). */
  speakExactly: string | null;
  /** When refused: what the model should do next. */
  instruction: string;
};

export function applyTransferPolicy(ctx: TransferPolicyContext, trigger: TransferTrigger, reason: string): TransferDecision {
  const cfg = ctx.cfg;
  const explicit = trigger === "caller_request" || trigger === "dtmf";
  if (explicit) ctx.transferAsks = (ctx.transferAsks ?? 0) + 1;
  const asks = ctx.transferAsks ?? 0;

  if (cfg.transferPolicy === "immediate") return { allowed: true, reason, speakExactly: null, instruction: "" };

  const deflect = (cfg.transferDeflectionMessage || "").trim() || voicePhrase(ctx.language, "transferDeflect");
  const fallback = cfg.transferTakeMessage
    ? ` If they insist, or you truly cannot help with what they need, offer to take a message — say "${voicePhrase(ctx.language, "transferMessageOffer")}" — and when they tell you, call leave_message with it.`
    : " If they insist, say plainly that staff can't take calls right now and suggest the restaurant's website or calling back when staff are free.";

  if (cfg.transferPolicy === "never") {
    return {
      allowed: false,
      reason,
      speakExactly: deflect,
      instruction: `Transfers are OFF for this store — nobody will pick up, so never say you are connecting them. Say speakExactly word for word, then keep helping with whatever they need yourself.${fallback}`,
    };
  }

  // reluctant
  if (asks >= 2 || trigger === "struggle" || trigger === "tool_failure") {
    return { allowed: true, reason, speakExactly: null, instruction: "" };
  }
  return {
    allowed: false,
    reason,
    speakExactly: deflect,
    instruction: `This store prefers to handle calls itself. Say speakExactly word for word and keep helping. If the caller asks for a person AGAIN, call transfer_to_human again — the second request is put through.${fallback}`,
  };
}
