/**
 * Transform the translate-admin-pause-services workflow output into a staging
 * file for scripts/i18n-merge-data.ts (dotted-key → per-locale map), then:
 *   npx tsx scripts/_build-admin-pause-staging.ts
 *   npx tsx scripts/i18n-merge-data.ts admin-pause-services
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wj4zq2s4d.output";

const EN: Record<string, string> = {
  title: "Pause services",
  description: "Temporarily stop taking new orders for a service when the kitchen is slammed — it auto-resumes when the time is up, or tap Resume.",
  pickServices: "Pick services",
  noServices: "No services are enabled yet.",
  duration30: "30 min",
  duration1h: "1 hour",
  duration2h: "2 hours",
  restOfDay: "Rest of day",
  pauseFor: "Pause {duration}",
  resumeNow: "Resume now",
  pausedUntil: "paused until {time}",
  pickFirst: "Pick at least one service first.",
  pausedToast: "Services paused",
  resumedToast: "Services resumed",
  saving: "Saving…",
};

const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
console.log("translations received:", translations.length);

// Placeholder guard — drop a locale's value back to en if it dropped {duration}/{time}.
const PH: Record<string, string[]> = { pauseFor: ["{duration}"], pausedUntil: ["{time}"] };

const staging: Record<string, Record<string, string>> = {};
for (const k of Object.keys(EN)) {
  const dotted = `admin.services.pause.${k}`;
  staging[dotted] = { en: EN[k] };
  for (const t of translations) {
    let v = t[k];
    if (!v) v = EN[k];
    for (const ph of PH[k] ?? []) if (!v.includes(ph)) { console.warn(`  ⚠ ${t.locale}.${k} missing ${ph} → en`); v = EN[k]; }
    staging[dotted][t.locale] = v;
  }
}

writeFileSync("scripts/i18n-data/admin-pause-services.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/admin-pause-services.json — ${Object.keys(staging).length} keys × ${translations.length + 1} locales`);
