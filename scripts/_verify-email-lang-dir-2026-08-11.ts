/**
 * Prove every email carries the RECIPIENT's language + text direction on its
 * <html> tag — by RENDERING, not by reading.
 *
 * Background: EmailLayout rendered a bare <Html>, and @react-email/html
 * defaults `lang="en" dir="ltr"` and emits them EXPLICITLY. An explicit
 * dir="ltr" is worse than no attribute at all — it overrides the RTL
 * auto-detection heuristics Gmail/Outlook apply to Arabic and Hebrew mail.
 *
 * Checks, per template x per locale:
 *   1. the literal <html ...> tag carries lang=<locale> and the right dir
 *   2. RTL mirroring — a table-based email needs more than dir="rtl": every
 *      hardcoded physical value (text-align:left/right, padding-left,
 *      border-left, margin-left, align="right") has to flip too. Asserted as
 *      an invariant rather than a snapshot: the number of LEFT-ish physical
 *      values in the Arabic render must equal the number of RIGHT-ish ones in
 *      the English render, and vice versa. A missed flip breaks the equality.
 *   3. English-content templates stay lang="en" — the attribute describes the
 *      CONTENT language, so a hardcoded-English body must not claim to be
 *      Arabic just because the recipient's restaurant is.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verify-email-lang-dir-2026-08-11.ts
 *
 * `--dump <dir>` also writes every render to disk, so the pre-change and
 * post-change runs can be diffed: the 36 LTR locales must come out
 * byte-identical (react-email was already emitting lang="en" dir="ltr", so
 * passing those values explicitly changes nothing for English).
 */
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderEmail } from "../src/emails/render";
import { getDict, type Translator } from "../src/lib/i18n-dict";
import { RTL_LOCALES } from "../src/lib/locales";

import OrderConfirmation from "../src/emails/templates/OrderConfirmation";
import KitchenNotification from "../src/emails/templates/KitchenNotification";
import OrderStatusUpdate from "../src/emails/templates/OrderStatusUpdate";
import OrderDelayed from "../src/emails/templates/OrderDelayed";
import OrderRejected from "../src/emails/templates/OrderRejected";
import OrderCanceled from "../src/emails/templates/OrderCanceled";
import OrderRefund from "../src/emails/templates/OrderRefund";
import ReservationConfirmation from "../src/emails/templates/ReservationConfirmation";
import NewReservationNotification from "../src/emails/templates/NewReservationNotification";
import ScheduledOrderReminder from "../src/emails/templates/ScheduledOrderReminder";
import CouponAssigned from "../src/emails/templates/CouponAssigned";
import CustomerSignupNotification from "../src/emails/templates/CustomerSignupNotification";
import DispatchRejected from "../src/emails/templates/DispatchRejected";
import PasswordReset from "../src/emails/templates/PasswordReset";
import RewardGift from "../src/emails/templates/RewardGift";
import RewardGiftInvite from "../src/emails/templates/RewardGiftInvite";
import DigestEmail from "../src/emails/templates/DigestEmail";
import AutopilotEmail from "../src/emails/templates/AutopilotEmail";
// English-content templates — included to prove they DON'T get relabelled.
import VerifyEmail from "../src/emails/templates/VerifyEmail";
import SignupConfirmation from "../src/emails/templates/SignupConfirmation";
import BillingNotification from "../src/emails/templates/BillingNotification";

// English first — the RTL mirror check below compares every other locale
// against the English render, so the baseline has to exist before ar/he run.
const locales = readdirSync("src/messages")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""))
  .sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));

const ITEMS = [
  {
    name: "Lasagna",
    quantity: 2,
    price: 15.8,
    lineTotal: 31.6,
    modifiers: [{ label: "Size", value: "Large", priceAdjustment: 2 }],
    notes: "Extra napkins",
    bundleItems: [{ name: "Garlic bread", variantName: "6pc", modifiers: [{ name: "Cheese" }] }],
  },
  { name: "Coke", quantity: 1, price: 2.5, lineTotal: 2.5, isRefundableDeposit: true, depositAmount: 0.1 },
];

