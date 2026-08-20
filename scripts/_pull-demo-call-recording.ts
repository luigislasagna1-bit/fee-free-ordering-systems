/**
 * Pull the latest demo-line call recording + transcript from the prod DB.
 * Saves the MP3 to public/marketing/nabil/demo-call.mp3 and prints the
 * transcript for rebuilding LiveCallDemo.tsx.
 *
 *   npx tsx scripts/_pull-demo-call-recording.ts
 *
 * If FFOS_TWILIO_ACCOUNT_SID + FFOS_TWILIO_AUTH_TOKEN are not set locally,
 * the script prints the Twilio recording URL so Luigi can download manually.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "fs";
import path from "path";
import https from "https";

// ── Find the prod database URL ──────────────────────────────────────────
const envContent = fs.readFileSync(".env.local", "utf-8");
const urls =
  envContent
    .match(/DATABASE_URL="([^"]+)"/g)
    ?.map((m) => m.replace(/DATABASE_URL="|"/g, "")) || [];
const prodUrl = urls.find((u) => u.includes("pooler") || u.includes("dawn-tree"));
const connectionString = prodUrl || process.env.DATABASE_URL!;
console.log(`Using DB: ...${connectionString.split("@")[1]?.split("/")[0] || "unknown"}\n`);

const DEMO_PHONE = "+12896705454";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) } as any);
  try {
    // Find the latest call to the demo number
    const call = await prisma.voiceCall.findFirst({
      where: { toNumber: DEMO_PHONE },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        callSid: true,
        fromNumber: true,
        toNumber: true,
        createdAt: true,
        durationSeconds: true,
        recordingUrl: true,
        recordingSid: true,
        recordingDurationSeconds: true,
        transcript: true,
        summary: true,
        outcome: true,
      },
    });

    if (!call) {
      console.error("No calls found for demo number", DEMO_PHONE);
      console.error("Make the demo call first, then run this script again.");
      process.exit(1);
    }

    console.log("=== LATEST DEMO CALL ===");
    console.log(`  ID:        ${call.id}`);
    console.log(`  SID:       ${call.callSid}`);
    console.log(`  From:      ${call.fromNumber}`);
    console.log(`  When:      ${call.createdAt}`);
    console.log(`  Duration:  ${call.durationSeconds}s`);
    console.log(`  Outcome:   ${call.outcome}`);
    console.log(`  Summary:   ${call.summary || "(none)"}`);
    console.log();

    // ── Print transcript ────────────────────────────────────────────────
    type Turn = { role?: string; text?: string; ts?: number | string };
    const transcript: Turn[] = (call.transcript as Turn[]) || [];
    if (transcript.length === 0) {
      console.error("No transcript found on this call.");
      console.error("The call may still be in progress or the transcript was not saved.");
      process.exit(1);
    }

    console.log("=== TRANSCRIPT ===");
    for (const turn of transcript) {
      const role = (turn.role || "?").toUpperCase().padEnd(10);
      const ts = turn.ts != null ? `[${String(turn.ts).padStart(5)}]` : "      ";
      console.log(`${ts} ${role} ${turn.text || ""}`);
    }
    console.log();

    // Write transcript JSON for reference
    const transcriptPath = path.resolve("public/marketing/nabil/demo-call-transcript.json");
    fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
    fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
    console.log(`Transcript JSON saved to: ${transcriptPath}`);

    // ── Download recording ──────────────────────────────────────────────
    if (!call.recordingUrl) {
      console.error("\nNo recording URL on this call.");
      console.error("Recording may still be processing — wait a minute and try again.");
      process.exit(1);
    }

    const sid = process.env.FFOS_TWILIO_ACCOUNT_SID;
    const token = process.env.FFOS_TWILIO_AUTH_TOKEN;

    if (!sid || !token) {
      console.log("\n=== RECORDING ===");
      console.log("Twilio credentials not available locally (FFOS_TWILIO_ACCOUNT_SID / FFOS_TWILIO_AUTH_TOKEN).");
      console.log(`Recording URL: ${call.recordingUrl}`);
      console.log(`Recording SID: ${call.recordingSid}`);
      console.log("\nTo download manually:");
      console.log("  1. Go to https://console.twilio.com/us1/monitor/logs/call-recordings");
      console.log(`  2. Find recording ${call.recordingSid}`);
      console.log("  3. Download the MP3");
      console.log("  4. Save it to: public/marketing/nabil/demo-call.mp3");
      console.log("\nOR set the env vars and re-run this script:");
      console.log('  $env:FFOS_TWILIO_ACCOUNT_SID="ACxxx"; $env:FFOS_TWILIO_AUTH_TOKEN="xxx"; npx tsx scripts/_pull-demo-call-recording.ts');
      return;
    }

    console.log("\nDownloading recording from Twilio...");
    const mp3Url = `${call.recordingUrl}.mp3`;
    const outPath = path.resolve("public/marketing/nabil/demo-call.mp3");

    await new Promise<void>((resolve, reject) => {
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const doFetch = (url: string, redirects = 0) => {
        if (redirects > 5) return reject(new Error("Too many redirects"));
        const req = https.get(url, { headers: { Authorization: `Basic ${auth}` } }, (res) => {
          // Follow redirects (Twilio 307s to storage)
          if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
            return doFetch(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Twilio returned ${res.statusCode}`));
          }
          const file = fs.createWriteStream(outPath);
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            const stats = fs.statSync(outPath);
            console.log(`Recording saved: ${outPath} (${(stats.size / 1024).toFixed(0)} KB)`);
            resolve();
          });
        });
        req.on("error", reject);
      };
      doFetch(mp3Url);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
