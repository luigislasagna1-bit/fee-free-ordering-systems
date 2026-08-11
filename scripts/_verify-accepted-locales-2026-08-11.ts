/**
 * Render the order-confirmation email in ALL 38 locales x every accepted mode
 * and prove the customer-visible sentence is the RIGHT one in each.
 *
 * Expectations come from t() itself (placeholders substituted the same way the
 * template substitutes them), so the check is exact and language-agnostic —
 * word-prefix matching breaks on zh/ja/th, which have no spaces.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verify-accepted-locales-2026-08-11.ts
 */
import { readdirSync } from "node:fs";
import { renderEmail } from "../src/emails/render";
import { getDict } from "../src/lib/i18n-dict";
import OrderConfirmation from "../src/emails/templates/OrderConfirmation";

const DIR = "src/messages";
const locales = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));

const ORDER_NUMBER = "ORD-519009065";
const OPENS = "Tue, 12 Aug, 11:00";

const BASE = {
  customerName: "Sameem",
  orderNumber: ORDER_NUMBER,
  restaurantName: "Luigi's",
  orderType: "Pickup",
  paidOnline: true,
  estimatedMinutes: 20,
  items: [{ name: "Lasagna", quantity: 1, price: 15.8, lineTotal: 15.8, modifiers: [] }],
  subtotal: 15.8,
  total: 15.8,
  trackingUrl: "https://example.com/t",
} as Record<string, unknown>;

const MODES = [
  { name: "accepted-asap", props: { alreadyAccepted: true }, body: "bodyAcceptedNow" },
  { name: "accepted-scheduled", props: { alreadyAccepted: true, scheduledLabel: "Friday 6:00 PM" }, body: "bodyAcceptedLater" },
  { name: "accepted-closed", props: { alreadyAccepted: true, placedWhileClosed: true, opensAtLabel: OPENS }, body: "bodyAcceptedClosed", note: "closedNoteAcceptedWithTime" },
  { name: "accepted-closed-notime", props: { alreadyAccepted: true, placedWhileClosed: true }, body: "bodyAcceptedClosed", note: "closedNoteAccepted" },
  { name: "pending-control", props: {}, body: "bodyReceived" },
  { name: "pending-closed-control", props: { placedWhileClosed: true, opensAtLabel: OPENS }, body: "bodyReceived", note: "closedNoteWithTime" },
];

/** Same shape on both sides of every comparison. */
const flat = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;| /g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  let fails = 0;
  let checks = 0;
  for (const loc of locales) {
    const t = await getDict(loc);
    for (const mode of MODES) {
      const html = await renderEmail(OrderConfirmation({ t, ...BASE, ...mode.props } as never));
      const text = flat(html);
      const problems: string[] = [];

      // 1. no raw dictionary key leaked through (missing key fallback)
      if (/email\.orderConfirmed\.[A-Za-z]/.test(text)) problems.push("RAW KEY");
      // 2. no unsubstituted placeholder
      const stray = text.match(/\{(orderNumber|openingTime|estimatedMinutes|time|n)\}/);
      if (stray) problems.push(`PLACEHOLDER ${stray[0]}`);

      // 3. the RIGHT body sentence, exactly as this locale words it
      const wantBody = flat(t(`email.orderConfirmed.${mode.body}`, { orderNumber: ORDER_NUMBER }));
      if (!text.includes(wantBody)) problems.push(`MISSING ${mode.body}`);

      // 4. the right closed note, and never the other one
      if (mode.note) {
        const wantNote = flat(t(`email.orderConfirmed.${mode.note}`, { openingTime: OPENS }));
        if (!text.includes(wantNote)) problems.push(`MISSING ${mode.note}`);
      }

      // 5. accepted modes must NEVER carry the awaiting sentence, the
      //    follow-up promise, or the pending closed note
      if (mode.props.alreadyAccepted) {
        const awaiting = flat(t("email.orderConfirmed.bodyReceived", { orderNumber: ORDER_NUMBER }));
        if (text.includes(awaiting)) problems.push("AWAITING LEAKED");
        for (const k of ["bodyFollowUpPickup", "bodyFollowUpDelivery"]) {
          const s = flat(t(`email.orderConfirmed.${k}`, { estimatedMinutes: 20 }));
          if (text.includes(s)) problems.push(`FOLLOWUP LEAKED (${k})`);
        }
        if (mode.props.placedWhileClosed) {
          for (const k of ["closedNote", "closedNoteWithTime"]) {
            const s = flat(t(`email.orderConfirmed.${k}`, { openingTime: OPENS }));
            if (text.includes(s)) problems.push(`OLD CLOSED NOTE (${k})`);
          }
        }
      } else {
        // and a pending order must be untouched by any of this
        const acc = flat(t("email.orderConfirmed.headerTitleAccepted"));
        if (text.includes(acc)) problems.push("ACCEPTED HEADER ON PENDING");
      }

      checks++;
      if (problems.length) { fails++; console.log(`FAIL ${loc} ${mode.name}: ${problems.join(", ")}`); }
    }
  }
  console.log(
    fails === 0
      ? `PASS: ${locales.length} locales x ${MODES.length} modes = ${checks} renders, 0 failures`
      : `${fails} FAILURES of ${checks}`,
  );
  if (fails) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
