/**
 * The quoted ≠ charged ALARM — the "alerted on" that prisma/schema.prisma has
 * promised on VoiceCall.quotedTotal / chargedTotal since 2026-08-13 and nothing
 * implemented (2026-08-16). Two real incidents (2026-08-11, 2026-08-13) were
 * both found by hand, days later, by reading a transcript.
 *
 * Runs from the call-log "end" handler, AFTER the response (Next `after()`),
 * only for a call whose order was actually PLACED: a `total_changed` refusal
 * also stores both totals but bills nobody — that is the guard working, not an
 * incident. Idempotent by construction: the end event is retried, so the alarm
 * is CLAIMED with a conditional updateMany on `totalMismatchAlertedAt` and only
 * the claimant enqueues. Delivery reuses enqueueOpsMessage — superadmin bell +
 * email within a minute (eod-digest-closing flushes it), no new cron.
 */
import prisma from "@/lib/db";
import { enqueueOpsMessage } from "@/lib/ops-messages";
import { totalsMismatch } from "@/lib/voice/totals-mismatch";

export type TotalsMismatchAlarmInput = {
  callId: string;
  restaurantId: string;
  callSid: string;
  orderNumber: string | null;
  outcome: string | null;
  quoted: number | null;
  charged: number | null;
  endedAt: Date;
};

export type TotalsMismatchAlarmResult = "skipped" | "already_alerted" | "enqueued";

/** Pure: subject + body of the ops message. Exported for the test. */
export function formatTotalsMismatchMessage(a: TotalsMismatchAlarmInput & { restaurantName: string; currency: string }): {
  subject: string;
  body: string;
} {
  const cur = (a.currency || "").toUpperCase();
  const money = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}${cur ? ` ${cur}` : ""}`);
  const diff = a.quoted !== null && a.charged !== null ? a.charged - a.quoted : null;
  const name = a.restaurantName.length > 80 ? `${a.restaurantName.slice(0, 79)}…` : a.restaurantName;
  const subject = `Nabil AI: quoted ≠ charged — ${name} (${a.orderNumber ?? a.callSid})`;
  const body = [
    `Restaurant: ${a.restaurantName} (${a.restaurantId})`,
    `Call: ${a.callSid} — ended ${a.endedAt.toISOString()}`,
    `Order: ${a.orderNumber ?? "—"} (outcome ${a.outcome ?? "—"})`,
    `Quoted to the caller: ${money(a.quoted)}`,
    `Charged: ${money(a.charged)}`,
    `Difference: ${diff === null ? "—" : `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`}`,
    "",
    "The caller agreed to one total and was billed another. Open the restaurant → Impersonate →",
    `Phone ordering → this call (id ${a.callId}) for the transcript, the timeline and the order.`,
  ].join("\n");
  return { subject, body };
}

/**
 * Never throws. Returns what happened so the caller can log it.
 */
export async function alertTotalsMismatch(a: TotalsMismatchAlarmInput): Promise<TotalsMismatchAlarmResult> {
  const placed = a.outcome === "order_placed" || !!a.orderNumber;
  if (!placed || !totalsMismatch(a.quoted, a.charged)) return "skipped";

  // Claim first: whoever flips null → now is the one that alerts.
  const claim = await prisma.voiceCall.updateMany({
    where: { id: a.callId, totalMismatchAlertedAt: null },
    data: { totalMismatchAlertedAt: new Date() },
  });
  if (claim.count !== 1) return "already_alerted";

  try {
    const r = await prisma.restaurant.findUnique({ where: { id: a.restaurantId }, select: { name: true, currency: true } });
    const { subject, body } = formatTotalsMismatchMessage({
      ...a,
      restaurantName: r?.name ?? a.restaurantId,
      currency: r?.currency ?? "",
    });
    await enqueueOpsMessage({
      subject,
      body,
      // Superadmin-reachable (the admin call page needs the restaurant session).
      link: `/superadmin/restaurants/${a.restaurantId}`,
      ctaLabel: "Open the restaurant",
    });
    return "enqueued";
  } catch (e) {
    // A lost alarm is worse than a duplicate: release the claim so a retried
    // end event can alert, then surface the failure to the caller's logger.
    await prisma.voiceCall
      .updateMany({ where: { id: a.callId }, data: { totalMismatchAlertedAt: null } })
      .catch(() => undefined);
    throw e;
  }
}
