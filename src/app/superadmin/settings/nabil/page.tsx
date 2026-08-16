import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/platform-auth";
import { NabilLinesClient } from "./NabilLinesClient";

/**
 * Superadmin › Nabil Phone Lines.
 *
 * Reads what Twilio actually has registered on every Nabil number, compares it
 * to what this deployment expects (voice webhook + the "PRIMARY HANDLER FAILS"
 * fallback on Fly), and repairs the drift with one click. Also shows who each
 * fallback layer would ring, so "if anything on our side fails, your phone
 * rings" is something we can SEE rather than something we assert.
 *
 * Data is fetched client-side from /api/superadmin/voice-numbers — one Twilio
 * round-trip per number — so the shell renders instantly.
 */
export default async function NabilLinesPage() {
  // Platform-level Twilio state — FULL superadmin only. The layout already
  // bounced unauthenticated visitors to /login; a support user lands on the
  // dashboard (same pattern as the other settings pages).
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");
  return <NabilLinesClient />;
}
