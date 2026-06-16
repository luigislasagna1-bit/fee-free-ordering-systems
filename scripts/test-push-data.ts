/**
 * Diagnostic: send a DATA-ONLY high-priority push (exercises the native
 * KitchenMessagingService → OrderAlarmService path) so we can watch logcat and
 * see exactly why the looping alarm doesn't fire from deep sleep.
 *   npx tsx scripts/test-push-data.ts
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

async function getToken() {
  for (const url of urls) {
    try {
      const sql = neon(url);
      const rows = (await sql`SELECT token FROM "KitchenPushToken" ORDER BY "lastSeenAt" DESC LIMIT 1`) as any[];
      if (rows.length) return rows[0].token as string;
    } catch { /* next */ }
  }
  return null;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    sa.private_key, { algorithm: "RS256" },
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json();
  return res.ok ? data.access_token : null;
}

async function main() {
  const token = await getToken();
  if (!token) { console.log("no token"); return; }
  const at = await getAccessToken();
  if (!at) { console.log("oauth failed"); return; }
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        data: { type: "new_order", orderId: "diag", title: "Diag order", body: "diagnostic" },
        android: { priority: "high" },
      },
    }),
  });
  console.log(`FCM ${res.status} ${await res.text()}`);
}
main();
