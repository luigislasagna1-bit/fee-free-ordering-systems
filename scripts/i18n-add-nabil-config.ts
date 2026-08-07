/**
 * Nabil AI config-page strings → admin.phoneOrderingPage.config.* ×38.
 *
 * NOTE: this lands an ENGLISH baseline in all 38 locales so the config page
 * renders everywhere and the 38-locale parity audit passes (0 missing/extra).
 * Proper translation into the 37 non-English locales is the one remaining i18n
 * item — run it via scripts/wf-translate-keys.js (adapt CONTEXT/UNIQUE/KEY_MAP
 * to these keys), then apply the staged translations here.
 *
 *   npx tsx scripts/i18n-add-nabil-config.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const CONFIG: Record<string, string> = {
  // status
  status: "Status",
  numberLabel: "Your Nabil number",
  noNumber: "Not provisioned yet",
  enable: "Nabil is answering calls",
  enableHint: "Turn this on when you're ready for Nabil to take live calls. Turn it off any time to send callers straight to staff.",
  // greetings
  greetings: "Greetings",
  openGreeting: "Open-hours greeting",
  closedGreeting: "Closed-hours greeting",
  greetingHint: "The first thing callers hear (up to 200 characters). Keep it warm and short — Nabil takes it from there.",
  // voice
  voice: "Voice & language",
  primaryLanguage: "Primary language",
  voiceId: "Voice",
  ambientNoise: "Subtle restaurant background sound",
  voiceHint: "Nabil detects and replies in the caller's language automatically; the primary language sets the default greeting voice.",
  // capabilities
  capabilities: "What Nabil handles",
  takeOrders: "Take pickup & delivery orders",
  bookReservations: "Book reservations",
  answerFaq: "Answer questions (hours, menu, location)",
  transferPizzaCombo: "Send pizza & combo builds to a person",
  allowAnonymous: "Answer calls with no caller ID",
  // payments
  payments: "Payments",
  pickupPayment: "Pickup orders",
  deliveryPayment: "Delivery orders",
  modeUnpaid: "Pay at store (no card over the phone)",
  modePaid: "Prepay by secure text link",
  modeBoth: "Offer the link, fall back to pay-at-store",
  shipdayNote: "Delivery is prepaid-only because you use ShipDay drivers (they can't collect at the door).",
  payWindow: "Minutes to pay the link",
  prepMode: "While awaiting payment",
  prepCookNow: "Start cooking now",
  prepHold: "Hold until paid",
  // ordering
  ordering: "Ordering",
  quoteEta: "Tell callers an estimated ready time",
  scheduledOrders: "Allow orders for a later time",
  smsConfirmations: "Text an order confirmation",
  afterHours: "After hours, Nabil should",
  ahTakeOrders: "Still take orders",
  ahReservations: "Take reservations only",
  ahMessage: "Take a message",
  ahTransfer: "Transfer to staff",
  // handoff + recording
  handoff: "Handoff & recording",
  transferNumber: "Transfer-to-staff number",
  transferHint: "Where Nabil sends a caller who needs a person. Falls back to your alert/main number if blank.",
  recordCalls: "Record calls",
  recordHint: "Recording powers the transcript, AI summary, and sentiment on the dashboard. Callers hear a short 'may be recorded' notice.",
  // actions + dashboard
  save: "Save changes",
  saving: "Saving…",
  saved: "Saved",
  saveError: "Couldn't save — please try again.",
  recentCalls: "Recent calls",
  noCalls: "No calls yet. They'll appear here once Nabil is live.",
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.admin ??= {};
  json.admin.phoneOrderingPage ??= {};
  json.admin.phoneOrderingPage.config = CONFIG;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ Nabil config keys (${Object.keys(CONFIG).length}) written to ${changed} locale file(s) — English baseline; translate via wf-translate-keys next.`);
