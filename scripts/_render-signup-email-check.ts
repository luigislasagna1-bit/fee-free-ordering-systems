/** DEV check: render SignupConfirmation and assert the Play-link "What's next"
 *  item is present (and points at the real listing). No email is sent.
 *  Dynamic imports so dotenv runs BEFORE src/lib/db.ts's module-scope client
 *  (static imports are hoisted above the config() calls). */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { renderEmail } = await import("../src/emails/render");
  const SignupConfirmation = (await import("../src/emails/templates/SignupConfirmation")).default;
  const { APP_LINKS } = await import("../src/lib/app-links");
  const React = (await import("react")).default;

  const html = await renderEmail(
    React.createElement(SignupConfirmation as any, {
      ownerName: "Luigi",
      restaurantName: "Luigi's Lasagna & Pizzeria",
      loginUrl: "https://feefreeordering.com/login",
      verifyUrl: "https://feefreeordering.com/api/auth/verify-email?token=test",
      referredBy: null,
    }),
  );
  const hasLink = APP_LINKS.kitchen.play ? html.includes(APP_LINKS.kitchen.play) : false;
  const hasText = html.includes("Kitchen Order App for Android");
  console.log("play url in html:", hasLink);
  console.log("install item text:", hasText);
  if (!hasLink || !hasText) { console.error("FAIL"); process.exit(1); }
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