const MONEY = {
  items: ITEMS,
  subtotal: 34.1,
  taxAmount: 4.43,
  deliveryFee: 5,
  savedDeliveryFee: 7.99,
  tip: 3,
  depositTotal: 0.1,
  discount: 2,
  serviceFees: [{ name: "Service fee", amount: 1.25 }],
  total: 45.88,
  creditApplied: 10,
  rewardEarned: 2.5,
  currency: "usd",
};

const TIMING = {
  placedAtLabel: "Tue, 12 Aug, 10:40",
  prepTimeLabel: "25 minutes",
  readyAtLabel: "Tue, 12 Aug, 11:05",
  scheduledLabel: "Friday 6:00 PM",
};

const STAT = { value: "$1,204.17", delta: "+64%", deltaDirection: "up" as const };
const SPLIT = { count: 4, value: "$120.00" };

/** Every template that renders LOCALIZED content, with props that exercise the
 *  direction-sensitive parts (items table, totals, timing block, step lists). */
const FIXTURES: { name: string; el: (t: Translator) => ReactElement }[] = [
  { name: "OrderConfirmation", el: (t) => OrderConfirmation({
      t, customerName: "Sameem", orderNumber: "ORD-519009065", restaurantName: "Luigi's",
      orderType: "delivery", paidOnline: true, estimatedMinutes: 20, ...TIMING, ...MONEY,
      deliveryAddress: "12 King St W, Toronto", trackingUrl: "https://example.com/t",
      appliedPromos: [{ name: "Free delivery", discount: 7.99, type: "free_delivery", couponCode: "WIN1" }],
      rewardLabel: "Pizza Bucks", alreadyAccepted: true,
    } as never) },
  { name: "KitchenNotification", el: (t) => KitchenNotification({
      t, restaurantName: "Luigi's", orderNumber: "ORD-519009065", customerName: "Sameem",
      customerPhone: "+14165551234", orderType: "delivery", ...TIMING, ...MONEY,
      deliveryAddress: "12 King St W, Toronto", dashboardUrl: "https://example.com/a",
      rewardLabel: "Pizza Bucks",
    } as never) },
  { name: "OrderStatusUpdate", el: (t) => OrderStatusUpdate({
      t, customerName: "Sameem", orderNumber: "ORD-1", restaurantName: "Luigi's",
      status: "ready", trackingUrl: "https://example.com/t", paidOnline: true,
    } as never) },
  { name: "OrderDelayed", el: (t) => OrderDelayed({
      t, customerName: "Sameem", orderNumber: "ORD-1", restaurantName: "Luigi's",
      newEstimatedReady: new Date("2026-08-12T15:05:00Z"), delayMinutes: 15,
      timezone: "America/Toronto", trackingUrl: "https://example.com/t",
    } as never) },
  { name: "OrderRejected", el: (t) => OrderRejected({
      t, customerName: "Sameem", orderNumber: "ORD-1", restaurantName: "Luigi's",
      paidOnline: true, paymentCaptured: false, orderTotalLabel: "$45.88",
    } as never) },
  { name: "OrderCanceled", el: (t) => OrderCanceled({
      t, customerName: "Sameem", orderNumber: "ORD-1", restaurantName: "Luigi's",
      paidOnline: true, orderTotalLabel: "$45.88",
    } as never) },
  { name: "OrderRefund", el: (t) => OrderRefund({
      t, customerName: "Sameem", orderNumber: "ORD-1", restaurantName: "Luigi's",
      refundAmountLabel: "$45.88", isFull: true,
    } as never) },
  { name: "ReservationConfirmation", el: (t) => ReservationConfirmation({
      t, status: "confirmed", customerName: "Sameem", reservationNumber: "RES-1",
      restaurantName: "Luigi's", dateTime: "Fri, 14 Aug, 19:00", partySize: 4,
    } as never) },
  { name: "NewReservationNotification", el: (t) => NewReservationNotification({
      t, restaurantName: "Luigi's", reservationNumber: "RES-1", customerName: "Sameem",
      dateTime: "Fri, 14 Aug, 19:00", partySize: 4, dashboardUrl: "https://example.com/a",
    } as never) },
  { name: "ScheduledOrderReminder", el: (t) => ScheduledOrderReminder({
      t, customerName: "Sameem", orderNumber: "ORD-1", restaurantName: "Luigi's",
      scheduledWindow: "Fri 18:00-18:30", orderType: "delivery",
    } as never) },
  { name: "CouponAssigned", el: (t) => CouponAssigned({
      t, customerName: "Sameem", restaurantName: "Luigi's", code: "WIN1",
      discountLabel: "10% off", termLines: ["Min order $20", "One use per customer"],
      orderUrl: "https://example.com/o",
    } as never) },
  { name: "CustomerSignupNotification", el: (t) => CustomerSignupNotification({
      t, restaurantName: "Luigi's", customerName: "Sameem", customerEmail: "s@example.com",
      dashboardUrl: "https://example.com/a",
    } as never) },
  { name: "DispatchRejected", el: (t) => DispatchRejected({
      t, restaurantName: "Luigi's", orderNumber: "ORD-1", customerName: "Sameem",
      dashboardUrl: "https://example.com/a",
    } as never) },
  { name: "PasswordReset", el: (t) => PasswordReset({
      t, name: "Luigi", resetUrl: "https://example.com/r", accountName: "Luigi's",
    } as never) },
  { name: "RewardGift", el: (t) => RewardGift({
      t, customerName: "Sameem", restaurantName: "Luigi's", amountLabel: "$10.00",
      rewardLabel: "Pizza Bucks", balanceLabel: "$25.00", orderUrl: "https://example.com/o",
    } as never) },
  { name: "RewardGiftInvite", el: (t) => RewardGiftInvite({
      t, customerName: "Sameem", restaurantName: "Luigi's", amountLabel: "$10.00",
      rewardLabel: "Pizza Bucks", orderUrl: "https://example.com/o", giftEmail: "s@example.com",
    } as never) },
  { name: "DigestEmail", el: (t) => DigestEmail({
      period: "daily", periodLabel: "Thursday, August 6, 2026", comparisonLabel: "vs previous Thursday",
      // DigestEmail takes `locale` separately — its DigestTranslator prop type
      // is a bare function with no `.locale`. sendDigestEmail passes the same.
      restaurantName: "Luigi's", t, locale: t.locale, currency: "usd",
      sales: STAT, orders: STAT, avgOrderValue: STAT, reservations: STAT,
      breakdown: { subTotals: 900, deliveryFees: 40, tips: 30, otherFees: 10, tax: 120, total: 1100,
        discounts: 25, storeCreditRedeemed: 15, refundsAmount: 20, refundedOrders: 1, collected: 1065 },
      pickup: SPLIT, delivery: SPLIT, onPremise: SPLIT,
      offlinePayments: SPLIT, onlinePayments: SPLIT,
      noMissedOrders: true, noCanceledOrders: true, dashboardUrl: "https://example.com/a",
    } as never) },
  { name: "AutopilotEmail", el: (t) => AutopilotEmail({
      locale: t.locale, customerName: "Sameem", restaurantName: "Luigi's",
      subject: t("email.orderConfirmed.headerTitle"), body: "Come back for 10% off.",
      couponCode: "CARTBACK", couponLabel: "10% off", ctaUrl: "https://example.com/o",
      marketing: true, unsubscribeUrl: "https://example.com/u", dataDeletionUrl: "https://example.com/d",
    } as never) },
];

