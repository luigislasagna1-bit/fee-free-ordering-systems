/** Render-check every email surface reworked in the cms0gyexp batch (no send).
 *   npx tsx --env-file=.env --env-file=.env.local scripts/_render-cms0gyexp-emails.ts
 */
import { renderEmail, emailHtmlToText } from "../src/emails/render";
import KitchenNotification from "../src/emails/templates/KitchenNotification";
import NewReservationNotification from "../src/emails/templates/NewReservationNotification";
import CustomerSignupNotification from "../src/emails/templates/CustomerSignupNotification";
import PasswordReset from "../src/emails/templates/PasswordReset";
import OrderConfirmation from "../src/emails/templates/OrderConfirmation";
import ReservationConfirmation from "../src/emails/templates/ReservationConfirmation";
import AutopilotEmail from "../src/emails/templates/AutopilotEmail";
import { getDict } from "../src/lib/i18n-dict";

let failed = false;
function expect(html: string, needle: string, label: string) {
  if (!html.includes(needle)) { console.error(`❌ ${label}: missing "${needle}"`); failed = true; }
  else console.log(`✓ ${label}`);
}

async function main() {
  const t = await getDict("en");

  const kn = await renderEmail(KitchenNotification({
    t, restaurantName: "Demo", orderNumber: "123", customerName: "Mario",
    customerPhone: "+15550001111", customerEmail: "m@example.com", orderType: "delivery",
    paidOnline: false, paymentMethod: "cash",
    items: [{ name: "Pizza", quantity: 2, price: 10 }], subtotal: 20, total: 22, taxAmount: 2,
    deliveryAddress: "Via Roma 1", customerNotes: "ring twice", dashboardUrl: "https://x/kitchen",
    currency: "eur",
  } as any));
  expect(kn, "Demo — Order #123", "KitchenNotification header");
  expect(kn, "To collect — cash", "KitchenNotification cash badge");
  expect(kn, "Open Kitchen Order App", "KitchenNotification CTA");
  expect(kn, "Delivery address", "KitchenNotification address label");

  const nr = await renderEmail(NewReservationNotification({
    t, restaurantName: "Demo", reservationNumber: "R1", customerName: "Anna",
    customerPhone: "+15550002222", customerEmail: "a@example.com",
    dateTime: "Saturday, 2 August, 19:30", partySize: 4, specialRequests: "window table",
    dashboardUrl: "https://x/admin",
  } as any));
  expect(nr, "Reservation time", "NewReservation time label");
  expect(nr, "tel:+15550002222", "NewReservation tel link");
  expect(nr, "window table", "NewReservation special requests");
  expect(nr, "Party of 4", "NewReservation party badge");

  const cs = await renderEmail(CustomerSignupNotification({
    t, restaurantName: "Demo", customerName: "Luca", customerEmail: "l@example.com",
    dashboardUrl: "https://x/admin/customers",
  } as any));
  expect(cs, "New sign-up", "CustomerSignup badge");
  expect(cs, "View customers in admin", "CustomerSignup CTA");

  const prBranded = await renderEmail(PasswordReset({
    t, name: "Fabrizio", resetUrl: "https://x/reset?token=1",
    accountName: "Japanese Restaurant", restaurantName: "Japanese Restaurant",
    restaurantEmail: "info@jr.it", restaurantPhone: "+390000000",
  } as any));
  expect(prBranded, "Japanese Restaurant account", "PasswordReset branded body");
  expect(prBranded, "tel:+390000000", "PasswordReset footer phone");
  const prPlatform = await renderEmail(PasswordReset({ t, resetUrl: "https://x/reset?token=2" } as any));
  expect(prPlatform, "Fee Free Ordering account", "PasswordReset platform body");

  const oc = await renderEmail(OrderConfirmation({
    t, customerName: "Test", orderNumber: "X1", restaurantName: "Demo", orderType: "pickup",
    items: [{ name: "Pizza", quantity: 1, price: 10 }], subtotal: 10, total: 10, currency: "USD",
    trackingUrl: "https://x/status/1", placedWhileClosed: true,
    opensAtLabel: "Saturday, 2 Aug, 8:15 PM",
    restaurantPhone: "+15551234567", restaurantEmail: "demo@x.com",
  } as any));
  expect(oc, "Check your email on Saturday, 2 Aug, 8:15 PM", "OrderConfirmation closed note WITH time");
  expect(oc, "tel:+15551234567", "OrderConfirmation footer phone");

  const rcReq = await renderEmail(ReservationConfirmation({
    t, status: "requested", customerName: "T", reservationNumber: "R2", restaurantName: "Demo",
    dateTime: "Saturday, 2 August, 19:30", partySize: 2,
    restaurantPhone: "+15559998888", restaurantEmail: "d@x.com",
  } as any));
  expect(rcReq, "Reservation request received", "ReservationConfirmation REQUESTED preview");
  expect(rcReq, "tel:+15559998888", "ReservationConfirmation footer phone");
  if (rcReq.includes("Reservation confirmed —")) { console.error("❌ requested email still shows the confirmed preview"); failed = true; }
  else console.log("✓ requested preview no longer claims confirmed");

  const ap = await renderEmail(AutopilotEmail({
    customerName: "C", restaurantName: "Demo", subject: "We miss you", body: "Hi C, come back!",
    ctaUrl: "https://x/order", unsubscribeUrl: "https://x/unsub?token=1",
    postalAddress: "123 Main St, Milton, ON",
  } as any));
  expect(ap, "Unsubscribe", "Autopilot visible unsubscribe");
  expect(ap, "123 Main St, Milton, ON", "Autopilot postal address");

  const text = emailHtmlToText(oc);
  if (text.length > 50 && text.includes("Pizza")) console.log("✓ plain-text derivation works", `(${text.length} chars)`);
  else { console.error("❌ plain-text derivation looks wrong:", text.slice(0, 120)); failed = true; }

  console.log(failed ? "\nFAILED" : "\nAll cms0gyexp email surfaces render correctly.");
  if (failed) process.exit(1);
}
main();
