// Build the i18n staging file for admin.exportMenu.exportPdf across all 38
// locales by MIRRORING each locale's already-translated `exportXls` value and
// swapping "XLS" → "PDF" (e.g. de "XLS exportieren" → "PDF exportieren"). This
// reuses real per-locale grammar instead of guessing a fresh translation.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const files = readdirSync("src/messages").filter((f) => f.endsWith(".json"));
const staging: Record<string, Record<string, string>> = { "admin.exportMenu.exportPdf": {} };

for (const f of files) {
  const loc = f.replace(/\.json$/, "");
  const obj = JSON.parse(readFileSync(`src/messages/${f}`, "utf8"));
  const xls: string | undefined = obj?.admin?.exportMenu?.exportXls;
  if (!xls) { console.log(`!! ${loc}: no admin.exportMenu.exportXls — skipping`); continue; }
  staging["admin.exportMenu.exportPdf"][loc] = xls.replace(/XLS/g, "PDF");
}

writeFileSync("scripts/i18n-data/exportpdf-keys.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
const n = Object.keys(staging["admin.exportMenu.exportPdf"]).length;
console.log(`wrote scripts/i18n-data/exportpdf-keys.json — exportPdf × ${n} locales`);
console.log("sample:", JSON.stringify({ en: staging["admin.exportMenu.exportPdf"].en, de: staging["admin.exportMenu.exportPdf"].de, ar: staging["admin.exportMenu.exportPdf"].ar, ja: staging["admin.exportMenu.exportPdf"].ja }));