/** Hardcoded-English bodies — these must stay lang="en" whatever the recipient. */
const ENGLISH_FIXTURES: { name: string; el: () => ReactElement }[] = [
  { name: "VerifyEmail", el: () => VerifyEmail({ name: "Luigi", verifyUrl: "https://example.com/v" }) },
  { name: "SignupConfirmation", el: () => SignupConfirmation({
      name: "Luigi", restaurantName: "Luigi's", loginUrl: "https://example.com/l",
      verifyUrl: "https://example.com/v",
    }) },
  { name: "BillingNotification", el: () => BillingNotification({
      title: "Your invoice is ready", body: "Invoice for August.",
      details: [{ label: "Amount", value: "$49.00" }], buttonLabel: "View", buttonUrl: "https://example.com/b",
    }) },
];

/** Physical, direction-dependent CSS/HTML values. Every one of these has to be
 *  mirrored for RTL — `dir="rtl"` alone does not touch them. */
const LEFTISH = [/text-align:\s*left/g, /padding-left/g, /margin-left/g, /border-left(?!-)/g, /align="left"/g];
const RIGHTISH = [/text-align:\s*right/g, /padding-right/g, /margin-right/g, /border-right(?!-)/g, /align="right"/g];
const count = (html: string, res: RegExp[]) =>
  res.reduce((n, re) => n + (html.match(re)?.length ?? 0), 0);

