/**
 * Diagnostic: send ONE real FCM push to the most-recently-registered kitchen
 * tablet, using the service-account key directly (bypasses Vercel env). Prints
 * the exact FCM response so we can tell registration vs send vs config issues.
 *   npx tsx scripts/test-push-send.ts
 */
import jwt from "jsonwebtoken";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const SA_PATH = "C:/Users/luigi/Downloads/fee-free-ordering-firebase-adminsdk-fbsvc-6609b537b8.json";
const sa = JSON.parse(readFileSync(SA_PATH, "utf8"));
sa.private_key = String(sa.private_key).replace(/\\n/g, "\n");

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

async function getToken(): Promise<{ token: string; restaurantId: string } | null> {
  for (const url of urls) {
    try {
      const sql = neon(url);
      const rows = (await sql`SELECT token, "restaurantId" FROM "KitchenPushToken" ORDER BY "lastSeenAt" DESC LIMIT 1`) as any[];
      if (rows.length) return rows[0];
    } catch { /* try next */ }
  }
  return null;
}

async function getAccessToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    sa.private_key,
    { algorithm: "RS256" },
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.log("❌ OAuth FAILED", res.status, JSON.stringify(data));
    return null;
  }
  return data.access_token;
}

async function main() {
  const tok = await getToken();
  if (!tok) {
    console.log("❌ No registered token found in any DB.");
    return;
  }
  console.log(`Token: restaurant=${tok.restaurantId}  ${tok.token.slice(0, 16)}…`);
  const at = await getAccessToken();
  if (!at) return;
  console.log("✅ OAuth OK — sending test push…");
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: tok.token,
        // data-only → exercises the custom alarm service (loud loop + full-screen),
        // matching what the server now sends on a real order.
        data: { type: "new_order", orderId: "test", title: "Test order 🔔", body: "Loud alarm test" },
        android: { priority: "high" },
      },
    }),
  });
  const txt = await res.text();
  console.log(`\nFCM HTTP ${res.status}\n${txt}`);
  if (res.ok) console.log("\n✅ SENT — check the tablet for the notification.");
}
main();
