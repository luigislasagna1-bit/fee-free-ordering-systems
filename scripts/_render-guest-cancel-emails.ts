/** Render-check the guest-cancel email variants (no send):
 *   1. OrderConfirmation with placedWhileClosed + cancelUrl → closed note + cancel link
 *   2. OrderStatusUpdate cancelled + cancelledBy customer → self-cancel title/body
 *   3. ReservationConfirmation cancelled + depositPaid → cancelled copy + deposit note
 *   4. ReservationConfirmation confirmed + cancelUrl → cancel link line
 *   npx tsx scripts/_render-guest-cancel-emails.ts
 */
import { renderEmail } from "../src/emails/render";
import OrderConfirmation from "../src/emails/templates/OrderConfirmation";
import OrderStatusUpdate from "../src/emails/templates/OrderStatusUpdate";
import ReservationConfirmation from "../src/emails/templates/ReservationConfirmation";
import { getDict } from "../src/lib/i18n-dict";

function expect(html: string, needle: string, label: string) {
  if (!html.includes(needle)) {
    console.error(`❌ ${label}: missing "${needle}"`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

async function main() {
  const t = await getDict("en");

  const oc = await renderEmail(
    OrderConfirmation({
      t,
      customerName: "Test",
      orderNumber: "X1",
      restaurantName: "Demo",
      orderType: "pickup",
      items: [{ name: "Pizza", quantity: 1, price: 10 }],
      subtotal: 10, total: 10, currency: "USD",
      trackingUrl: "https://x/status/1",
      cancelUrl: "https://x/status/1?cancel=tok",
      placedWhileClosed: true,
    } as any),
  );
  expect(oc, "currently closed", "OrderConfirmation closed note");
  expect(oc, "cancel your order", "OrderConfirmation cancel link");
  expect(oc, "?cancel=tok", "OrderConfirmation cancel href");

  const os = await renderEmail(
    OrderStatusUpdate({
      t,
      customerName: "Test",
      orderNumber: "X1",
      restaurantName: "Demo",
      status: "cancelled",
      cancelledBy: "customer",
      paidOnline: false,
    } as any),
  );
  expect(os, "You cancelled your order", "OrderStatusUpdate self-cancel body");

  const rc = await renderEmail(
    ReservationConfirmation({
      t,
      status: "cancelled",
      customerName: "Test",
      reservationNumber: "R1",
      restaurantName: "Demo",
      dateTime: "Tomorrow 19:30",
      partySize: 2,
      depositPaid: true,
    } as any),
  );
  expect(rc, "You cancelled your reservation", "ReservationConfirmation cancelled intro");
  expect(rc, "deposit", "ReservationConfirmation deposit note");

  const rl = await renderEmail(
    ReservationConfirmation({
      t,
      status: "confirmed",
      customerName: "Test",
      reservationNumber: "R1",
      restaurantName: "Demo",
      dateTime: "Tomorrow 19:30",
      partySize: 2,
      cancelUrl: "https://x/reservation/1/cancel?t=tok",
    } as any),
  );
  expect(rl, "cancel your reservation here", "ReservationConfirmation cancel link line");
  expect(rl, "/cancel?t=tok", "ReservationConfirmation cancel href");

  console.log(process.exitCode ? "\nFAILED" : "\nAll email variants render correctly.");
}
main();