const htmlTag = (html: string) => html.match(/<html[^>]*>/i)?.[0] ?? "(NO <html> TAG)";

async function main() {
  const dumpIdx = process.argv.indexOf("--dump");
  const dumpDir = dumpIdx > -1 ? process.argv[dumpIdx + 1] : null;
  if (dumpDir) mkdirSync(dumpDir, { recursive: true });

  let fails = 0;
  let checks = 0;
  const fail = (msg: string) => { fails++; console.log(`FAIL ${msg}`); };

  // Per-fixture English baseline, for the RTL mirror invariant.
  const enBaseline = new Map<string, { left: number; right: number }>();

  for (const loc of locales) {
    const t = await getDict(loc);
    const rtl = RTL_LOCALES.has(loc as never);
    const wantDir = rtl ? "rtl" : "ltr";

    for (const f of [...FIXTURES, ...ENGLISH_FIXTURES]) {
      const isEnglishBody = ENGLISH_FIXTURES.some((e) => e.name === f.name);
      const html = await renderEmail(
        isEnglishBody ? (f as { el: () => ReactElement }).el() : (f as { el: (t: Translator) => ReactElement }).el(t),
      );
      if (dumpDir) writeFileSync(join(dumpDir, `${loc}__${f.name}.html`), html);

      const tag = htmlTag(html);
      checks++;

      // 1 + 3. the literal <html> tag
      const wantLang = isEnglishBody ? "en" : loc;
      const wantTagDir = isEnglishBody ? "ltr" : wantDir;
      const gotLang = tag.match(/lang="([^"]*)"/)?.[1];
      const gotDir = tag.match(/dir="([^"]*)"/)?.[1];
      if (gotLang !== wantLang) fail(`${loc} ${f.name}: lang="${gotLang}" want "${wantLang}" — ${tag}`);
      if (gotDir !== wantTagDir) fail(`${loc} ${f.name}: dir="${gotDir}" want "${wantTagDir}" — ${tag}`);

      // 1b. Gmail / Outlook.com / Yahoo strip <html> and re-host the markup in
      //     their own document, so the tag above never reaches them. The dir
      //     has to be repeated on an element that SURVIVES that stripping, and
      //     only for RTL (an explicit ltr there would re-create the bug).
      const bodyInner = html.slice(html.search(/<body[^>]*>/i));
      const survivingRtl = /<(table|div)[^>]*\sdir="rtl"/i.test(bodyInner);
      if (!isEnglishBody && rtl && !survivingRtl) {
        fail(`${loc} ${f.name}: no dir="rtl" on any element below <body> — stripped by Gmail`);
      }
      if (/<(table|div)[^>]*\sdir="ltr"/i.test(bodyInner)) {
        fail(`${loc} ${f.name}: explicit dir="ltr" below <body> — overrides client RTL heuristics`);
      }

      // 2. RTL mirroring of the physical values
      if (isEnglishBody) continue;
      const left = count(html, LEFTISH);
      const right = count(html, RIGHTISH);
      if (loc === "en") { enBaseline.set(f.name, { left, right }); continue; }
      if (!rtl) continue;
      const base = enBaseline.get(f.name)!;
      if (left !== base.right || right !== base.left) {
        fail(
          `${loc} ${f.name}: physical values not mirrored — ` +
          `en(left=${base.left} right=${base.right}) vs ${loc}(left=${left} right=${right})`,
        );
      }
    }
  }

  console.log(
    fails === 0
      ? `PASS: ${locales.length} locales x ${FIXTURES.length + ENGLISH_FIXTURES.length} templates = ${checks} renders, 0 failures`
      : `${fails} FAILURES of ${checks} renders`,
  );
  if (fails) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
