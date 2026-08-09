/**
 * One-off support note to the Sofia Chilly meals owner after the region
 * correction (Luigi 2026-08-09): their Islamabad store was created as
 * "Islamabad, CA" with CAD/Toronto because Pakistan was missing from the
 * signup country list. Explains the fix in plain English and states what we
 * changed on their profile. Sent AFTER scripts/_fix-restaurant-region.ts has
 * run, so the email never claims a correction that hasn't happened.
 *
 * Uses sendBillingNotificationEmail — the platform's generic transactional
 * shell — NOT sendMarketingEmail: this is a 1:1 operational note about the
 * recipient's own account, not marketing.
 *
 *   DRY RUN (prints the email, sends nothing):
 *     npx tsx scripts/_email-sofia-region-fix.ts
 *   SEND — ALWAYS through run-on-prod:
 *     npx tsx scripts/run-on-prod.ts scripts/_email-sofia-region-fix.ts --send
 *
 * 🚨 Why run-on-prod even though Resend sends fine from dev: getTransport()
 * reads the From address from PlatformSettings.emailFrom IN THE DATABASE, and
 * the dev branch still carries the legacy support@luigislasagna.com. The first
 * send of this very email (2026-08-09, ALLOW_DEV_EMAIL=1 against dev) went out
 * under the restaurant's domain instead of the platform's. Only the prod DB
 * has the Fee Free sender.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const SEND = process.argv.includes("--send");

const TO = "appweb07@gmail.com";
const RESTAURANT = "Sofia Chilly meals";
const SUBJECT = "We fixed your country settings — Sofia Chilly meals";
const HEADLINE = "Your restaurant is now set to Pakistan";
const BODY = [
  "Thanks for signing up to Fee Free Ordering!",
  "",
  "You may have noticed your restaurant showed as \"Islamabad, CA\" with prices in Canadian dollars. That was our mistake — Pakistan was missing from our country list, so the signup form fell back to Canada. We are sorry about the confusion.",
  "",
  "We have fixed the list and updated your profile for you:",
  "",
  "• Country: Pakistan",
  "• Currency: Pakistani Rupee (PKR)",
  "• Time zone: Pakistan time (Asia/Karachi)",
  "",
  "Your menu prices, orders, and opening hours will now use rupees and Pakistan time. You do not need to do anything.",
  "",
  "One thing to know: online card payments are not available in Pakistan yet, because the card companies we work with do not operate there. Your customers can still order online and pay cash when they pick up their food or when it is delivered. Everything else — your menu, online ordering, and reservations — works normally.",
  "",
  "If anything looks wrong, just reply to this email and we will help.",
].join("\n");

async function main() {
  console.log(`To:       ${TO}`);
  console.log(`Subject:  ${SUBJECT}`);
  console.log(`Headline: ${HEADLINE}`);
  console.log("─".repeat(60));
  console.log(BODY);
  console.log("─".repeat(60));

  if (!SEND) {
    console.log("🔍 DRY RUN — nothing sent. Re-run with --send (and ALLOW_DEV_EMAIL=1 locally) to send.");
    return;
  }

  const { sendBillingNotificationEmail } = await import("../src/lib/email");
  const res = await sendBillingNotificationEmail({
    to: TO,
    restaurantName: RESTAURANT,
    subject: SUBJECT,
    headline: HEADLINE,
    body: BODY,
    ctaLabel: "Open your dashboard",
    ctaUrl: "https://feefreeordering.com/admin",
  });
  // Honest-result rule: success:true only means Resend accepted it.
  console.log("send() result:", JSON.stringify(res));
  if ((res as { success?: boolean } | undefined)?.success === false) {
    console.error("❌ Resend did NOT accept the email.");
    process.exit(1);
  }
  console.log("✅ Resend accepted the email.");
}

main().catch((e) => { console.error(e); process.exit(1); });
