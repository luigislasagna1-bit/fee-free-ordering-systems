/**
 * READ-ONLY: what exact Voice webhook URL does Twilio have on file for the
 * Nabil number? Signature validation hashes the URL Twilio REQUESTED, so this
 * must match what the route reconstructs from x-forwarded-proto/host, or every
 * genuine call 403s the moment enforcement turns on.
 *   npx tsx scripts/_diag-twilio-webhook-url-2026-08-10.ts
 * Prints URLs + whether an auth token is configured. Never prints secrets.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const sid = process.env.FFOS_TWILIO_ACCOUNT_SID || "";
  const token = process.env.FFOS_TWILIO_AUTH_TOKEN || "";
  console.log("account sid present:", !!sid, sid ? `(${sid.slice(0, 6)}…)` : "");
  console.log("auth token present:", !!token, token ? `(len ${token.length})` : "");
  if (!sid || !token) {
    console.log("-> cannot query Twilio locally; check Vercel env for both vars before deploy.");
    return;
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=50`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!res.ok) {
    console.log("Twilio API error", res.status, (await res.text()).slice(0, 300));
    return;
  }
  const json: any = await res.json();
  for (const n of json.incoming_phone_numbers || []) {
    console.log("\nnumber:", n.phone_number, "| friendly:", n.friendly_name);
    console.log("  voiceUrl:      ", n.voice_url);
    console.log("  voiceMethod:   ", n.voice_method);
    console.log("  voiceFallback: ", n.voice_fallback_url || "(none)");
    console.log("  statusCallback:", n.status_callback || "(none)");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
