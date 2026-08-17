import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/platform-auth";
import { NabilLinesClient } from "./NabilLinesClient";
import { NabilSetupRequestsClient } from "./NabilSetupRequestsClient";

/**
 * Superadmin › Nabil Phone Lines.
 *
 * Reads what Twilio actually has registered on every Nabil number, compares it
 * to what this deployment expects (voice webhook + the "PRIMARY HANDLER FAILS"
 * fallback on Fly), and repairs the drift with one click. Also shows who each
 * fallback layer would ring, so "if anything on our side fails, your phone
 * rings" is something we can SEE rather than something we assert.
 *
 * Since Nabil AI went on sale (2026-08-17) the page also carries the CONCIERGE
 * ACTIVATION queue: line-setup requests from new subscribers, provisioned by
 * hand within one business day, with a "mark done" action.
 *
 * Data is fetched client-side from /api/superadmin/voice-numbers and
 * /api/superadmin/voice-setup-requests — one Twilio round-trip per number — so
 * the shell renders instantly.
 */
export default async function NabilLinesPage() {
  // Platform-level Twilio state — FULL superadmin only. The layout already
  // bounced unauthenticated visitors to /login; a support user lands on the
  // dashboard (same pattern as the other settings pages).
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");
  return (
    <>
      <NabilLinesClient />
      <div className="max-w-6xl mx-auto px-6 pb-10">
        <NabilSetupRequestsClient />
      </div>
    </>
  );
}
