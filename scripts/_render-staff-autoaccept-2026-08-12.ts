/**
 * Render the STORE-OWNER new-order email both ways — the order the kitchen must
 * still accept vs the one auto-accept already confirmed — so the difference can
 * be eyeballed before shipping. Rebuilds Luigi's ORD-002270106 (2026-08-12): the
 * auto-accepted $58.34 order whose email still said "Accept this order … auto-
 * reject runs if no action is taken".
 *
 * Also renders fr + ar (RTL) to prove the four new keys are real translations
 * and no raw `email.newOrder.*` key path leaks into a non-English inbox.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_render-staff-autoaccept-2026-08-12.ts out.html
 *
 * (the preload is needed because getDict → i18n-server → @/lib/db is required
 *  before this file's own dotenv config() line runs, and DATABASE_URL lives in
 *  .env.local, not .env)
 */
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { renderEmail } from "../src/emails/render";
import { getDict } from "../src/lib/i18n-dict";
import KitchenNotification from "../src/emails/templates/KitchenNotification";
import { formatFullDeliveryAddress } from "../src/lib/address-format";

config({ path: ".env.local" });
config({ path: ".env" });

const OUT = process.argv[2] || "out.html";

const base = {
  restaurantName: "Luigi's Lasagna & Pizzeria",
  orderNumber: "ORD-002270106",
  customerName: "Sameem Nabil",
  customerPhone: "9058649442",
  customerEmail: "info@luigislasagna.com",
  orderType: "delivery",
  paidOnline: true,
  paymentMethod: "card",
  estimatedMinutes: 45,
  placedAtLabel: "Wednesday, August 12 at 2:57 PM",
  prepTimeLabel: "45 minutes",
  readyAtLabel: "Wednesday, August 12 at 3:42 PM",
  readyRowLabel: "Delivery time",
  items: [
    {
      name: "SUPER PARTY SIZE (Feeds 12-18) (48 Square Slices - 25 inch square pizza)",
      quantity: 1,
      price: 49.99,
      lineTotal: 49.99,
      modifiers: [
        { label: "", value: "REGULAR", priceAdjustment: 0 },
        { label: "", value: "Pizza Sauce Base", priceAdjustment: 0 },
        { label: "", value: "Regular Cheese", priceAdjustment: 0 },
        { label: "", value: "Regular Cooked", priceAdjustment: 0 },
      ],
    },
  ],
  subtotal: 49.99,
  taxAmount: 5.85,
  deliveryFee: 0,
  savedDeliveryFee: 7.99,
  tip: 7.5,
  discount: 5,
  discountBreakdown: [{ name: "First-time customer special", amount: 5, couponCode: "FIRSTBUY" }],
  total: 58.34,
  // Exactly what fireOrderNotifications now sends: the full address, composed
  // from the three columns and formatted, out of the lowercase a customer
  // actually types. Before 2026-08-12 the email got `deliveryAddress` alone,
  // verbatim — "705 rayner court".
  deliveryAddress: formatFullDeliveryAddress({
    street: "705 rayner court",
    city: "milton",
    postcode: "l9t0p1",
  }),
  dashboardUrl: "https://feefreeordering.com/admin/orders",
  currency: "cad",
} as const;

async function render(locale: string, autoAccepted: boolean) {
  const t = await getDict(locale);
  return renderEmail(KitchenNotification({ t, ...base, autoAccepted } as never));
}

async function main() {
  const cases: Array<{ id: string; locale: string; auto: boolean; note: string; tone: string }> = [
    { id: "en-pending", locale: "en", auto: false, note: "Auto-accept OFF — the kitchen must accept it", tone: "warn" },
    { id: "en-auto", locale: "en", auto: true, note: "Auto-accept ON — already confirmed", tone: "good" },
    { id: "fr-auto", locale: "fr", auto: true, note: "French — translated, no key leak", tone: "good" },
    { id: "ar-auto", locale: "ar", auto: true, note: "Arabic (RTL) — translated, no key leak", tone: "good" },
  ];

  const cols: string[] = [];
  let leaked = false;
  for (const c of cases) {
    const html = await render(c.locale, c.auto);
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const keyLeak = /email\.newOrder\./.test(text);
    if (keyLeak) leaked = true;
    console.log(
      `${c.id.padEnd(12)} acceptPrompt=${text.includes("Accept this order") ? "YES" : "no "} ` +
        `keys=${keyLeak ? "LEAKED" : "clean"}`,
    );
    cols.push(
      `<div class="col ${c.tone}"><h2>${c.id} — ${c.note}</h2>` +
        `<iframe srcdoc="${html.replace(/"/g, "&quot;")}"></iframe></div>`,
    );
  }

  writeFileSync(
    OUT,
    `<!doctype html><meta charset="utf-8"><title>Staff new-order email — pending vs auto-accepted</title>
<style>
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f4f6}
  .wrap{display:flex;flex-wrap:wrap;gap:24px;padding:24px;align-items:flex-start}
  .col{flex:1 1 460px;min-width:340px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12)}
  h2{margin:0;padding:14px 18px;font-size:14px;color:#fff}
  .warn h2{background:#b45309}.good h2{background:#047857}
  iframe{width:100%;height:1800px;border:0;display:block}
</style>
<div class="wrap">${cols.join("")}</div>`,
    "utf8",
  );
  console.log(`wrote ${OUT}${leaked ? " — ⚠️ RAW KEY LEAKED" : ""}`);
  if (leaked) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
