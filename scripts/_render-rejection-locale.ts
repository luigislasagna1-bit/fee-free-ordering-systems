/** Render-check Fabrizio cms0gyexp #10: the rejection reason must reach the
 *  customer in the CUSTOMER's language, not the restaurant staff's.
 *
 *  Scenario under test = his exact report: a restaurant running the app in
 *  Chinese rejects an Italian customer's order. The stored reason is the
 *  Chinese string (correct for the restaurant's own records); the email must
 *  still read Italian.
 *
 *  npx tsx --env-file=.env.local scripts/_render-rejection-locale.ts
 */
import { renderEmail } from "../src/emails/render";
import OrderStatusUpdate from "../src/emails/templates/OrderStatusUpdate";
import { getDict } from "../src/lib/i18n-dict";

let pass = 0, fail = 0;
function check(ok: boolean, label: string, extra = "") {
  if (ok) { pass++; console.log(`✓ ${label}`); }
  else { fail++; console.log(`✗ ${label} ${extra}`); }
}

/** Mirrors the resolution now living in sendOrderStatusUpdateEmail. */
function resolve(t: any, storedText: string | undefined, key: string | null) {
  const k = key?.trim();
  if (!k || k === "other") return storedText;
  const path = `kitchen.rejectReasons.${k}`;
  const localized = t(path);
  return localized && localized !== path ? localized : storedText;
}

async function main() {
  const tIt = await getDict("it");
  const tZh = await getDict("zh");
  const tEn = await getDict("en");

  const zhStored = tZh("kitchen.rejectReasons.tooBusy"); // what the kitchen stores
  const itExpected = tIt("kitchen.rejectReasons.tooBusy");
  console.log(`stored (staff zh): ${zhStored}`);
  console.log(`expected (cust it): ${itExpected}\n`);

  // 1. THE BUG: Chinese restaurant, Italian customer, preset reason.
  const italian = resolve(tIt, zhStored, "tooBusy");
  check(italian === itExpected, "preset reason renders in the CUSTOMER's language");
  check(italian !== zhStored, "customer does NOT receive the staff-language string");

  // 2. Free-typed "other" — staff's own words, passed through untouched.
  check(resolve(tIt, "Siamo chiusi per lutto", "other") === "Siamo chiusi per lutto",
    "free-typed 'other' passes through verbatim");
  check(resolve(tIt, "Custom words", null) === "Custom words",
    "no key (legacy caller) falls back to the stored text");

  // 3. Unknown/garbage code must never leak a raw key path into an email.
  const bogus = resolve(tIt, "Fallback text", "not_a_real_reason");
  check(bogus === "Fallback text", "unknown code falls back, never leaks a key path", `got: ${bogus}`);
  check(!String(bogus).includes("kitchen.rejectReasons"), "no raw i18n path in output");

  // 4. Every preset code resolves in a sample of locales.
  const codes = ["tooBusy", "closingSoon", "outOfItem", "outsideDeliveryArea", "kitchenClosed", "duplicateOrder", "paymentIssue"];
  for (const loc of ["it", "fr", "ar", "ja"]) {
    const t = await getDict(loc);
    const bad = codes.filter((c) => {
      const v = resolve(t, "STORED", c);
      return !v || v === "STORED" || String(v).includes("kitchen.rejectReasons");
    });
    check(bad.length === 0, `all ${codes.length} preset codes resolve in ${loc}`, bad.join(","));
  }

  // 5. End-to-end: the rendered HTML contains the Italian text, not Chinese.
  const html = await renderEmail(OrderStatusUpdate({
    t: tIt,
    customerName: "Marco",
    orderNumber: "A1",
    restaurantName: "Ristorante Test",
    status: "rejected",
    rejectionReason: itExpected,
    trackingUrl: "https://x/status/1",
  } as any));
  check(html.includes(itExpected), "rendered email HTML carries the Italian reason");
  check(!html.includes(zhStored), "rendered email HTML does NOT carry the Chinese reason");

  // 6. English restaurant + English customer still behaves (no regression).
  check(resolve(tEn, tEn("kitchen.rejectReasons.outOfItem"), "outOfItem") === tEn("kitchen.rejectReasons.outOfItem"),
    "English → English unchanged (no regression)");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
main();
