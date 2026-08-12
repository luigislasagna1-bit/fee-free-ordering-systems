/** Render the auto-accepted order confirmation email to HTML for eyeballing. */
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { renderEmail } from "../src/emails/render";
import { getDict } from "../src/lib/i18n-dict";
import OrderConfirmation from "../src/emails/templates/OrderConfirmation";

config({ path: ".env.local" });
config({ path: ".env" });

const OUT = process.argv[2] || "out.html";

async function main() {
  const t = await getDict("en");
  // Luigi's real 2:55 PM test: delivery, paid online, auto-accepted, into a
  // 35-minute zone (the order stored prep 35; the email printed the flat 45).
  const base = {
    t,
    customerName: "Sameem Nabil",
    orderNumber: "ORD-519009065",
    restaurantName: "Luigi's Lasagna & Pizzeria",
    orderType: "Delivery",
    paidOnline: true,
    placedAtLabel: "Tuesday, August 11 at 2:55 PM",
    readyAtLabel: "Tuesday, August 11 at 3:30 PM",
    readyRowLabel: "Delivery time",
    deliveryAddress: "17 commercial st",
    items: [
      { name: "Dipping Sauce", quantity: 1, price: 1.49, lineTotal: 1.49, modifiers: [{ label: "", value: "Chipotle", priceAdjustment: 0 }] },
    ],
    subtotal: 9.1,
    taxAmount: 1.49,
    total: 10.59,
    trackingUrl: "https://order.luigislasagna.com/status/demo",
    restaurantUrl: "https://order.luigislasagna.com",
    restaurantEmail: "info@luigislasagna.com",
    restaurantPhone: "+1 905 555 0134",
    currency: "cad",
    paidStatus: "paid",
  } as any;

  // BEFORE: flat 45-min default quoted against a 3:30 PM promise (2:55 + 45 = 3:40).
  const before = await renderEmail(
    OrderConfirmation({ ...base, estimatedMinutes: 45, prepTimeLabel: "45 minutes" }),
  );
  // AFTER: the order's own 35-minute zone promise, and the confirmed voice.
  const after = await renderEmail(
    OrderConfirmation({ ...base, estimatedMinutes: 35, prepTimeLabel: "35 minutes", alreadyAccepted: true }),
  );

  const page = `<!doctype html><meta charset="utf-8"><title>Auto-accept confirmation email</title>
<style>
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f4f6}
  .wrap{display:flex;flex-wrap:wrap;gap:24px;padding:24px;align-items:flex-start}
  .col{flex:1 1 460px;min-width:340px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12)}
  h2{margin:0;padding:14px 18px;font-size:15px;color:#fff}
  .bad h2{background:#b91c1c}.good h2{background:#047857}
  .sub{padding:10px 18px;font-size:13px;color:#374151;background:#f9fafb;border-bottom:1px solid #e5e7eb}
  .sub b{font-weight:700}
  iframe{width:100%;height:1500px;border:0;display:block}
</style>
<div class="wrap">
  <div class="col bad">
    <h2>BEFORE — what your customer got today</h2>
    <div class="sub">Subject: <b>Order #ORD-143921044 received — awaiting confirmation</b></div>
    <iframe srcdoc="${before.replace(/"/g, "&quot;")}"></iframe>
  </div>
  <div class="col good">
    <h2>AFTER — auto-accepted order</h2>
    <div class="sub">Subject: <b>Order #ORD-143921044 confirmed</b></div>
    <iframe srcdoc="${after.replace(/"/g, "&quot;")}"></iframe>
  </div>
</div>`;
  writeFileSync(OUT, page, "utf8");
  console.log(`wrote ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
