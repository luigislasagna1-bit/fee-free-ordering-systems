/**
 * Splice the regenerated reservation-CMS pages (from the differentiate-reservation-pages workflow)
 * into src/data/solution-pages.ts, replacing the matching entries by slug. Run:
 *   npx tsx scripts/_splice-reservation-pages.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/w6q5sxby0.output";

const parsed = JSON.parse(readFileSync(OUT, "utf8"));
const newPages: any[] = (parsed.result || parsed).pages || [];
console.log("regenerated:", newPages.map((p) => p.slug).join(", "));
for (const p of newPages) console.log(`  ${p.slug}  metaTitle ${p.metaTitle.length} chars`);

const SP = "src/data/solution-pages.ts";
let sp = readFileSync(SP, "utf8").replace(/\r\n/g, "\n");
const m = sp.match(/export const SOLUTION_PAGES: SolutionPage\[\] = ([\s\S]*?);\n\nexport function getSolutionPage/);
if (!m) {
  console.error("FATAL: SOLUTION_PAGES array not found");
  process.exit(1);
}
const arr: any[] = JSON.parse(m[1]);
const bySlug = new Map(newPages.map((p) => [p.slug, p]));
let replaced = 0;
const merged = arr.map((p) => {
  if (bySlug.has(p.slug)) {
    replaced++;
    return bySlug.get(p.slug);
  }
  return p;
});
console.log(`replaced ${replaced} of ${newPages.length} (array still ${merged.length} pages)`);
if (replaced !== newPages.length) {
  console.error("FATAL: not every regenerated slug matched an existing entry");
  process.exit(1);
}
const out = sp.replace(
  m[0],
  `export const SOLUTION_PAGES: SolutionPage[] = ${JSON.stringify(merged, null, 2)};\n\nexport function getSolutionPage`,
);
writeFileSync(SP, out, "utf8");
console.log("✓ wrote", SP);
