import { PrismaClient } from "../src/generated/prisma/client";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const useProd = process.argv.includes("--prod");
let url = process.env.DATABASE_URL!;
if (useProd) {
  const envContent = readFileSync(".env.local", "utf8");
  const commentedMatch = envContent.match(
    /^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/m
  );
  if (!commentedMatch) {
    console.error("No commented-out DATABASE_URL found in .env.local");
    process.exit(1);
  }
  url = commentedMatch[1];
  console.log("Using PROD database");
}

const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
const adapter = isNeon
  ? new PrismaNeon({ connectionString: url })
  : new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter } as any);

const RESOLUTIONS: Record<string, string> = {
  // Report 1: chicken parm sandwich availability
  cmt0ryo3j00000aks94vzfmav:
    "Fixed. The AI was incorrectly telling callers that the Chicken Parm Sandwich is only available on Thursdays — it was confusing the regular sandwich (available every day) with the Thursday special deal. The menu search logic has been updated so it no longer mixes up a daily special with the regular item when both have similar names.",

  // Report 2: robotic filler words
  cmsyszcxp00010aj56fjjod96:
    "Fixed. The AI was generating short filler words ('Yep', 'Yeah') as separate spoken phrases before the main response, with a silence gap in between — making it sound choppy and robotic. The voice system now holds these brief acknowledgements and merges them into the next sentence for more natural-sounding speech. The order itself was taken correctly.",

  // Report 3: order taken incorrectly / garbled description
  cmsv96unj000z04kzdhln92b8:
    "Investigated. The call had speech recognition difficulty hearing the caller's pasta choices (the phone audio quality made 'penne bolognese' hard to pick up). The AI asked for clarification and eventually got the right items, but the call dropped before the order could be placed. No order was charged. Voice recognition improvements are ongoing.",
};

async function main() {
  const dry = !process.argv.includes("--apply");
  if (dry) console.log("DRY RUN — pass --apply to write changes\n");

  for (const [id, resolution] of Object.entries(RESOLUTIONS)) {
    const report = await prisma.voiceCallReport.findUnique({
      where: { id },
      select: { id: true, status: true, topic: true, description: true },
    });
    if (!report) {
      console.log(`  SKIP ${id} — not found`);
      continue;
    }
    console.log(`  ${id} [${report.status}] ${report.topic}`);
    console.log(`    → Resolution: ${resolution.slice(0, 80)}...`);

    if (!dry) {
      await prisma.voiceCallReport.update({
        where: { id },
        data: {
          status: "FIXED",
          resolution,
          resolvedAt: new Date(),
        },
      });
      console.log(`    ✓ Updated to FIXED`);
    }
  }

  if (dry) console.log("\nRe-run with --apply to commit changes.");
  else console.log("\nAll reports updated to FIXED.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
