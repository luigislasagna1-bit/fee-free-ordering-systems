/**
 * Send explanation email to Muhammad Zeeshan about his incomplete orders.
 * Run: npx tsx scripts/_send-checkout-explanation-email.ts
 */
import { sendMarketingEmail } from "../src/lib/email";

async function main() {
  const email = "hihassam@gmail.com";
  const customerName = "Muhammad";

  const subject = "Your Luigi's Lasagna & Pizzeria orders";
  const html = `
    <p>Hi ${customerName},</p>
    <p>Thanks for reaching out about your recent orders — we really appreciate you letting us know.</p>
    <p><strong>Here's what happened:</strong></p>
    <p>On August 17th, you placed three orders with us. One completed successfully and was processed (#ORD-459250906, $22.00). However, the other two orders were started but not completed at checkout — which means the payment step was never finished, so we didn't charge your card or prepare those orders in the kitchen.</p>
    <p>This sometimes happens when customers get interrupted during checkout or decide to make changes to their order. The good news: your card was never charged for the incomplete orders, and you're free to place a fresh order whenever you're ready.</p>
    <p><strong>If you'd like to create an account with us,</strong> you can sign up at <a href="https://luigislasagna.com">luigislasagna.com</a> — this way we can track your order history and preferences, and remember you for next time.</p>
    <p>Thanks again for your patience, and we look forward to your next order!</p>
    <p>Best,<br>Luigi's Lasagna & Pizzeria</p>
  `;

  console.log(`Sending email to ${email}...`);
  const result = await sendMarketingEmail({
    to: email,
    subject,
    html,
  });
  console.log("Email sent successfully:", JSON.stringify(result, null, 2));
}

main().catch(e => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
